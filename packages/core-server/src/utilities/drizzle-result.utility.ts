import { getError } from '@venizia/ignis-helpers/core';

/** Normalizes the result of a raw Drizzle `execute()` call across the postgres-js and node-postgres drivers. */
export class DrizzleResultUtility {
  /** Rows returned by `connector.execute(...)`. */
  static readResultRows<TRow>(opts: { result: unknown }): TRow[] {
    const { result } = opts;

    if (result === null || result === undefined) {
      return [];
    }

    // postgres-js: the result IS the row list.
    if (Array.isArray(result)) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the caller names the row type of its own SQL; only the list itself is checked
      return result as TRow[];
    }

    if (typeof result !== 'object') {
      throw getError({
        message: `[DrizzleResultUtility.readResultRows] Unrecognized driver result | expected pg.QueryResult or postgres-js RowList | got: ${typeof result}`,
      });
    }

    // node-postgres: pg.QueryResult.
    const rows: unknown = 'rows' in result ? result.rows : undefined;

    if (Array.isArray(rows)) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the caller names the row type of its own SQL; only the list itself is checked
      return rows as TRow[];
    }

    throw getError({
      message: `[DrizzleResultUtility.readResultRows] Unrecognized driver result | expected an array (postgres-js) or a 'rows' array (node-postgres) | got keys: ${Object.keys(result).join(', ')}`,
    });
  }
}
