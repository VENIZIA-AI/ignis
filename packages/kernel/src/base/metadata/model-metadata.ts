import { HTTP } from '@venizia/ignis-helpers/common';
import { getError, RecordUtility } from '@venizia/ignis-helpers/core';
import type { IModelMetadata, IModelMigrationSettings } from '@/helpers/inversion';
import { ModelTypes } from '../models/common/constants';
import { ToggleUtility } from '@/utilities/toggle.utility';

export class ModelMetadataUtility {
  /**
   * The one place the `@model` metadata outside `settings` is checked and normalised.
   *
   * - `type` is optional; a value must be one of {@link ModelTypes}.
   * - `migration` must be a plain object whose `use`, when set, is a boolean; anything else throws.
   * - The old keys (`skipMigrate`, and the flat `defaultFilter`, `defaultLimit`, `maxLimit`, `scopeFilter` of `settings`)
   *   are not read: the types refuse them as excess properties, and an untyped caller's key is ignored.
   * - When the model declares `migration`, the registry entry carries it with `use` filled in.
   */
  static normalizeModelMetadata(opts: { model: string; metadata: IModelMetadata }): IModelMetadata {
    const { model, metadata } = opts;
    const { type, migration } = metadata;

    if (type !== undefined && !ModelTypes.isValid(type)) {
      throw getError({
        message: `[model][${model}] Invalid 'type' | Expected one of: ${ModelTypes.values().join(', ')} (or leave it out) | Got: ${String(type)}`,
      });
    }

    if (migration === undefined) {
      return metadata;
    }

    if (!RecordUtility.isPlainObject(migration)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[model][${model}] migration must be a plain object, such as { use: false }`,
      });
    }

    // The guard widens `use` to `unknown`; the declared type is what `isUsed` takes. Left out, `use` is on.
    const settings: IModelMigrationSettings = migration;
    const use =
      settings.use === undefined ||
      ToggleUtility.isUsed({ use: settings.use }, { name: `[model][${model}] migration` });

    return { ...metadata, migration: { ...migration, use } };
  }
}
