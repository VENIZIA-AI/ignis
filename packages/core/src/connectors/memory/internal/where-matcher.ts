import { getError } from '@venizia/ignis-helpers';
import type { TWhere } from '@/base/repositories/common';
import { QueryOperators, Sorts } from '@/base/repositories/common';

// Deliberately scoped operator set - the neutral vocabulary (`QueryOperators`) also lists
// operators with no faithful plain-JS meaning (`is`/`isn` null semantics, `regexp`/`iregexp`,
// `exists`/`notExists`, `contains`/`containedBy`/`overlaps` - explicitly PostgreSQL-array-only per
// `constants.ts`). Those throw the same "unsupported operator" error a real SQL/search dialect
// would throw for a shape it can't translate - this connector does not invent behavior for them.

/** Compares two same-typed orderable values. Used by both range operators (gt/gte/lt/lte/between)
 * and `order` sorting - throws on mismatched or non-orderable operand types rather than guessing. */
const compareOrderable = (opts: { left: unknown; right: unknown; field: string }): number => {
  const { left, right, field } = opts;

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  if (typeof left === 'string' && typeof right === 'string') {
    return left.localeCompare(right);
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }

  throw getError({
    message: `[MemoryRepository][where-matcher] Unsupported comparison operand types | field: '${field}'`,
  });
};

/** Narrows to a non-Date, non-array object - the shared "is this a comparable/iterable record"
 * check behind `deepEqual`'s structural comparison and `isOperatorObject`'s operator-map detection. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value);

/** Structural equality for `eq`/`neq`/bare-condition matching and `inq`/`nin` membership - mirrors
 * Postgres' native JSONB/`=` comparison (by value, not reference) so a `Date` or plain-object
 * condition behaves the same across connectors instead of failing silently on reference identity. */
const deepEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => deepEqual(item, right[index]))
    );
  }

  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    key => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]),
  );
};

/** `true` when `actual` deep-equals any element of `haystack` - the shared membership test behind
 * `inq`, `nin`, and the bare-array-condition (`{ field: [1, 2] }`) shorthand. A missing field never
 * matches - mirrors Postgres' `inArray()` (filter.ts) and Typesense's `field:=[...]` (query-dialect.ts). */
const includesValue = (opts: { haystack: unknown[]; actual: unknown }): boolean => {
  const { haystack, actual } = opts;
  return actual !== undefined && haystack.some(candidate => deepEqual(actual, candidate));
};

/** Same operator-object detection as Postgres' `FilterBuilder.isOperatorObject`/`isPrimitiveValue`
 * pairing (filter.ts) - null/array/`Date`/non-object values, and objects whose keys aren't all
 * recognized `QueryOperators`, are treated as a literal bare-equality value, not an operator map. */
const isOperatorObject = (condition: unknown): condition is Record<string, unknown> => {
  if (!isPlainObject(condition)) {
    return false;
  }

  const keys = Object.keys(condition);
  return keys.length > 0 && keys.every(key => QueryOperators.isValid(key));
};

/** Sort-only comparator: a missing/`null` field sorts as NULLS LAST on ASC and NULLS FIRST on
 * DESC - the Postgres `ORDER BY` default - folding the direction flip in here (rather than in
 * `sortDocuments`) since the null placement and the value comparison flip in opposite ways. */
const compareForSort = (opts: {
  left: unknown;
  right: unknown;
  field: string;
  direction: string;
}): number => {
  const { left, right, field, direction } = opts;
  const isDesc = direction === Sorts.DESC;
  const isLeftMissing = left === undefined || left === null;
  const isRightMissing = right === undefined || right === null;

  if (isLeftMissing && isRightMissing) {
    return 0;
  }

  if (isLeftMissing) {
    return isDesc ? -1 : 1;
  }

  if (isRightMissing) {
    return isDesc ? 1 : -1;
  }

  const comparison = compareOrderable({ left, right, field });
  return isDesc ? -comparison : comparison;
};

/** Range operators (gt/gte/lt/lte/between) never match a missing or `null` field - they return
 * `false` instead of throwing, so an optional/unset field simply excludes the document from the
 * range (mirrors SQL, where any comparison against `NULL` is UNKNOWN). */
const matchesRange = (opts: {
  actual: unknown;
  operand: unknown;
  operator: string;
  field: string;
}): boolean => {
  const { actual, operand, operator, field } = opts;

  if (actual === undefined || actual === null) {
    return false;
  }

  switch (operator) {
    case QueryOperators.GT: {
      return compareOrderable({ left: actual, right: operand, field }) > 0;
    }
    case QueryOperators.GTE: {
      return compareOrderable({ left: actual, right: operand, field }) >= 0;
    }
    case QueryOperators.LT: {
      return compareOrderable({ left: actual, right: operand, field }) < 0;
    }
    case QueryOperators.LTE: {
      return compareOrderable({ left: actual, right: operand, field }) <= 0;
    }
    case QueryOperators.BETWEEN: {
      if (!Array.isArray(operand) || operand.length !== 2) {
        throw getError({
          message: `[MemoryRepository][where-matcher] 'between' requires a [min, max] tuple | field: '${field}' | value: ${JSON.stringify(operand)}`,
        });
      }
      const [min, max] = operand;
      return (
        compareOrderable({ left: actual, right: min, field }) >= 0 &&
        compareOrderable({ left: actual, right: max, field }) <= 0
      );
    }
    default: {
      throw getError({
        message: `[MemoryRepository][where-matcher] Unreachable range operator '${operator}' | field: '${field}'`,
      });
    }
  }
};

const escapeRegExpMetachars = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Converts a SQL LIKE pattern (`%` = any run of characters, `_` = exactly one character) into an
 * anchored RegExp. A backslash-escaped `\%`, `\_`, or `\\` is honored as a literal character rather
 * than a wildcard - every other character is escaped as a plain regex metachar. */
const likePatternToRegExp = (opts: { pattern: string; isCaseInsensitive: boolean }): RegExp => {
  const { pattern, isCaseInsensitive } = opts;
  let source = '';

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === '\\' && (next === '%' || next === '_' || next === '\\')) {
      source += escapeRegExpMetachars(next);
      index++;
      continue;
    }

    if (char === '%') {
      source += '.*';
      continue;
    }

    if (char === '_') {
      source += '.';
      continue;
    }

    source += escapeRegExpMetachars(char);
  }

  return new RegExp(`^${source}$`, isCaseInsensitive ? 'is' : 's');
};

/** LIKE/ILIKE only ever match a string field - a non-string field (including a missing/undefined
 * one) simply does not match rather than throwing a type error. */
const matchesPattern = (opts: {
  actual: unknown;
  operand: unknown;
  isCaseInsensitive: boolean;
  field: string;
}): boolean => {
  const { actual, operand, isCaseInsensitive, field } = opts;

  if (typeof operand !== 'string') {
    throw getError({
      message: `[MemoryRepository][where-matcher] like/ilike requires a string pattern | field: '${field}' | value: ${JSON.stringify(operand)}`,
    });
  }

  if (typeof actual !== 'string') {
    return false;
  }

  return likePatternToRegExp({ pattern: operand, isCaseInsensitive }).test(actual);
};

const matchesField = (opts: {
  document: Record<string, unknown>;
  field: string;
  condition: unknown;
}): boolean => {
  const { document, field, condition } = opts;
  const actual = document[field];

  // A bare array condition (`{ field: [1, 2] }`) is `inq` shorthand - matches Postgres' `inArray()`
  // (filter.ts) and Typesense's `field:=[...]` (query-dialect.ts), not reference/deep equality
  // against the array itself.
  if (Array.isArray(condition)) {
    return includesValue({ haystack: condition, actual });
  }

  if (!isOperatorObject(condition)) {
    return deepEqual(actual, condition);
  }

  for (const operator in condition) {
    const operand = condition[operator];

    switch (operator) {
      case QueryOperators.EQ: {
        if (!deepEqual(actual, operand)) {
          return false;
        }
        break;
      }
      case QueryOperators.NEQ:
      case QueryOperators.NE: {
        // A missing field never matches `neq` - mirrors SQL/Typesense semantics (unknown vs.
        // provably-not-equal are different things).
        if (actual === undefined || deepEqual(actual, operand)) {
          return false;
        }
        break;
      }
      case QueryOperators.GT:
      case QueryOperators.GTE:
      case QueryOperators.LT:
      case QueryOperators.LTE:
      case QueryOperators.BETWEEN: {
        if (!matchesRange({ actual, operand, operator, field })) {
          return false;
        }
        break;
      }
      case QueryOperators.LIKE: {
        if (!matchesPattern({ actual, operand, isCaseInsensitive: false, field })) {
          return false;
        }
        break;
      }
      case QueryOperators.ILIKE: {
        if (!matchesPattern({ actual, operand, isCaseInsensitive: true, field })) {
          return false;
        }
        break;
      }
      case QueryOperators.INQ:
      case QueryOperators.IN: {
        if (!Array.isArray(operand)) {
          throw getError({
            message: `[MemoryRepository][where-matcher] inq requires an array value | field: '${field}' | value: ${JSON.stringify(operand)}`,
          });
        }
        if (!includesValue({ haystack: operand, actual })) {
          return false;
        }
        break;
      }
      case QueryOperators.NIN: {
        if (!Array.isArray(operand)) {
          throw getError({
            message: `[MemoryRepository][where-matcher] nin requires an array value | field: '${field}' | value: ${JSON.stringify(operand)}`,
          });
        }
        // A missing field never matches `nin` either - same rationale as `neq` above.
        if (actual === undefined || includesValue({ haystack: operand, actual })) {
          return false;
        }
        break;
      }
      default: {
        throw getError({
          message: `[MemoryRepository][where-matcher] Unsupported operator '${operator}' | field: '${field}' - the memory connector translates eq/neq/gt/gte/lt/lte/like/ilike/inq/nin/between/and/or only.`,
        });
      }
    }
  }

  return true;
};

/** Evaluates a `TWhere` against a plain-JS document - and/or recurse, everything else is a field-level condition. */
export const matchesWhere = (opts: {
  document: Record<string, unknown>;
  where?: TWhere;
}): boolean => {
  const { document, where } = opts;

  if (!where) {
    return true;
  }

  for (const key in where) {
    // TWhere<T = any> is a mapped-over-`any` type (see base/repositories/common/types.ts) with no
    // narrower runtime shape to recover here; `unknown` is the honest type for a `for...in` value.
    const value: unknown = where[key];

    if (value === undefined) {
      continue;
    }

    switch (key) {
      case QueryOperators.AND: {
        // A non-array `and`/`or` value is wrapped into a single-element array - mirrors Postgres'
        // `buildLogicalGroupCondition` (filter.ts) and Typesense's `buildLogicalGroup` (query-dialect.ts).
        // Recursing into TWhere's own (`any`-shaped) clause list can't be runtime-validated further than "is an array".
        const clauses = (Array.isArray(value) ? value : [value]) as TWhere[];
        if (!clauses.every(clause => matchesWhere({ document, where: clause }))) {
          return false;
        }
        break;
      }
      case QueryOperators.OR: {
        const clauses = (Array.isArray(value) ? value : [value]) as TWhere[];
        if (!clauses.some(clause => matchesWhere({ document, where: clause }))) {
          return false;
        }
        break;
      }
      default: {
        if (!matchesField({ document, field: key, condition: value })) {
          return false;
        }
      }
    }
  }

  return true;
};

/** Sorts documents per the `order` vocabulary (`'field ASC' | 'field DESC'`, direction optional -
 * defaults to ASC, case-insensitive). Stable across multiple order entries (first entry wins ties). */
export const sortDocuments = (opts: {
  documents: Array<Record<string, unknown>>;
  order: string[];
}): Array<Record<string, unknown>> => {
  const { documents, order } = opts;

  const parsedOrder = order.map(entry => {
    const [field, direction = Sorts.ASC] = entry.trim().split(/\s+/);
    const normalizedDirection = direction.toLowerCase();

    if (!Sorts.isValid(normalizedDirection)) {
      throw getError({
        message: `[MemoryRepository][where-matcher] Invalid sort direction '${direction}' for field '${field}'`,
      });
    }

    return { field, direction: normalizedDirection };
  });

  return [...documents].sort((left, right) => {
    for (const { field, direction } of parsedOrder) {
      const comparison = compareForSort({
        left: left[field],
        right: right[field],
        field,
        direction,
      });

      if (comparison !== 0) {
        return comparison;
      }
    }

    return 0;
  });
};
