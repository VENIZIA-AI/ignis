import type { Column, SQL } from 'drizzle-orm';

/** Options passed to query operator handler functions. */
export interface IQueryHandlerOptions<T = unknown> {
  column: Column;
  value: T;
}

/**
 * Operator-name to SQL-handler table a relational dialect translates with, so a second SQL engine
 * swaps the whole table without touching the walk that reaches it. `column` is wider than
 * `IQueryHandlerOptions` names it: the JSON-path branch hands handlers a raw `#>>` extraction
 * expression, not a `Column`.
 */
export type TQueryOperatorHandlers = Record<
  string,
  // A method signature on purpose: its parameter is bivariant, so a handler typed for `IQueryHandlerOptions` fits.
  { handle(opts: { column: Column | SQL; value: unknown }): SQL | undefined }['handle']
>;
