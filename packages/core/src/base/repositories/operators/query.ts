import { getError, TConstValue } from '@venizia/ignis-helpers';
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
import { IQueryHandlerOptions } from '../common';
/** @internal Builds PostgreSQL array comparison expressions with proper type casting. */
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

/** Sort direction constants for order by clauses. */
export class Sorts {
  static readonly DESC = 'desc';
  static readonly ASC = 'asc';
  static readonly SCHEMA_SET = new Set([Sorts.ASC, Sorts.DESC]);

  static isValid(value: string): boolean {
    return Sorts.SCHEMA_SET.has(value.toLowerCase());
  }
}

/** Query operators for building where conditions (comparison, pattern, null, array, logical). */
export class QueryOperators {
  static readonly EQ = 'eq';
  static readonly NE = 'ne';
  static readonly NEQ = 'neq';

  static readonly GT = 'gt';
  static readonly GTE = 'gte';

  static readonly LT = 'lt';
  static readonly LTE = 'lte';

  static readonly LIKE = 'like';
  static readonly NOT_LIKE = 'nlike';
  static readonly ILIKE = 'ilike';
  static readonly NOT_ILIKE = 'nilike';

  static readonly IS = 'is';
  static readonly IS_NOT = 'isn';
  static readonly REGEXP = 'regexp';
  static readonly IREGEXP = 'iregexp'; // Case-insensitive regex

  static readonly IN = 'in';
  static readonly INQ = 'inq';
  static readonly NIN = 'nin';

  static readonly EXISTS = 'exists';
  static readonly NOT_EXISTS = 'notExists';

  static readonly BETWEEN = 'between';
  static readonly NOT_BETWEEN = 'notBetween';

  // Array Column Operators (PostgreSQL specific)
  static readonly CONTAINS = 'contains'; // @> array contains
  static readonly CONTAINED_BY = 'containedBy'; // <@ array is contained by
  static readonly OVERLAPS = 'overlaps'; // && array overlaps

  static readonly NOT = 'not';
  static readonly AND = 'and';
  static readonly OR = 'or';

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
        throw new Error(
          `[BETWEEN] Invalid value: expected array of 2 elements, got ${JSON.stringify(opts.value)}`,
        );
      }
      return between(opts.column, opts.value[0], opts.value[1]);
    },
    [this.NOT_BETWEEN]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value) || opts.value.length !== 2) {
        throw new Error(
          `[NOT_BETWEEN] Invalid value: expected array of 2 elements, got ${JSON.stringify(opts.value)}`,
        );
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

  static readonly SCHEME_SET = new Set([
    this.EQ,
    this.NE,
    this.NEQ,
    this.GT,
    this.GTE,
    this.LT,
    this.LTE,
    this.LIKE,
    this.NOT_LIKE,
    this.ILIKE,
    this.NOT_ILIKE,
    this.IS,
    this.IS_NOT,
    this.REGEXP,
    this.IREGEXP,
    this.IN,
    this.INQ,
    this.NIN,
    this.EXISTS,
    this.NOT_EXISTS,
    this.BETWEEN,
    this.NOT_BETWEEN,
    this.CONTAINS,
    this.CONTAINED_BY,
    this.OVERLAPS,
    this.NOT,
    this.AND,
    this.OR,
  ]);

  static readonly LOGICAL_GROUP_OPERATORS = new Set([this.AND, this.OR]);

  static readonly NUMERIC_COMPARISON_OPERATORS = new Set([
    this.GT,
    this.GTE,
    this.LT,
    this.LTE,
    this.BETWEEN,
    this.NOT_BETWEEN,
  ]);

  /** Checks if operators contain numeric comparisons (used for JSON path numeric casting). */
  static hasNumericComparison(opts: { operators: Record<string, any> }): boolean {
    const { operators } = opts;
    let hasNumeric = false;

    for (const op in operators) {
      if (!this.NUMERIC_COMPARISON_OPERATORS.has(op)) {
        continue;
      }

      const value = operators[op];

      if (op === this.BETWEEN || op === this.NOT_BETWEEN) {
        if (!Array.isArray(value) || value.length !== 2) {
          throw getError({
            message: `[QueryOperators][hasNumericComparison] Invalid '${op}' value | Expected: [min, max] | Got: ${JSON.stringify(value)}`,
          });
        }
        if (value.every(v => typeof v === 'number')) {
          hasNumeric = true;
        }
        continue;
      }

      if (typeof value === 'number') {
        hasNumeric = true;
      }
    }

    return hasNumeric;
  }

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

export type TQueryOperator = TConstValue<typeof QueryOperators>;
