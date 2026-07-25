import type { TFields } from '@/base/repositories/query-schemas';
import { getError } from '@venizia/ignis-helpers';

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

/** A non-null, non-array object carrying at least one key - i.e. a `{ gte: 1 }`-style operator map. */
export const isOperatorObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return false;
  }

  return Object.keys(value).length > 0;
};
