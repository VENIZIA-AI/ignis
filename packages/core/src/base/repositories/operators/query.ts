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

// --------------------------------------------------------------------------------------
export class Sorts {
  static readonly DESC = 'desc';
  static readonly ASC = 'asc';

  static readonly SCHEMA_SET = new Set([Sorts.ASC, Sorts.DESC]);

  static isValid(value: string): boolean {
    return Sorts.SCHEMA_SET.has(value.toLowerCase());
  }
}

// --------------------------------------------------------------------------------------
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
    // Standard Comparison
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

    // Null Checks
    [this.IS]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNull(opts.column) : eq(opts.column, opts.value),
    [this.IS_NOT]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),

    // Arrays / Lists
    [this.IN]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value)) {
        return eq(opts.column, opts.value);
      }
      // Empty array IN () = FALSE (matches nothing)
      return opts.value.length === 0 ? sql`false` : inArray(opts.column, opts.value);
    },
    [this.INQ]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value)) {
        return eq(opts.column, opts.value);
      }
      // Empty array IN () = FALSE (matches nothing)
      return opts.value.length === 0 ? sql`false` : inArray(opts.column, opts.value);
    },
    [this.NIN]: (opts: IQueryHandlerOptions) => {
      if (!Array.isArray(opts.value)) {
        return ne(opts.column, opts.value);
      }
      // Empty array NOT IN () = TRUE (matches everything) - no constraint needed
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
      // NOT BETWEEN is equivalent to: value < min OR value > max
      return not(between(opts.column, opts.value[0], opts.value[1]));
    },

    // Array Column Operators (PostgreSQL specific)
    // Note: For string arrays, we cast both sides to text[] for type compatibility
    // This handles varchar[], text[], char[] columns uniformly
    [this.CONTAINS]: (opts: IQueryHandlerOptions) => {
      const value = Array.isArray(opts.value) ? opts.value : [opts.value];
      if (value.length === 0) {
        return sql`true`; // Everything contains empty set
      }
      const { columnExpr, arrayLiteral } = buildPgArrayComparison({ column: opts.column, value });
      return sql.raw(`${columnExpr} @> ${arrayLiteral}`);
    },
    [this.CONTAINED_BY]: (opts: IQueryHandlerOptions) => {
      const value = Array.isArray(opts.value) ? opts.value : [opts.value];
      if (value.length === 0) {
        return sql`${opts.column} = '{}'`; // Only empty arrays are contained by empty
      }
      const { columnExpr, arrayLiteral } = buildPgArrayComparison({ column: opts.column, value });
      return sql.raw(`${columnExpr} <@ ${arrayLiteral}`);
    },
    [this.OVERLAPS]: (opts: IQueryHandlerOptions) => {
      const value = Array.isArray(opts.value) ? opts.value : [opts.value];
      if (value.length === 0) {
        return sql`false`; // No overlap with empty array
      }
      const { columnExpr, arrayLiteral } = buildPgArrayComparison({ column: opts.column, value });
      return sql.raw(`${columnExpr} && ${arrayLiteral}`);
    },

    // Strings
    [this.LIKE]: (opts: IQueryHandlerOptions) => like(opts.column, opts.value),
    [this.NOT_LIKE]: (opts: IQueryHandlerOptions) => notLike(opts.column, opts.value),
    [this.ILIKE]: (opts: IQueryHandlerOptions) => ilike(opts.column, opts.value), // Postgres specific (Case insensitive)
    [this.NOT_ILIKE]: (opts: IQueryHandlerOptions) => not(ilike(opts.column, opts.value)),

    // Advanced - PostgreSQL POSIX regex operators
    [this.REGEXP]: (opts: IQueryHandlerOptions) => sql`${opts.column} ~ ${opts.value}`, // Case-sensitive regex
    [this.IREGEXP]: (opts: IQueryHandlerOptions) => sql`${opts.column} ~* ${opts.value}`, // Case-insensitive regex
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

  /**
   * Check if an operator object contains any numeric comparison operators with numeric values.
   * Used to determine if numeric casting is needed for JSON path filtering.
   *
   * Validates both:
   * - Key is a numeric operator (gt, gte, lt, lte, between)
   * - Value is of correct type (number for gt/gte/lt/lte, array of 2 numbers for between)
   *
   * @throws Error if numeric operator has invalid value type
   */
  static hasNumericComparison(opts: { operators: Record<string, any> }): boolean {
    const { operators } = opts;
    let hasNumeric = false;

    for (const [op, value] of Object.entries(operators)) {
      if (!this.NUMERIC_COMPARISON_OPERATORS.has(op)) {
        continue;
      }

      // For 'between' and 'notBetween' operators: value must be an array of exactly 2 numbers
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

      // For gt, gte, lt, lte: if value is number, it's numeric comparison
      if (typeof value === 'number') {
        hasNumeric = true;
      }
      // If value is string, it's text comparison (no error, just not numeric)
    }

    return hasNumeric;
  }

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

/**
 * Build PostgreSQL array comparison expressions with proper type handling.
 *
 * For string arrays: Cast both column and value to text[] for type compatibility.
 * This handles varchar[], text[], char[] columns uniformly since PostgreSQL's
 * array operators (@>, <@, &&) require matching types.
 *
 * For numeric/boolean arrays: No casting needed as PostgreSQL infers correctly.
 */
const buildPgArrayComparison = (opts: {
  column: any;
  value: any[];
}): { columnExpr: string; arrayLiteral: string } => {
  const { column, value } = opts;
  const first = value[0];
  const valueType = typeof first;

  // Get column name from Drizzle column object
  const columnName = column.name;

  // Numbers: No casting needed, PostgreSQL infers integer[]/numeric[]
  if (valueType === 'number') {
    return {
      columnExpr: `"${columnName}"`,
      arrayLiteral: `ARRAY[${value.join(', ')}]`,
    };
  }

  // Booleans: No casting needed, PostgreSQL infers boolean[]
  if (valueType === 'boolean') {
    return {
      columnExpr: `"${columnName}"`,
      arrayLiteral: `ARRAY[${value.join(', ')}]`,
    };
  }

  // Strings: Cast BOTH column and value to text[] for compatibility
  // This works with varchar[], text[], char[] etc.
  const escapedValues = value.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
  return {
    columnExpr: `"${columnName}"::text[]`,
    arrayLiteral: `ARRAY[${escapedValues}]::text[]`,
  };
};

export type TQueryOperator = TConstValue<typeof QueryOperators>;
