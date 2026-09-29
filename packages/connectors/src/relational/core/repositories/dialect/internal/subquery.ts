import { getError } from '@venizia/ignis-helpers/core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const isSqlWrapper = (value: unknown): value is SQLWrapper =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'getSQL') === 'function';

/**
 * `<column> IN (<subquery>)` or `NOT IN`, for `inSql`/`ninSql`. Only a Drizzle SQL object passes:
 * a request body is JSON and cannot carry one, so a string here is refused rather than run.
 */
export const buildSubqueryCondition = (opts: {
  column: AnyType;
  value: unknown;
  operator: string;
  isNegated: boolean;
}): SQL => {
  const { column, value, operator, isNegated } = opts;

  if (!isSqlWrapper(value)) {
    throw getError({
      statusCode: 400,
      message: `[FilterBuilder][${operator}] Expected a Drizzle SQL subquery | Got: ${value === null ? 'null' : typeof value}`,
    });
  }

  return isNegated ? sql`${column} not in (${value})` : sql`${column} in (${value})`;
};
