import { getError } from '@venizia/ignis-helpers/core';
import type { IDeprecatedModelMetadata, IModelMetadata } from '@/helpers/inversion';
import { ModelTypes } from '../models/common/constants';

/** The release that drops the deprecated `skipMigrate` key. */
export const DEPRECATED_MODEL_METADATA_REMOVED_IN = '0.4.4';

/**
 * The one place the `@model` metadata outside `settings` is checked and normalised.
 *
 * - `type` is optional; a value must be one of {@link ModelTypes}.
 * - `skipMigrate` (deprecated) becomes `migration: { use: !skipMigrate }`, and is reported so the
 *   application warns once at boot. Setting both `skipMigrate` and `migration` throws.
 * - When the model declares either, the registry entry carries BOTH `migration` and a derived
 *   `skipMigrate`, so consumer tooling that reads `metadata.skipMigrate` keeps working this release.
 */
export const normalizeModelMetadata = (opts: {
  model: string;
  metadata: IModelMetadata;
}): IModelMetadata => {
  const { model, metadata } = opts;
  const { type, skipMigrate, migration } = metadata;

  if (type !== undefined && !ModelTypes.isValid(type)) {
    throw getError({
      message: `[model][${model}] Invalid 'type' | Expected one of: ${[...ModelTypes.SCHEME_SET].join(', ')} (or leave it out) | Got: ${String(type)}`,
    });
  }

  if (skipMigrate !== undefined && migration !== undefined) {
    throw getError({
      message: `[model][${model}] skipMigrate and migration are both set | skipMigrate is the deprecated name of migration.use (inverted) | keep migration and remove skipMigrate`,
    });
  }

  if (skipMigrate === undefined && migration === undefined) {
    return metadata;
  }

  const deprecatedMetadata: IDeprecatedModelMetadata[] = [];
  let use: boolean;

  if (skipMigrate !== undefined) {
    use = !skipMigrate;
    deprecatedMetadata.push({
      key: 'skipMigrate',
      use: skipMigrate
        ? 'migration: { use: false }'
        : 'migration: { use: true } (or no key, true is the default)',
    });
  } else {
    use = migration?.use !== false;
  }

  return {
    ...metadata,
    migration: { ...migration, use },
    skipMigrate: !use,
    ...(deprecatedMetadata.length > 0 ? { deprecatedMetadata } : {}),
  };
};
