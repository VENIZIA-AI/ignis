import type { TConstValue } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';

// Neutral filter vocabulary shared by every connector. Support differs per engine - unsupported operators throw at translation time rather than being removed from this list.

/** Sort direction constants for order by clauses. */
export class Sorts {
  static readonly DESC = 'desc';
  static readonly ASC = 'asc';
  static readonly SCHEMA_SET = new Set([Sorts.ASC, Sorts.DESC]);

  static isValid(value: string): boolean {
    return Sorts.SCHEMA_SET.has(value.toLowerCase());
  }
}

/** Asserts a between-style operand is a two-element tuple and reports whether both bounds are numbers. */
const validateNumericRange = (opts: { op: string; value: unknown }): boolean => {
  const { op, value } = opts;

  if (!Array.isArray(value) || value.length !== 2) {
    throw getError({
      message: `[QueryOperators][hasNumericComparison] Invalid '${op}' value | Expected: [min, max] | Got: ${JSON.stringify(value)}`,
    });
  }

  return value.every(v => typeof v === 'number');
};

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
  static readonly IREGEXP = 'iregexp';

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
        const isNumericRange = validateNumericRange({ op, value });
        hasNumeric = hasNumeric || isNumericRange;
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
