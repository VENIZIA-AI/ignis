import type { IQueryHandlerOptions } from '@/base/repositories/common';
import { QueryOperators } from '@/base/repositories/common';
import { throwNotSupported } from '@/utilities';
import { getError, LoggerFactory } from '@venizia/ignis-helpers';
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

/**
 * Drizzle-backed handlers for the neutral QueryOperators vocabulary. The operator NAMES live in
 * repositories/common/operators.ts, shared with every connector family.
 */
export class SqliteQueryOperators extends QueryOperators {
  /**
   * Refuses where it cannot translate: approximate SQL returns the wrong rows silently,
   * and a caller cannot tell that from a right answer. The message names the operator
   * and the missing capability, so the caller knows there is nothing to configure.
   */
  private static reject(opts: { operator: string; reason: string }): never {
    const { operator, reason } = opts;

    return throwNotSupported({
      scope: SqliteQueryOperators.name,
      feature: `Operator '${operator}' - ${reason}`,
      logger: LoggerFactory.getLogger([SqliteQueryOperators.name]),
    });
  }

  static readonly FNS = {
    [this.EQ]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNull(opts.column) : eq(opts.column, opts.value),
    // SQL three-valued logic is canonical: a NULL row never matches `neq`/`ne`,
    // because comparing to a real value yields UNKNOWN rather than TRUE.
    [this.NE]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),
    [this.NEQ]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),

    // `exists`/`notExists` test presence: `exists: true` -> IS NOT
    // NULL, `exists: false` -> IS NULL, `notExists` the inverse.
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

    [this.IN]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value)) {
        return eq(opts.column, opts.value);
      }
      return opts.value.length === 0 ? sql`false` : inArray(opts.column, opts.value);
    },
    [this.INQ]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value)) {
        return eq(opts.column, opts.value);
      }
      return opts.value.length === 0 ? sql`false` : inArray(opts.column, opts.value);
    },
    [this.NIN]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value)) {
        return ne(opts.column, opts.value);
      }
      return opts.value.length === 0 ? sql`true` : notInArray(opts.column, opts.value);
    },
    [this.BETWEEN]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value) || opts.value.length !== 2) {
        throw getError({
          message: `[SqliteQueryOperators][BETWEEN] Invalid value: expected array of 2 elements, got ${JSON.stringify(opts.value)}`,
        });
      }
      return between(opts.column, opts.value[0], opts.value[1]);
    },
    [this.NOT_BETWEEN]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value) || opts.value.length !== 2) {
        throw getError({
          message: `[SqliteQueryOperators][NOT_BETWEEN] Invalid value: expected array of 2 elements, got ${JSON.stringify(opts.value)}`,
        });
      }
      return not(between(opts.column, opts.value[0], opts.value[1]));
    },

    // No array storage class, so `@>` / `<@` / `&&` have no operand. A `json_each` emulation would
    // answer a different question - containment inside one row's JSON, not array-column algebra.
    [this.CONTAINS]: () =>
      this.reject({ operator: this.CONTAINS, reason: 'SQLite has no array storage class' }),
    [this.CONTAINED_BY]: () =>
      this.reject({ operator: this.CONTAINED_BY, reason: 'SQLite has no array storage class' }),
    [this.OVERLAPS]: () =>
      this.reject({ operator: this.OVERLAPS, reason: 'SQLite has no array storage class' }),

    /*
     * SQLite's `LIKE` is ASCII case-INSENSITIVE, so `ilike` maps exactly and it is `like` that
     * silently widens against its Postgres meaning. Refusing `ilike` would be theatre - renaming it
     * to `like` yields the same SQL. Residual gap: `'ÉCOLE' LIKE 'é%'` is false without ICU.
     */
    [this.LIKE]: (opts: IQueryHandlerOptions) => like(opts.column, opts.value),
    [this.NOT_LIKE]: (opts: IQueryHandlerOptions) => notLike(opts.column, opts.value),
    [this.ILIKE]: (opts: IQueryHandlerOptions) => like(opts.column, opts.value),
    [this.NOT_ILIKE]: (opts: IQueryHandlerOptions) => notLike(opts.column, opts.value),

    // `X REGEXP Y` is sugar for a `regexp()` function SQLite never defines and libsql never
    // registers, so the operator would fail at execution on a query that looked accepted.
    [this.REGEXP]: () =>
      this.reject({
        operator: this.REGEXP,
        reason: 'SQLite defines no regexp() function and libsql registers none',
      }),
    [this.IREGEXP]: () =>
      this.reject({
        operator: this.IREGEXP,
        reason: 'SQLite defines no regexp() function and libsql registers none',
      }),
  };
}
