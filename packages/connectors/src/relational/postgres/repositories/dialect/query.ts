import type { IQueryHandlerOptions } from '@venizia/ignis-kernel';
import { SqlQueryOperators } from '@/relational/core/repositories/dialect/query-operators';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { ilike, not, sql } from 'drizzle-orm';

/** Builds `<column> <operator> ARRAY[$1, ...]` with every element BOUND, never interpolated - these operators are wire-reachable with a `z.any()` operand, so raw interpolation is SQL injection. Element type decides only the CAST (text[] vs numeric[]), never the binding. */
const buildPgArrayComparison = (opts: { column: AnyType; value: AnyType[]; operator: string }) => {
  const { column, value, operator } = opts;

  const items = sql.join(
    value.map((item) => sql`${item}`),
    sql`, `,
  );

  const isNumericOrBoolean = typeof value[0] === 'number' || typeof value[0] === 'boolean';

  if (isNumericOrBoolean) {
    return sql`${column} ${sql.raw(operator)} ARRAY[${items}]`;
  }

  // varchar[]/text[]/char[] all compare cleanly once both sides are text[].
  return sql`${column}::text[] ${sql.raw(operator)} ARRAY[${items}]::text[]`;
};

/** Drizzle-backed handlers for the neutral QueryOperators vocabulary (SQL branch only); the operator NAMES live in repositories/common/operators.ts, shared with the Search dialects. */
export class PostgresQueryOperators extends SqlQueryOperators {
  static readonly FNS = {
    ...SqlQueryOperators.common({ scope: 'PostgresQueryOperators' }),

    [this.CONTAINS]: (opts: IQueryHandlerOptions) => {
      const value = Array.isArray(opts.value) ? opts.value : [opts.value];

      if (value.length === 0) {
        return sql`true`;
      }

      return buildPgArrayComparison({ column: opts.column, value, operator: '@>' });
    },
    [this.CONTAINED_BY]: (opts: IQueryHandlerOptions) => {
      const value = Array.isArray(opts.value) ? opts.value : [opts.value];

      if (value.length === 0) {
        return sql`${opts.column} = '{}'`;
      }

      return buildPgArrayComparison({ column: opts.column, value, operator: '<@' });
    },
    [this.OVERLAPS]: (opts: IQueryHandlerOptions) => {
      const value = Array.isArray(opts.value) ? opts.value : [opts.value];

      if (value.length === 0) {
        return sql`false`;
      }

      return buildPgArrayComparison({ column: opts.column, value, operator: '&&' });
    },

    [this.ILIKE]: (opts: IQueryHandlerOptions) => ilike(opts.column, opts.value),
    [this.NOT_ILIKE]: (opts: IQueryHandlerOptions) => not(ilike(opts.column, opts.value)),

    [this.REGEXP]: (opts: IQueryHandlerOptions) => sql`${opts.column} ~ ${opts.value}`,
    [this.IREGEXP]: (opts: IQueryHandlerOptions) => sql`${opts.column} ~* ${opts.value}`,
  };
}
