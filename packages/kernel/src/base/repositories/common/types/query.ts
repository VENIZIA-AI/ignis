import type { SQL, SQLWrapper } from 'drizzle-orm';

/** Options passed to query operator handler functions. `column` is a `Column` or, on the JSON-path branch, a raw `#>>` extraction expression: both are `SQLWrapper`. */
export interface IQueryHandlerOptions<T = unknown> {
  column: SQLWrapper;
  value: T;
}

/** Operator-name to SQL-handler table a relational dialect translates with, so a second SQL engine swaps the whole table without touching the walk that reaches it. */
export type TQueryOperatorHandlers = Record<
  string,
  (opts: IQueryHandlerOptions) => SQL | undefined
>;
