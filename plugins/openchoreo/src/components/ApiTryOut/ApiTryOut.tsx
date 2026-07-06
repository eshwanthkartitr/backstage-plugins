import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactElement,
} from 'react';
import Box from '@material-ui/core/Box';
import Typography from '@material-ui/core/Typography';
import { makeStyles, type Theme } from '@material-ui/core/styles';
import { ApiEntityV1alpha1 } from '@backstage/catalog-model';
import { EmptyState, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  apiDocsConfigRef,
  OpenApiDefinitionWidget,
} from '@backstage/plugin-api-docs';
import { useEntity } from '@backstage/plugin-catalog-react';
import { CHOREO_ANNOTATIONS } from '@openchoreo/backstage-plugin-common';
import {
  EnvironmentFilter,
  type Environment as FilterEnvironment,
} from '@openchoreo/backstage-plugin-react';
import { parse } from 'yaml';
import {
  useEnvironmentData,
  type Environment,
} from '../Environments/hooks/useEnvironmentData';
import { derivePrimaryUrl } from '../Environments/utils/invokeUrlUtils';

/**
 * State bridged from the ApiTryOut component into the connection panel that
 * SwaggerUI renders inside its own layout (near the servers). React context
 * crosses into SwaggerUI's tree because the widget is rendered within the
 * provider below.
 */
interface ConnectionContextValue {
  environments: Environment[];
  filterEnvs: FilterEnvironment[];
  filterSelected: FilterEnvironment | null;
  onSelect: (name: string | null) => void;
  loading: boolean;
  isForbidden: boolean;
  activeUrl?: string;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

/**
 * Rewrites the OpenAPI definition's server/base URL so Swagger's "Try it out"
 * fires requests at `url` (the environment's public gateway invoke URL). The
 * operation/resource paths are appended to this base by SwaggerUI.
 *
 * Handles OpenAPI 3.x (`servers`) as the primary case and OpenAPI 2.0
 * (`host`/`basePath`/`schemes`) best-effort. Any parse failure falls back to
 * the original definition unchanged.
 */
function withServerUrl(definition: string, url: string): string {
  try {
    const doc = parse(definition);
    if (!doc || typeof doc !== 'object') {
      return definition;
    }
    const swaggerVersion = (doc as { swagger?: unknown }).swagger;
    if (typeof swaggerVersion === 'string' && swaggerVersion.startsWith('2')) {
      const parsed = new URL(url);
      (doc as Record<string, unknown>).host = parsed.host;
      (doc as Record<string, unknown>).basePath = parsed.pathname || '/';
      (doc as Record<string, unknown>).schemes = [
        parsed.protocol.replace(':', ''),
      ];
    } else {
      (doc as Record<string, unknown>).servers = [{ url }];
    }
    return JSON.stringify(doc);
  } catch {
    return definition;
  }
}

/** Resolve the invoke base URL for a specific environment + endpoint name. */
function resolveEnvUrl(
  env: Environment,
  endpointName: string | undefined,
): string | undefined {
  if (env.endpoints.length === 0) {
    return undefined;
  }
  const match = endpointName
    ? env.endpoints.find(e => e.name === endpointName)
    : undefined;
  const endpoints = match ? [match] : env.endpoints;
  return derivePrimaryUrl(endpoints)?.url;
}

const usePanelStyles = makeStyles((theme: Theme) => ({
  root: {
    margin: theme.spacing(0, 2, 2),
    padding: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.default,
  },
  heading: {
    fontWeight: 500,
    marginBottom: theme.spacing(1),
  },
  selector: {
    maxWidth: 320,
  },
  authArea: {
    marginTop: theme.spacing(2),
    paddingTop: theme.spacing(2),
    borderTop: `1px dashed ${theme.palette.divider}`,
  },
}));

/**
 * The connection settings area rendered near the servers section inside the
 * SwaggerUI layout. Holds the environment selector and reserves space for
 * upcoming authentication inputs (token endpoint, client id/secret, API key).
 */
const TryOutConnectionPanel = () => {
  const classes = usePanelStyles();
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    return null;
  }

  const { environments, filterEnvs, filterSelected, onSelect, loading, isForbidden, activeUrl } =
    ctx;

  let urlCaption = '';
  if (activeUrl) {
    urlCaption = `Requests are sent to ${activeUrl}`;
  } else if (filterSelected) {
    urlCaption = 'No public URL is exposed for this environment.';
  }

  const renderSelector = () => {
    if (loading) {
      return <Progress />;
    }
    if (isForbidden) {
      return (
        <Typography variant="body2" color="textSecondary">
          You don't have access to environment URLs. Testing against the
          definition's own servers.
        </Typography>
      );
    }
    if (environments.length === 0) {
      return (
        <Typography variant="body2" color="textSecondary">
          No environments found. Testing against the definition's own servers.
        </Typography>
      );
    }
    return (
      <>
        <Box className={classes.selector}>
          <EnvironmentFilter
            environments={filterEnvs}
            value={filterSelected}
            onChange={next => onSelect(next?.name ?? null)}
            isEnvDisabled={env =>
              (environments.find(e => e.name === env.name)?.endpoints.length ??
                0) === 0
            }
            disabledTooltip="Not deployed to this environment"
          />
        </Box>
        <Typography variant="caption" color="textSecondary">
          {urlCaption}
        </Typography>
      </>
    );
  };

  return (
    <div className={classes.root}>
      <Typography variant="subtitle2" className={classes.heading}>
        Connection
      </Typography>
      {renderSelector()}
      <div className={classes.authArea}>
        <Typography variant="subtitle2" className={classes.heading}>
          Authentication
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Token endpoint, client credentials, and API key configuration coming
          soon.
        </Typography>
      </div>
    </div>
  );
};

/**
 * SwaggerUI plugin that injects the connection panel immediately after the API
 * info block (title/description), i.e. right where the servers are shown.
 */
const connectionPlugin = {
  wrapComponents: {
    info:
      (Original: ComponentType<Record<string, unknown>>) =>
      (props: Record<string, unknown>): ReactElement =>
        (
          <>
            <Original {...props} />
            <TryOutConnectionPanel />
          </>
        ),
  },
};

const CONNECTION_PLUGINS = [connectionPlugin];

// The stock widget forwards arbitrary props (including `plugins`) straight to
// SwaggerUI, but only declares three in its public type — widen it here.
const OpenApiConsole = OpenApiDefinitionWidget as unknown as ComponentType<{
  definition: string;
  plugins?: unknown[];
}>;

/**
 * Environment-aware "Try Out" console for API entities.
 *
 * For OpenAPI entities it renders a connection panel (with an environment
 * dropdown) inside the SwaggerUI layout near the servers; selecting an
 * environment points the console at that environment's public API-gateway
 * invoke URL so requests hit the deployed gateway. For other API types it
 * falls back to the stock widget, and to a graceful empty state when no
 * interactive widget exists.
 */
export const ApiTryOut = () => {
  const { entity } = useEntity();
  const config = useApi(apiDocsConfigRef);
  const { environments, loading, isForbidden } = useEnvironmentData(entity);

  const definition = entity.spec?.definition as string | undefined;
  const definitionWidget = definition
    ? config.getApiDefinitionWidget(entity as ApiEntityV1alpha1)
    : undefined;
  const isOpenApi = entity.spec?.type === 'openapi';

  const namespace =
    entity.metadata.annotations?.[CHOREO_ANNOTATIONS.NAMESPACE] ?? '';
  const endpointName =
    entity.metadata.annotations?.[CHOREO_ANNOTATIONS.ENDPOINT_NAME];

  const [selected, setSelected] = useState<Environment | null>(null);

  // Default to the first environment that has a deployed (URL-bearing) endpoint.
  useEffect(() => {
    if (selected || environments.length === 0) {
      return;
    }
    const firstDeployed =
      environments.find(e => e.endpoints.length > 0) ?? environments[0];
    setSelected(firstDeployed);
  }, [environments, selected]);

  const filterEnvs: FilterEnvironment[] = useMemo(
    () =>
      environments.map(e => ({
        name: e.name,
        displayName: e.name,
        namespace,
      })),
    [environments, namespace],
  );

  const activeUrl = useMemo(
    () => (selected ? resolveEnvUrl(selected, endpointName) : undefined),
    [selected, endpointName],
  );

  const effectiveDefinition = useMemo(() => {
    if (!definition) {
      return undefined;
    }
    return activeUrl ? withServerUrl(definition, activeUrl) : definition;
  }, [definition, activeUrl]);

  const contextValue: ConnectionContextValue = useMemo(
    () => ({
      environments,
      filterEnvs,
      filterSelected: selected
        ? filterEnvs.find(e => e.name === selected.name) ?? null
        : null,
      onSelect: (name: string | null) =>
        setSelected(
          name ? environments.find(e => e.name === name) ?? null : null,
        ),
      loading,
      isForbidden,
      activeUrl,
    }),
    [environments, filterEnvs, selected, loading, isForbidden, activeUrl],
  );

  // No interactive widget for this API type (or no definition at all).
  if (!definition || !definitionWidget) {
    return (
      <EmptyState
        missing="info"
        title="Try Out not available"
        description="This API type doesn't support interactive testing."
      />
    );
  }

  // Non-OpenAPI widgets: render the stock widget without gateway targeting.
  if (!isOpenApi) {
    return <>{definitionWidget.component(definition)}</>;
  }

  return (
    <ConnectionContext.Provider value={contextValue}>
      <OpenApiConsole
        definition={effectiveDefinition ?? definition}
        plugins={CONNECTION_PLUGINS}
      />
    </ConnectionContext.Provider>
  );
};
