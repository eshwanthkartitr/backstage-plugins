import { ApiEntityV1alpha1 } from '@backstage/catalog-model';
import { WarningPanel } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  apiDocsConfigRef,
  PlainApiDefinitionWidget,
} from '@backstage/plugin-api-docs';
import { useEntity } from '@backstage/plugin-catalog-react';

/**
 * Renders the raw, copyable API definition (the "Definition" tab).
 *
 * This is the raw-text half of the stock `@backstage/plugin-api-docs`
 * `ApiDefinitionCard`, promoted to its own top-level tab.
 */
export const ApiRawDefinitionCard = () => {
  const { entity } = useEntity();
  const config = useApi(apiDocsConfigRef);

  const definition = entity.spec?.definition as string | undefined;
  if (!definition) {
    return (
      <WarningPanel title="No API definition available for this entity." />
    );
  }

  const definitionWidget = config.getApiDefinitionWidget(
    entity as ApiEntityV1alpha1,
  );
  const language =
    definitionWidget?.rawLanguage ?? (entity.spec?.type as string);

  return (
    <PlainApiDefinitionWidget definition={definition} language={language} />
  );
};
