import { getError, type TConstValue } from '@venizia/ignis-inversion';
import type { TParsedOrderEntry, TSortDirection } from './types';

// Neutral filter vocabulary shared by every connector. Support differs per engine - unsupported operators throw at translation time rather than being removed from this list.

/** Sort direction constants for order by clauses, and the reader of one order entry. */
export class Sorts {
  static readonly DESC = 'desc';
  static readonly ASC = 'asc';
  static readonly SCHEMA_SET = new Set([Sorts.ASC, Sorts.DESC]);

  /** Characters `JSON.stringify` leaves raw that still break a log line: DEL, C1 controls, U+2028, U+2029. */
  private static readonly RAW_AFTER_JSON = /[\u007f-\u009f\u2028\u2029]/g;

  static isValid(value: string): boolean {
    return Sorts.SCHEMA_SET.has(value.toLowerCase());
  }

  /** The entry quoted for an error message: JSON-escaped, and on one line whatever it holds. */
  private static quoteEntry(opts: { entry: string }): string {
    return JSON.stringify(opts.entry).replace(
      Sorts.RAW_AFTER_JSON,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
  }

  // ASCII whitespace: space, tab, line feed, vertical tab, form feed, carriage return.
  private static isSeparator(code: number): boolean {
    return code === 32 || (code >= 9 && code <= 13);
  }

  private static toSortDirection(opts: { direction: string }): TSortDirection | undefined {
    const { direction } = opts;

    // The spellings callers write, compared without allocating; anything else is lowercased.
    switch (direction) {
      case 'ASC':
      case 'asc': {
        return Sorts.ASC;
      }
      case 'DESC':
      case 'desc': {
        return Sorts.DESC;
      }
      default: {
        const lowered = direction.toLowerCase();
        return lowered === Sorts.ASC || lowered === Sorts.DESC ? lowered : undefined;
      }
    }
  }

  /**
   * Reads one order entry - `field` or `field direction`, tokens separated by whitespace, direction
   * `ASC` or `DESC` in any case (default `ASC`). Throws a 400 naming the whole entry when the field is
   * missing, the direction is unknown, or the entry has more than two tokens.
   */
  static parseEntry(opts: { entry: string }): TParsedOrderEntry {
    const { entry } = opts;
    const trimmed = entry.trim();
    const length = trimmed.length;

    if (length === 0) {
      throw getError({
        statusCode: 400,
        message: `[parseOrderEntry] Order entry has no field | entry: ${Sorts.quoteEntry({ entry })}`,
      });
    }

    let fieldEnd = 0;
    while (fieldEnd < length && !Sorts.isSeparator(trimmed.charCodeAt(fieldEnd))) {
      fieldEnd++;
    }

    if (fieldEnd === length) {
      return { field: trimmed, direction: Sorts.ASC };
    }

    // `trimmed` ends on a non-separator, so a direction token follows the gap.
    let directionStart = fieldEnd + 1;
    while (Sorts.isSeparator(trimmed.charCodeAt(directionStart))) {
      directionStart++;
    }

    let directionEnd = directionStart + 1;
    while (directionEnd < length && !Sorts.isSeparator(trimmed.charCodeAt(directionEnd))) {
      directionEnd++;
    }

    if (directionEnd !== length) {
      throw getError({
        statusCode: 400,
        message: `[parseOrderEntry] Too many tokens | entry: ${Sorts.quoteEntry({ entry })} | Expected: '<field>' or '<field> ASC|DESC'`,
      });
    }

    const direction = Sorts.toSortDirection({ direction: trimmed.slice(directionStart) });

    if (!direction) {
      throw getError({
        statusCode: 400,
        message: `[parseOrderEntry] Invalid direction | entry: ${Sorts.quoteEntry({ entry })} | Expected: 'ASC' or 'DESC'`,
      });
    }

    return { field: trimmed.slice(0, fieldEnd), direction };
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

  return value.every((v) => typeof v === 'number');
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

  // Subquery operators: the operand is a Drizzle SQL object built in code, never a request value.
  static readonly IN_SQL = 'inSql';
  static readonly NOT_IN_SQL = 'ninSql';

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
    this.IN_SQL,
    this.NOT_IN_SQL,
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
