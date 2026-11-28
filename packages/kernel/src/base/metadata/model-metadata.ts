import { getError } from '@venizia/ignis-helpers/core';
import type { IModelMetadata } from '@/helpers/inversion';
import { ModelTypes } from '../models/common/constants';
import { ToggleUtility } from '@/utilities/toggle.utility';

export class ModelMetadataUtility {
  /**
   * The one place the `@model` metadata outside `settings` is checked and normalised.
   *
   * - `type` is optional; a value must be one of {@link ModelTypes}.
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

    // An object that leaves `use` out is on; what is not an object goes to `isUsed`, which refuses it.
    const use =
      typeof migration === 'object' && migration !== null
        ? migration.use === undefined || ToggleUtility.isUsed({ use: migration.use })
        : ToggleUtility.isUsed(migration);

    return { ...metadata, migration: { ...migration, use } };
  }
}
