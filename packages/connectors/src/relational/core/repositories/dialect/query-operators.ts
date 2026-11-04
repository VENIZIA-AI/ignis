import type { IQueryHandlerOptions } from '@venizia/ignis-kernel';
import { QueryOperators } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import {
  between,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notInArray,
  notLike,
  sql,
} from 'drizzle-orm';
import { SubqueryUtility } from './internal';

/** The Drizzle handlers every SQL engine shares; an engine adds or replaces the few it differs on. */
export class SqlQueryOperators extends QueryOperators {
  /** The `between` operand: exactly two elements, or a refusal that names the engine's scope and the operator. */
  private static pair(opts: { scope: string; operator: string; value: unknown }) {
    const { scope, operator, value } = opts;

    if (!Array.isArray(value) || value.length !== 2) {
      throw getError({
        message: `[${scope}][${operator}] Invalid value: expected array of 2 elements, got ${JSON.stringify(value)}`,
      });
    }

    return value;
  }

  /** `scope` is the engine's operator class name: it prefixes the errors a handler throws. */
  static common(config: { scope: string }) {
    const { scope } = config;

    return {
      [this.EQ]: (opts: IQueryHandlerOptions) =>
        opts.value === null ? isNull(opts.column) : eq(opts.column, opts.value),
      // SQL three-valued logic is canonical: a NULL row never matches `neq`/`ne` because comparing to a real value yields UNKNOWN, not TRUE.
      [this.NE]: (opts: IQueryHandlerOptions) =>
        opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),
      [this.NEQ]: (opts: IQueryHandlerOptions) =>
        opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),

      // `exists`/`notExists` test presence: `exists: true` -> IS NOT NULL, `exists: false` -> IS NULL, `notExists` the inverse.
      [this.EXISTS]: (opts: IQueryHandlerOptions) =>
        opts.value === false ? isNull(opts.column) : isNotNull(opts.column),
      [this.NOT_EXISTS]: (opts: IQueryHandlerOptions) =>
        opts.value === false ? isNotNull(opts.column) : isNull(opts.column),

      [this.GT]: (opts: IQueryHandlerOptions) => gt(opts.column, opts.value),
      [this.GTE]: (opts: IQueryHandlerOptions) => gte(opts.column, opts.value),

      [this.LT]: (opts: IQueryHandlerOptions) => lt(opts.column, opts.value),
      [this.LTE]: (opts: IQueryHandlerOptions) => lte(opts.column, opts.value),

      [this.IS]: (opts: IQueryHandlerOptions) =>
        opts.value === null ? isNull(opts.column) : eq(opts.column, opts.value),
      [this.IS_NOT]: (opts: IQueryHandlerOptions) =>
        opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),

      [this.IN]: (opts: IQueryHandlerOptions) => SqlQueryOperators.within(opts),
      [this.INQ]: (opts: IQueryHandlerOptions) => SqlQueryOperators.within(opts),
      [this.IN_SQL]: (opts: IQueryHandlerOptions) =>
        SubqueryUtility.buildSubqueryCondition({
          ...opts,
          operator: this.IN_SQL,
          isNegated: false,
        }),
      [this.NOT_IN_SQL]: (opts: IQueryHandlerOptions) =>
        SubqueryUtility.buildSubqueryCondition({
          ...opts,
          operator: this.NOT_IN_SQL,
          isNegated: true,
        }),
      [this.NIN]: (opts: IQueryHandlerOptions) => {
        if (!Array.isArray(opts.value)) {
          return ne(opts.column, opts.value);
        }

        return opts.value.length === 0 ? sql`true` : notInArray(opts.column, opts.value);
      },
      [this.BETWEEN]: (opts: IQueryHandlerOptions) => {
        const [low, high] = SqlQueryOperators.pair({
          scope,
          operator: 'BETWEEN',
          value: opts.value,
        });

        return between(opts.column, low, high);
      },
      [this.NOT_BETWEEN]: (opts: IQueryHandlerOptions) => {
        const [low, high] = SqlQueryOperators.pair({
          scope,
          operator: 'NOT_BETWEEN',
          value: opts.value,
        });

        return not(between(opts.column, low, high));
      },

      [this.LIKE]: (opts: IQueryHandlerOptions) => like(opts.column, opts.value),
      [this.NOT_LIKE]: (opts: IQueryHandlerOptions) => notLike(opts.column, opts.value),
    };
  }

  /** `in`: a scalar operand compares for equality, an empty list matches nothing. */
  private static within(opts: IQueryHandlerOptions) {
    if (!Array.isArray(opts.value)) {
      return eq(opts.column, opts.value);
    }

    return opts.value.length === 0 ? sql`false` : inArray(opts.column, opts.value);
  }
}
