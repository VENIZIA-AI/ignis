import type { ISearchResult } from '@/search/core';

/** `--max-per-page`: Typesense refuses a page larger than this, so a bigger caller limit is served as consecutive windows of one multi_search call rather than as several calls. */
export const MAX_HITS_PER_PAGE = 250;

/** `limit_multi_searches`: entries permitted in ONE multi_search call, which bounds windowing at 50 x 250 = 12,500 hits. Exceeding it is refused, never silently truncated. */
export const MAX_MULTI_SEARCH_ENTRIES = 50;

/** One window of a split page: an entry differs from its siblings only in where it starts. */
export interface ISearchWindow {
  offset: number;
  limit: number;
}

/**
 * Splits a requested page into windows the engine will accept.
 *
 * Windows are expressed as `offset`/`limit` rather than `page`/`per_page` because only offset
 * arithmetic can start a window anywhere - which is also what lets a caller's `skip` land off a
 * page boundary. Exactly one pagination pair is ever sent: Typesense documents `offset`/`limit`
 * and `page`/`per_page` as alternatives and does not state which wins if both appear, so the
 * question is designed out rather than answered.
 */
export const toSearchWindows = (opts: { offset: number; limit: number }): ISearchWindow[] => {
  const { offset, limit } = opts;

  if (limit <= MAX_HITS_PER_PAGE) {
    return [{ offset, limit }];
  }

  const windows: ISearchWindow[] = [];
  for (let start = 0; start < limit; start += MAX_HITS_PER_PAGE) {
    windows.push({ offset: offset + start, limit: Math.min(MAX_HITS_PER_PAGE, limit - start) });
  }

  return windows;
};

/**
 * Folds windowed responses into the single result the caller asked for.
 *
 * `found`/`outOf` come from the first window because every window ran the same filter and reports
 * the same total. `facetCounts` likewise: facets are computed over the whole result set, not the
 * page, so concatenating them would multiply every count by the window count.
 */
export const mergeWindowedResults = <TDocument extends object>(
  results: ISearchResult<TDocument>[],
): ISearchResult<TDocument> => {
  const [first] = results;

  if (results.length === 1) {
    return first;
  }

  const merged: ISearchResult<TDocument> = {
    found: first.found,
    // AND-folded: the total is only exact if EVERY window ran to completion. One cut-off window
    // makes the merged count an estimate, and saying otherwise would relaunch the bug above.
    isFoundExact: results.every(result => result.isFoundExact),
  };

  if (first.outOf !== undefined) {
    merged.outOf = first.outOf;
  }

  // MAX, not sum: this field is read as latency, and the windows travel in ONE round trip. Summing
  // would make a windowed query graph at several times its actual wall-clock.
  const timings = results
    .map(result => result.searchTimeMs)
    .filter((value): value is number => typeof value === 'number');
  if (timings.length > 0) {
    merged.searchTimeMs = Math.max(...timings);
  }

  if (first.facetCounts) {
    merged.facetCounts = first.facetCounts;
  }

  const hits = results.flatMap(result => result.hits ?? []);
  if (hits.length > 0) {
    merged.hits = hits;
  }

  return merged;
};

/**
 * Reads the requested page out of engine-native params, whichever pair the caller used.
 *
 * `mode: 'raw'` hands these params through untouched, so both spellings have to be understood
 * here; the caller is never asked to normalize.
 */
export const readRequestedPage = (params: Record<string, unknown>): ISearchWindow | undefined => {
  const limit = typeof params['limit'] === 'number' ? params['limit'] : undefined;
  const perPage = typeof params['per_page'] === 'number' ? params['per_page'] : undefined;
  const effectiveLimit = limit ?? perPage;

  if (effectiveLimit === undefined) {
    return undefined;
  }

  const offset = typeof params['offset'] === 'number' ? params['offset'] : undefined;
  const page = typeof params['page'] === 'number' ? params['page'] : undefined;
  const effectiveOffset = offset ?? (page !== undefined ? (page - 1) * effectiveLimit : 0);

  return { offset: effectiveOffset, limit: effectiveLimit };
};

/** Empty TSearchResponse shape returned when search() tolerates a missing collection; built via bracket assignment so no snake_case identifier is declared here. */
export const buildEmptySearchResponse = (): unknown => {
  const response: Record<string, unknown> = { found: 0, page: 1, hits: [] };
  response['out_of'] = 0;
  response['search_time_ms'] = 0;
  response['request_params'] = {};
  return response;
};
