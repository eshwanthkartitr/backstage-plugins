import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactElement,
} from 'react';
import Box from '@material-ui/core/Box';
import IconButton from '@material-ui/core/IconButton';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import { EmptyState, Progress } from '@backstage/core-components';
import { OpenApiDefinitionWidget } from '@backstage/plugin-api-docs';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  Card,
  darkTokens,
  lightTokens,
} from '@openchoreo/backstage-design-system';
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
import { TryOutAuthFields } from './TryOutAuthFields';
import { useTryOutAuth, type TryOutAuth } from './useTryOutAuth';

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
  activeUrl?: string;
  auth: TryOutAuth;
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

const usePanelStyles = makeStyles(theme => ({
  card: {
    // No horizontal margin so the card's left/right edges line up with the
    // OpenAPI title and operations in the SwaggerUI layout.
    margin: theme.spacing(2, 0),
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '12px !important',
    border: `1px solid ${
      theme.palette.type === 'dark'
        ? darkTokens.border.subtle
        : lightTokens.grey[100]
    } !important`,
    boxShadow: `${
      theme.palette.type === 'dark'
        ? darkTokens.shadow.card
        : lightTokens.shadow.card
    } !important`,
  },
  selector: {
    maxWidth: 320,
  },
  endpointRow: {
    marginTop: theme.spacing(2),
  },
  endpointLabel: {
    display: 'block',
    // Match the auth field labels (Header name / API key value).
    fontSize: '12px !important',
    fontWeight: '500 !important' as unknown as number,
    color: `${theme.palette.text.secondary} !important`,
    marginBottom: theme.spacing(0.5),
  },
  inlineUrlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    minWidth: 0,
  },
  inlineUrl: {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    color: theme.palette.primary.main,
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    flex: 1,
  },
  authArea: {
    marginTop: theme.spacing(2),
    paddingTop: theme.spacing(2),
    borderTop: `1px dashed ${theme.palette.divider}`,
  },
  authHeading: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
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

  const { environments, filterEnvs, filterSelected, onSelect, activeUrl, auth } =
    ctx;

  // The panel only renders once the console is shown, which the top-level
  // ApiTryOut guards already gate on a deployed, accessible environment — so the
  // selector can render unconditionally here.
  const renderSelector = () => {
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
        <Box className={classes.endpointRow}>
          <Typography variant="caption" className={classes.endpointLabel}>
            Endpoint
          </Typography>
          {activeUrl ? (
            <Box className={classes.inlineUrlRow}>
              <Tooltip title={activeUrl}>
                <a
                  href={activeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={classes.inlineUrl}
                >
                  {activeUrl}
                </a>
              </Tooltip>
              <Tooltip title="Copy URL">
                <IconButton
                  size="small"
                  aria-label="Copy URL"
                  onClick={() =>
                    // Best-effort — clipboard access may be unavailable
                    // (insecure context / denied); swallow the rejection.
                    navigator.clipboard
                      ?.writeText(activeUrl)
                      .catch(() => undefined)
                  }
                >
                  <FileCopyOutlinedIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Box>
          ) : (
            <Typography variant="body2" color="textSecondary">
              No public URL is exposed for this environment.
            </Typography>
          )}
        </Box>
      </>
    );
  };

  return (
    <Card padding={24} className={classes.card}>
      <Typography variant="subtitle2" className={classes.authHeading}>
        Connection
      </Typography>
      {renderSelector()}
      <div className={classes.authArea}>
        <Typography variant="subtitle2" className={classes.authHeading}>
          Authentication
        </Typography>
        <TryOutAuthFields {...auth} />
      </div>
    </Card>
  );
};

/**
 * SwaggerUI plugin that (a) injects the connection panel immediately after the
 * API info block (title/description) — i.e. where the servers used to be — and
 * (b) suppresses SwaggerUI's native "Servers" selector, since the target
 * endpoint is now surfaced in the connection panel instead.
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
  components: {
    Servers: () => null,
    ServersContainer: () => null,
  },
};

const CONNECTION_PLUGINS = [connectionPlugin];

// SwaggerUI still renders the (now-empty) `.scheme-container` bar because the
// spec declares servers; hide it since the endpoint is shown in the panel.
const useConsoleStyles = makeStyles({
  root: {
    '& .scheme-container': {
      display: 'none',
    },
  },
});

// The stock widget forwards arbitrary props (including `plugins` and
// `requestInterceptor`) straight to SwaggerUI — widen the public type here.
interface SwaggerRequest {
  headers?: Record<string, string>;
}

const OpenApiConsole = OpenApiDefinitionWidget as unknown as ComponentType<{
  definition: string;
  plugins?: unknown[];
  requestInterceptor?: (req: SwaggerRequest) => SwaggerRequest;
}>;

// GraphiQL is a large bundle; load it only when a GraphQL API is opened.
const GraphQlConsole = lazy(() => import('./GraphQlConsole'));

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
  const consoleClasses = useConsoleStyles();
  const { environments, loading, isForbidden } = useEnvironmentData(entity);
  const auth = useTryOutAuth();

  const definition = entity.spec?.definition as string | undefined;
  const isOpenApi = entity.spec?.type === 'openapi';
  const isGraphQl = entity.spec?.type === 'graphql';

  const namespace =
    entity.metadata.annotations?.[CHOREO_ANNOTATIONS.NAMESPACE] ?? '';
  const endpointName =
    entity.metadata.annotations?.[CHOREO_ANNOTATIONS.ENDPOINT_NAME];

  const [selected, setSelected] = useState<Environment | null>(null);

  // Keep the selection in sync with the (re)fetched environments: default to the
  // first deployed (URL-bearing) environment, re-point to the refreshed object
  // when the selected one still exists (its endpoints may have changed), and
  // re-default when it has been removed — so activeUrl never derives from a
  // stale environment object.
  useEffect(() => {
    if (environments.length === 0) {
      if (selected) {
        setSelected(null);
      }
      return;
    }
    const match = selected
      ? environments.find(e => e.name === selected.name)
      : undefined;
    if (match) {
      if (match !== selected) {
        setSelected(match);
      }
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

  // Whether the component is deployed to at least one environment. An
  // environment with endpoints is "deployed" here (matching the "Not deployed
  // to this environment" rule used by the environment selector below). Without
  // any deployment there is no running API to invoke, so the console is
  // replaced by a banner instead of falling back to the definition's servers.
  const hasDeployment = useMemo(
    () => environments.some(e => e.endpoints.length > 0),
    [environments],
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
      activeUrl,
      auth,
    }),
    [environments, filterEnvs, selected, activeUrl, auth],
  );

  // Stable interceptor: reads the latest auth headers from the ref at request
  // time, so editing the auth form never re-initializes the SwaggerUI instance.
  const authHeadersRef = auth.headersRef;
  const requestInterceptor = useMemo(
    () => (req: SwaggerRequest) => {
      req.headers = { ...(req.headers ?? {}), ...authHeadersRef.current };
      return req;
    },
    [authHeadersRef],
  );

  // No definition at all — nothing to render.
  if (!definition) {
    return (
      <EmptyState
        missing="info"
        title="Try Out not available"
        description="This API has no definition."
      />
    );
  }

  // Only OpenAPI (SwaggerUI) and GraphQL have interactive, environment-aware
  // consoles. Every other API type shows a notice — the raw schema is still
  // available on the Definition tab.
  if (!isOpenApi && !isGraphQl) {
    return (
      <EmptyState
        missing="info"
        title="Try Out not available"
        description="Interactive testing isn't available for this API type yet."
      />
    );
  }

  // Environment data is still loading — wait before deciding whether anything
  // is deployed, so the banners below never flash mid-load.
  if (loading) {
    return <Progress />;
  }

  // Without access to environment URLs there is no gateway to target, so an
  // interactive console can't be offered.
  if (isForbidden) {
    return (
      <EmptyState
        missing="info"
        title="Environment access required"
        description="You don't have access to environment URLs for this API. Contact your administrator to request access."
      />
    );
  }

  // Nothing is deployed to any environment, so there is no running API to try
  // out against.
  if (!hasDeployment) {
    return (
      <EmptyState
        missing="data"
        title="No deployments available"
        description="This API isn't deployed to any environment yet. Go to the Deploy tab and deploy the component to try out its API."
      />
    );
  }

  // GraphQL: dedicated, environment-aware GraphiQL console (doesn't use the
  // stock api-docs widget). The connection panel renders above the IDE.
  if (isGraphQl) {
    return (
      <ConnectionContext.Provider value={contextValue}>
        <TryOutConnectionPanel />
        <Suspense fallback={<Progress />}>
          <GraphQlConsole
            url={activeUrl}
            definition={definition}
            headersRef={auth.headersRef}
          />
        </Suspense>
      </ConnectionContext.Provider>
    );
  }

  return (
    <ConnectionContext.Provider value={contextValue}>
      <div className={consoleClasses.root}>
        <OpenApiConsole
          definition={effectiveDefinition ?? definition}
          plugins={CONNECTION_PLUGINS}
          requestInterceptor={requestInterceptor}
        />
      </div>
    </ConnectionContext.Provider>
  );
};
