import type { ILogger } from '@venizia/ignis-helpers/core';
import { MetadataRegistry } from '@/helpers/inversion';
import { DEPRECATED_MODEL_METADATA_REMOVED_IN } from '../metadata/model-metadata';

/**
 * One warning per deprecated `@model` metadata key a model still uses, naming the model, the old
 * key, the key that replaces it and the release that removes it. Read from what the decorator
 * recorded, so it covers models registered by components and auto-discovery too.
 */
export const warnDeprecatedModelMetadata = (opts: { logger: ILogger }): number => {
  const { logger } = opts;
  let count = 0;

  for (const [name, entry] of MetadataRegistry.getInstance().getAllModels()) {
    for (const { key, use } of entry.metadata?.deprecatedMetadata ?? []) {
      logger.warn(
        '[deprecated] model %s uses %s | use %s instead | removed in %s',
        name,
        key,
        use,
        DEPRECATED_MODEL_METADATA_REMOVED_IN,
      );
      count += 1;
    }
  }

  return count;
};
