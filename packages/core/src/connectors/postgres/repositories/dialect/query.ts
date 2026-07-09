import type { IQueryHandlerOptions } from '@/base/repositories/common';
import { QueryOperators } from '@/base/repositories/common';
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

const buildPgArrayComparison = (opts: {
  column: any;
  value: any[];
}): { columnExpr: string; arrayLiteral: string } => {
  const { column, value } = opts;
  const first = value[0];
  const valueType = typeof first;

  const columnName = column.name;

  if (valueType === 'number') {
    return {
      columnExpr: `"${columnName}"`,
      arrayLiteral: `ARRAY[${value.join(', ')}]`,
    };
  }

  if (valueType === 'boolean') {
    return {
      columnExpr: `"${columnName}"`,
      arrayLiteral: `ARRAY[${value.join(', ')}]`,
    };
  }

  // Cast both sides to text[] for varchar[]/text[]/char[] compatibility
  const escapedValues = value.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
  return {
    columnExpr: `"${columnName}"::text[]`,
    arrayLiteral: `ARRAY[${escapedValues}]::text[]`,
  };
};

/** Drizzle-backed handlers for the neutral QueryOperators vocabulary (SQL branch only).
 * The operator NAMES live in repositories/common/operators.ts, shared with the Search dialects. */
export class PostgresQueryOperators extends QueryOperators {
  static readonly FNS = {
    [this.EQ]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNull(opts.column) : eq(opts.column, opts.value),
    [this.NE]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),
    [this.NEQ]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),

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
      const { columnExpr, arrayLiteral } = buildPgArrayComparison({ column: opts.column, value });
      return sql.raw(`${columnExpr} @> ${arrayLiteral}`);
    },
    [this.CONTAINED_BY]: (opts: IQueryHandlerOptions) => {
      const value = Array.isArray(opts.value) ? opts.value : [opts.value];
      if (value.length === 0) {
        return sql`${opts.column} = '{}'`;
      }
      const { columnExpr, arrayLiteral } = buildPgArrayComparison({ column: opts.column, value });
      return sql.raw(`${columnExpr} <@ ${arrayLiteral}`);
    },
    [this.OVERLAPS]: (opts: IQueryHandlerOptions) => {
      const value = Array.isArray(opts.value) ? opts.value : [opts.value];
      if (value.length === 0) {
        return sql`false`;
      }
      const { columnExpr, arrayLiteral } = buildPgArrayComparison({ column: opts.column, value });
      return sql.raw(`${columnExpr} && ${arrayLiteral}`);
    },

    [this.LIKE]: (opts: IQueryHandlerOptions) => like(opts.column, opts.value),
    [this.NOT_LIKE]: (opts: IQueryHandlerOptions) => notLike(opts.column, opts.value),
    [this.ILIKE]: (opts: IQueryHandlerOptions) => ilike(opts.column, opts.value),
    [this.NOT_ILIKE]: (opts: IQueryHandlerOptions) => not(ilike(opts.column, opts.value)),

    [this.REGEXP]: (opts: IQueryHandlerOptions) => sql`${opts.column} ~ ${opts.value}`,
    [this.IREGEXP]: (opts: IQueryHandlerOptions) => sql`${opts.column} ~* ${opts.value}`,
  };
}
