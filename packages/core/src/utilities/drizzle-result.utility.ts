import { getError } from '@venizia/ignis-helpers';

/** Rows affected by a write executed without RETURNING. */
export const readAffectedRowCount = (opts: { result: unknown }): number => {
  const { result } = opts;

  // Drizzle resolves some statements to nothing at all; the callers already treated that as zero.
  if (result === null || result === undefined) {
    return 0;
  }

  if (typeof result !== 'object') {
    throw getError({
      message: `[readAffectedRowCount] Unrecognized driver result | expected pg.QueryResult or postgres-js RowList | got: ${typeof result}`,
    });
  }

  const { rowCount, count } = result as { rowCount?: unknown; count?: unknown };

  // node-postgres. `rowCount` is null for statements that affect no rows by definition (e.g. DDL).
  if (typeof rowCount === 'number') {
    return rowCount;
  }

  if (rowCount === null) {
    return 0;
  }

  // postgres-js.
  if (typeof count === 'number') {
    return count;
  }

  throw getError({
    message: `[readAffectedRowCount] Unrecognized driver result | expected 'rowCount' (node-postgres) or 'count' (postgres-js) | got keys: ${Object.keys(result).join(', ')}`,
  });
};

/** Rows returned by `connector.execute(...)`. */
export const readResultRows = <TRow>(opts: { result: unknown }): TRow[] => {
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
      message: `[readResultRows] Unrecognized driver result | expected pg.QueryResult or postgres-js RowList | got: ${typeof result}`,
    });
  }

  // node-postgres: pg.QueryResult.
  const { rows } = result as { rows?: unknown };

  if (Array.isArray(rows)) {
    return rows as TRow[];
  }

  throw getError({
    message: `[readResultRows] Unrecognized driver result | expected an array (postgres-js) or a 'rows' array (node-postgres) | got keys: ${Object.keys(result).join(', ')}`,
  });
};
