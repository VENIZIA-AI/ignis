import type { IQueryHandlerOptions } from '@/base/repositories/common';
import { QueryOperators } from '@/base/repositories/common';
import type { AnyType } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import {
  between,
  eq,
  gt,
  gte,
  ilike,
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
 * Builds `<column> <operator> ARRAY[$1, $2, ...]` with every element BOUND, never interpolated.
 *
 * These three operators are reachable straight from the wire (`?filter={"where":{"tags":{"overlaps":
 * [...]}}}`) and the operand is `z.any()` end to end. The previous shape sniffed the element type
 * from `value[0]` and, for a numeric or boolean first element, `join(', ')`-ed the WHOLE array into
 * `sql.raw` - so `[1, "1); DROP TABLE users; --"]` wrote SQL. It also read `column.name`, which is
 * undefined for a JSON-path extraction, producing `"undefined" @> ARRAY[...]`.
 *
 * Element type still decides the CAST (a text[] column must compare against text[]), but the cast is
 * a decision about the column, not about the values.
 */
const buildPgArrayComparison = (opts: { column: AnyType; value: AnyType[]; operator: string }) => {
  const { column, value, operator } = opts;

  const items = sql.join(
    value.map(item => sql`${item}`),
    sql`, `,
  );

  const isNumericOrBoolean = typeof value[0] === 'number' || typeof value[0] === 'boolean';

  if (isNumericOrBoolean) {
    return sql`${column} ${sql.raw(operator)} ARRAY[${items}]`;
  }

  // varchar[]/text[]/char[] all compare cleanly once both sides are text[].
  return sql`${column}::text[] ${sql.raw(operator)} ARRAY[${items}]::text[]`;
};

/** Drizzle-backed handlers for the neutral QueryOperators vocabulary (SQL branch only).
 * The operator NAMES live in repositories/common/operators.ts, shared with the Search dialects. */
export class PostgresQueryOperators extends QueryOperators {
  static readonly FNS = {
    [this.EQ]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNull(opts.column) : eq(opts.column, opts.value),
    // SQL three-valued logic is canonical: a NULL row never matches `neq`/`ne` (a comparison to a
    // real value yields UNKNOWN, not TRUE).
    [this.NE]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),
    [this.NEQ]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),

    // `exists`/`notExists` test presence: `exists: true` -> IS NOT NULL, `exists: false` -> IS NULL;
    // `notExists` is the inverse.
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
          message: `[PostgresQueryOperators][BETWEEN] Invalid value: expected array of 2 elements, got ${JSON.stringify(opts.value)}`,
        });
      }
      return between(opts.column, opts.value[0], opts.value[1]);
    },
    [this.NOT_BETWEEN]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value) || opts.value.length !== 2) {
        throw getError({
          message: `[PostgresQueryOperators][NOT_BETWEEN] Invalid value: expected array of 2 elements, got ${JSON.stringify(opts.value)}`,
        });
      }
      return not(between(opts.column, opts.value[0], opts.value[1]));
    },

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

    [this.LIKE]: (opts: IQueryHandlerOptions) => like(opts.column, opts.value),
    [this.NOT_LIKE]: (opts: IQueryHandlerOptions) => notLike(opts.column, opts.value),
    [this.ILIKE]: (opts: IQueryHandlerOptions) => ilike(opts.column, opts.value),
    [this.NOT_ILIKE]: (opts: IQueryHandlerOptions) => not(ilike(opts.column, opts.value)),

    [this.REGEXP]: (opts: IQueryHandlerOptions) => sql`${opts.column} ~ ${opts.value}`,
    [this.IREGEXP]: (opts: IQueryHandlerOptions) => sql`${opts.column} ~* ${opts.value}`,
  };
}
