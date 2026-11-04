import type { IQueryHandlerOptions } from '@venizia/ignis-kernel';
import { SqlQueryOperators } from '@/relational/core/repositories/dialect/query-operators';
import { NotSupportedUtility } from '@venizia/ignis-kernel';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import { like, notLike } from 'drizzle-orm';

/**
 * Drizzle-backed handlers for the neutral QueryOperators vocabulary. The operator NAMES live in
 * repositories/common/operators.ts, shared with every connector family.
 */
export class SqliteQueryOperators extends SqlQueryOperators {
  /**
   * Refuses where it cannot translate: approximate SQL returns the wrong rows silently,
   * and a caller cannot tell that from a right answer. The message names the operator
   * and the missing capability, so the caller knows there is nothing to configure.
   */
  private static reject(opts: { operator: string; reason: string }): never {
    const { operator, reason } = opts;

    return NotSupportedUtility.throwNotSupported({
      scope: SqliteQueryOperators.name,
      feature: `Operator '${operator}' - ${reason}`,
      // Not `LoggerFactory`: it reaches the helpers root barrel, which pulls `ioredis` and fails a
      // browser bundle on `tls`.
      logger: new BaseHelper({ scope: SqliteQueryOperators.name }).getLogger(),
    });
  }

  static readonly FNS = {
    ...SqlQueryOperators.common({ scope: 'SqliteQueryOperators' }),

    // No array storage class, so `@>` / `<@` / `&&` have no operand. A `json_each` emulation would
    // answer a different question - containment inside one row's JSON, not array-column algebra.
    [this.CONTAINS]: () =>
      this.reject({ operator: this.CONTAINS, reason: 'SQLite has no array storage class' }),
    [this.CONTAINED_BY]: () =>
      this.reject({ operator: this.CONTAINED_BY, reason: 'SQLite has no array storage class' }),
    [this.OVERLAPS]: () =>
      this.reject({ operator: this.OVERLAPS, reason: 'SQLite has no array storage class' }),

    /*
     * SQLite's `LIKE` (shared with Postgres) is ASCII case-INSENSITIVE here, so `ilike` maps exactly and it is `like` that
     * silently widens against its Postgres meaning. Refusing `ilike` would be theatre - renaming it
     * to `like` yields the same SQL. Residual gap: `'ÉCOLE' LIKE 'é%'` is false without ICU.
     */
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
