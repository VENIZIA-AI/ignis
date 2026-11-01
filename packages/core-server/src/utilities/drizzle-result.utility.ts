import { getError } from '@venizia/ignis-helpers/core';

export class DrizzleResultUtility {
  /** Rows returned by `connector.execute(...)`. */
  static readResultRows<TRow>(opts: { result: unknown }): TRow[] {
    const { result } = opts;

    if (result === null || result === undefined) {
      return [];
    }

    // postgres-js: the result IS the row list.
    if (Array.isArray(result)) {
      return result as TRow[];
    }

    if (typeof result !== 'object') {
      throw getError({
        message: `[DrizzleResultUtility.readResultRows] Unrecognized driver result | expected pg.QueryResult or postgres-js RowList | got: ${typeof result}`,
      });
    }

    // node-postgres: pg.QueryResult.
    const { rows } = result as { rows?: unknown };

    if (Array.isArray(rows)) {
      return rows as TRow[];
    }

    throw getError({
      message: `[DrizzleResultUtility.readResultRows] Unrecognized driver result | expected an array (postgres-js) or a 'rows' array (node-postgres) | got keys: ${Object.keys(result).join(', ')}`,
    });
  }
}
