import { QueryOperators, type TFields } from '@venizia/ignis-filter';
import { getError } from '@venizia/ignis-helpers/core';
import { SearchErrors } from '@/search/core/common/errors';
import type { ISearchCompileCapabilities, TCompiledWhere } from './types';
import { SearchFilterOutcomes } from './types';

/** Dialect-shared pure helpers, shared once rather than byte-copied per dialect; not barrel-exported, not part of the connector's public surface. */

/** skip/offset -> 1-based page number. Requires a page size, and the skip must land on a page boundary. */
export const toSearchPage = (opts: { skip: number; limit?: number }): number => {
  const { skip, limit } = opts;

  if (limit === undefined) {
    throw getError({
      message:
        '[SearchQueryDialect][toPage] skip/offset requires limit for search() pagination - a page cannot be expressed without a page size',
    });
  }

  if (skip % limit !== 0) {
    throw getError({
      message:
        '[SearchQueryDialect][toPage] skip must be a multiple of limit for search pagination',
    });
  }

  return Math.floor(skip / limit) + 1;
};

/** `fields` (array form, or object form keeping only `true` keys) -> comma-joined include list. */
export const toFieldsCsv = (opts: { fields: TFields }): string => {
  const { fields } = opts;

  if (Array.isArray(fields)) {
    return fields.join(',');
  }

  const included: string[] = [];
  for (const key in fields) {
    if (fields[key] === true) {
      included.push(key);
    }
  }

  return included.join(',');
};

/**
 * A `{ gte: 1 }`-style operator map: non-null, non-array, non-Date, at least one key, and EVERY
 * key a known operator. The every-key test mirrors the relational reference
 * (relational/repositories/dialect/filter.ts:546-559) rather than accepting any non-empty object.
 *
 * Without it `{ meta: { foo: 1 } }` read as an operator map and reported "does not support
 * operator 'foo'", naming a key the caller never meant as an operator; it now falls through to
 * the value path and is rejected for what it actually is - an object where a scalar belongs.
 */
export const isOperatorObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }

  return keys.every(key => QueryOperators.isValid(key));
};

/**
 * AND of two compiled clauses: `matchNone` absorbs, `matchAll` is the identity. This is the
 * algebra string-joining could not express, and the reason an empty permission disjunction now
 * survives into the query instead of evaporating out of it.
 */
export const andCompiled = (
  left: TCompiledWhere,
  right: TCompiledWhere,
  joiner: string,
): TCompiledWhere => {
  if (
    left.outcome === SearchFilterOutcomes.MATCH_NONE ||
    right.outcome === SearchFilterOutcomes.MATCH_NONE
  ) {
    return { outcome: SearchFilterOutcomes.MATCH_NONE };
  }

  if (left.outcome === SearchFilterOutcomes.MATCH_ALL) {
    return right;
  }

  if (right.outcome === SearchFilterOutcomes.MATCH_ALL) {
    return left;
  }

  return {
    outcome: SearchFilterOutcomes.FILTER,
    filterBy: `${left.filterBy}${joiner}${right.filterBy}`,
  };
};

/** OR of two compiled clauses - the dual of `andCompiled`: `matchAll` absorbs, `matchNone` is the identity. */
export const orCompiled = (
  left: TCompiledWhere,
  right: TCompiledWhere,
  joiner: string,
): TCompiledWhere => {
  if (
    left.outcome === SearchFilterOutcomes.MATCH_ALL ||
    right.outcome === SearchFilterOutcomes.MATCH_ALL
  ) {
    return { outcome: SearchFilterOutcomes.MATCH_ALL };
  }

  if (left.outcome === SearchFilterOutcomes.MATCH_NONE) {
    return right;
  }

  if (right.outcome === SearchFilterOutcomes.MATCH_NONE) {
    return left;
  }

  return {
    outcome: SearchFilterOutcomes.FILTER,
    filterBy: `${left.filterBy}${joiner}${right.filterBy}`,
  };
};

/** Folds a clause list, seeded with that operator's IDENTITY so an empty list lands on it: `and: []` -> matchAll (vacuously true), `or: []` -> matchNone (absorbing false). */
export const reduceCompiled = (opts: {
  clauses: TCompiledWhere[];
  isDisjunction: boolean;
  joiner: string;
}): TCompiledWhere => {
  const { clauses, isDisjunction, joiner } = opts;
  const combine = isDisjunction ? orCompiled : andCompiled;
  const identity: TCompiledWhere = isDisjunction
    ? { outcome: SearchFilterOutcomes.MATCH_NONE }
    : { outcome: SearchFilterOutcomes.MATCH_ALL };

  return clauses.reduce((accumulated, clause) => combine(accumulated, clause, joiner), identity);
};

/** Parenthesises a compiled group; the absorbing outcomes carry no string to wrap. */
export const parenthesize = (compiled: TCompiledWhere): TCompiledWhere =>
  compiled.outcome === SearchFilterOutcomes.FILTER
    ? { outcome: SearchFilterOutcomes.FILTER, filterBy: `(${compiled.filterBy})` }
    : compiled;

/** Wraps a filter string as a compiled clause. */
export const toFilterClause = (filterBy: string): TCompiledWhere => ({
  outcome: SearchFilterOutcomes.FILTER,
  filterBy,
});

/**
 * Rejects a field name the collection does not declare, mirroring the relational reference which
 * resolves every name against the table's columns and throws `Column NOT FOUND`
 * (relational/repositories/dialect/filter.ts:377-382 for `where`, :423-428 for `order`). Without it
 * the name compiles verbatim and the ENGINE's rejection surfaces as an infrastructure failure
 * rather than a 400 naming the field.
 *
 * ONE judgment, shared by both paths a caller can name a field from - `where` and `order` - so the
 * two cannot drift into disagreeing about what exists. `method` only labels the message with the
 * path that asked; it never changes the answer.
 *
 * Absent `fields` means unvalidated, not "no fields": an entity carrying no collection definition
 * must compile exactly as it did before this check existed.
 *
 * Membership is the WHOLE judgment - a dotted name is not special. Under Typesense's
 * `enable_nested_fields` a dotted name is an ordinary field name, so `merchantName.en` passes when
 * declared and `metadata.foo` fails when not, for the only reason that is true of it.
 *
 * Hidden fields stay filterable on purpose - `FilterBuilder` does not consult `hiddenProperties`
 * either, and diverging from the reference is not this change's business.
 */
export const assertKnownField = (opts: {
  field: string;
  engine: string;
  capabilities?: ISearchCompileCapabilities;
  method?: string;
}): void => {
  const { field, engine, capabilities, method = 'compileWhere' } = opts;

  if (!capabilities?.fields || capabilities.fields.has(field)) {
    return;
  }

  throw getError({
    error: SearchErrors.UNKNOWN_FIELD,
    message: `[${engine}QueryDialect][${method}] search() Field NOT FOUND | field: '${field}' | engine: '${engine}' | the collection definition declares no such field`,
  });
};

/** Rejects an operator this engine cannot express, naming BOTH so the caller knows it is the engine choice - not the operator - that decides it. */
export const throwUnsupportedOperator = (opts: {
  operator: string;
  field: string;
  engine: string;
  reason?: string;
}): never => {
  const { operator, field, engine, reason } = opts;

  throw getError({
    error: SearchErrors.UNSUPPORTED_OPERATOR,
    message: `[${engine}QueryDialect][compileWhere] search() does not support operator '${operator}' | operator: '${operator}' | engine: '${engine}' | field: '${field}'${reason ? ` | ${reason}` : ''}`,
  });
};
