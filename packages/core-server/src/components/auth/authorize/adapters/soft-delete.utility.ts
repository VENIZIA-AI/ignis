import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { ToggleUtility } from '@venizia/ignis-kernel';
import { sql, type SQL } from 'drizzle-orm';
import type { IScopedCasbinEntities } from './common';

/** The `entities.softDelete` setting of the scoped casbin queries. */
export class ScopedCasbinSoftDelete {
  /** `AND <alias>.<col> IS NULL` when soft-delete is on, else empty. The alias is emitted raw to match the unquoted FROM alias - quoting folds it to a different case and breaks the join. */
  static clause(opts: {
    scope: string;
    softDelete: IScopedCasbinEntities['softDelete'];
    alias: string;
  }): SQL {
    const { scope, softDelete, alias } = opts;

    if (!ToggleUtility.isUsed(softDelete, { name: `[${scope}] entities.softDelete` })) {
      return sql.empty();
    }

    return sql` AND ${sql.raw(alias)}.${sql.identifier(softDelete.columnName)} IS NULL`;
  }

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
