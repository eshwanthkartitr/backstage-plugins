import { useEffect, useMemo, useState } from 'react';
import Box from '@material-ui/core/Box';
import Typography from '@material-ui/core/Typography';
import { ApiEntityV1alpha1 } from '@backstage/catalog-model';
import {
  EmptyState,
  InfoCard,
  Progress,
} from '@backstage/core-components';
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

/**
 * Environment-aware "Try Out" console for API entities.
 *
 * For OpenAPI entities it renders an environment dropdown; selecting an
 * environment points the Swagger console at that environment's public
 * API-gateway invoke URL so requests hit the deployed gateway. For other API
 * types it falls back to the stock widget (no interactive gateway targeting),
 * and to a graceful empty state when no interactive widget exists.
 */
export const ApiTryOut = () => {
  const { entity } = useEntity();
  const config = useApi(apiDocsConfigRef);
  const {
    environments,
    loading,
    isForbidden,
  } = useEnvironmentData(entity);

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
    return (
      <InfoCard title="Try Out">
        {definitionWidget.component(definition)}
      </InfoCard>
    );
  }

  const filterSelected: FilterEnvironment | null = selected
    ? filterEnvs.find(e => e.name === selected.name) ?? null
    : null;

  let subtitle: string | undefined;
  if (activeUrl) {
    subtitle = `Requests are sent to ${activeUrl}`;
  } else if (selected) {
    subtitle = 'No public URL is exposed for this environment.';
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
      <EnvironmentFilter
        environments={filterEnvs}
        value={filterSelected}
        onChange={next =>
          setSelected(
            next ? environments.find(e => e.name === next.name) ?? null : null,
          )
        }
        isEnvDisabled={env =>
          (environments.find(e => e.name === env.name)?.endpoints.length ??
            0) === 0
        }
        disabledTooltip="Not deployed to this environment"
      />
    );
  };

  return (
    <InfoCard title="Try Out" subheader={subtitle}>
      <Box mb={2} maxWidth={320}>
        {renderSelector()}
      </Box>
      <OpenApiDefinitionWidget definition={effectiveDefinition ?? definition} />
    </InfoCard>
  );
};
