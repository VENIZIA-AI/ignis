import type { AnyType } from '@venizia/ignis-helpers/common';
import type { Column, SQL } from 'drizzle-orm';

/** Options passed to query operator handler functions. */
export interface IQueryHandlerOptions<T = any> {
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
  (opts: { column: AnyType; value: AnyType }) => SQL | undefined
>;
