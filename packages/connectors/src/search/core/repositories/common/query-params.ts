import type { ISearchQuery } from './types';

/** List-shaped friendly fields that are comma-joined into their single `ISearchQuery` wire form. */
const MULTI_SEARCH_LIST_FIELDS = new Set([
  'queryBy',
  'includeFields',
  'excludeFields',
  'facetBy',
  'highlightFields',
  'highlightFullFields',
  'groupBy',
  'queryByWeights',
]);

/** Friendly multi-search params -> `ISearchQuery`: list fields comma-joined, the rest pass through; keeps `search()`, `multiSearch()` and `commonParams` on one friendly-to-wire path. */
export const toSearchQueryParams = (input: Record<string, unknown>): Partial<ISearchQuery> => {
  const params: Record<string, unknown> = {};

  const inputEntries = Object.entries(input);
  for (const [key, value] of inputEntries) {
    if (value === undefined || key === 'collection') {
      continue;
    }

    params[key] =
      MULTI_SEARCH_LIST_FIELDS.has(key) && Array.isArray(value) ? value.join(',') : value;
  }

  return params as Partial<ISearchQuery>;
};
