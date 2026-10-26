import { getError } from '@venizia/ignis-helpers/core';
import type { IModelMetadata } from '@/helpers/inversion';
import { ModelTypes } from '../models/common/constants';

/**
 * The one place the `@model` metadata outside `settings` is checked and normalised.
 *
 * - `type` is optional; a value must be one of {@link ModelTypes}.
 * - `skipMigrate` is gone (0.4.4): the decorator throws on it and names the replacement, the way it
 *   does for the flat settings keys removed in 0.4.3. The check reads the key by name because an
 *   untyped caller, or a model written before the removal, never meets the type error.
 * - When the model declares `migration`, the registry entry carries it with `use` filled in.
 */
export const normalizeModelMetadata = (opts: {
  model: string;
  metadata: IModelMetadata;
}): IModelMetadata => {
  const { model, metadata } = opts;
  const { type, migration } = metadata;

  if (type !== undefined && !ModelTypes.isValid(type)) {
    throw getError({
      message: `[model][${model}] Invalid 'type' | Expected one of: ${[...ModelTypes.SCHEME_SET].join(', ')} (or leave it out) | Got: ${String(type)}`,
    });
  }

  if ('skipMigrate' in metadata) {
    const replacement =
      metadata.skipMigrate === false
        ? 'remove the key (migration.use is true by default)'
        : 'write migration: { use: false }';

    throw getError({
      message: `[model][${model}] skipMigrate was removed in 0.4.4 | ${replacement} | run \`bunx devz codemod model-settings --write\` to rewrite every model`,
    });
  }

  if (migration === undefined) {
    return metadata;
  }

  return { ...metadata, migration: { ...migration, use: migration.use !== false } };
};
