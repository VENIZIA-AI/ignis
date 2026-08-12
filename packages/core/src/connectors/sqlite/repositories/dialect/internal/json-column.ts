import type { TTableColumns } from '@/connectors/relational/repositories/common';
import { getError } from '@venizia/ignis-helpers/core';

/**
 * Refuses `blob(name, { mode: 'json' })`, which the neutral check accepts because Drizzle reports
 * `dataType: 'json'` for it. SQLite reads a BLOB json argument as JSONB while Drizzle stores UTF-8
 * text, so payloads whose bytes resemble a JSONB header fail per-row - invisible at compile time.
 *
 * @throws Error if the column is declared as a blob.
 */
export const assertNotBlobJsonColumn = (opts: {
  column: TTableColumns[string];
  tableName: string;
  scope: string;
}): void => {
  const { column, tableName, scope } = opts;

  if (column.getSQLType().toLowerCase() !== 'blob') {
    return;
  }

  throw getError({
    message: `${scope} Table: ${tableName} | Column '${column.name}' is a blob-mode JSON column | SQLite reads a BLOB argument to a json function as JSONB while Drizzle stores JSON text | Declare it as text(name, { mode: 'json' })`,
  });
};
