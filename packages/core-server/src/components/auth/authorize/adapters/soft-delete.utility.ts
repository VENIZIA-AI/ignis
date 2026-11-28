import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { ToggleUtility } from '@venizia/ignis-kernel';
import type { IScopedCasbinEntities } from './common';

/** The `entities.softDelete` setting of the scoped casbin queries. */
export class ScopedCasbinSoftDelete {
  /** Refuses, where the adapter is built, a setting its queries could not use. */
  static assert(opts: { scope: string; softDelete: IScopedCasbinEntities['softDelete'] }) {
    const { scope, softDelete } = opts;
    const name = `[${scope}] entities.softDelete`;

    if (!ToggleUtility.isUsed(softDelete, { name })) {
      return;
    }

    const columnName: unknown = softDelete.columnName;

    if (typeof columnName !== 'string' || columnName === '') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `${name}.columnName must be a non-empty string when use is true | columnName: ${typeof columnName}`,
      });
    }
  }
}
