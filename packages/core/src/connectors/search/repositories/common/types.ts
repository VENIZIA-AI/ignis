import type { TFilter, TWhere } from '@/base/repositories/common';
import type { SearchModes, TSearchInput } from './constants';

/** Search-engine query parameters produced by translating a repository-level TFilter. Only the
 * cross-engine intersection lives here; an engine's own tuning knobs belong on its own extension of
 * this interface. Field names are camelCase; the engine's wire format is produced only at the
 * dialect's `toWireParams` boundary. */
export interface ISearchQuery {
  /** Full-text search term. Use '*' for pure filter listings. */
  query: string;
  filterBy?: string;
  sortBy?: string;
  page?: number;
  perPage?: number;
  includeFields?: string;
  excludeFields?: string;

  // Native offset pagination for engines that support it; the Typesense dialect keeps page/perPage and never sets this.
  offset?: number;

  // Field-list form of `q` for keyword/hybrid search, comma-joined.
  queryBy?: string;

  // Per-field relevance weights paralleling `queryBy`, comma-joined (e.g. '2,1').
  queryByWeights?: string;

  // Faceting
  facetBy?: string;
  facetQuery?: string;
  maxFacetValues?: number;

  // Highlighting
  highlightFields?: string;
  highlightFullFields?: string;
  highlightStartTag?: string;
  highlightEndTag?: string;
  snippetThreshold?: number;

  // Grouping
  groupBy?: string;
  groupLimit?: number;
  groupMissingValues?: boolean;

  /** Engine-native wire parameters, merged last into `toWireParams` output verbatim and unvalidated.
   * Keys use the engine's own vocabulary (`num_typos`, not `numTypos`). */
  engineParams?: Record<string, unknown>;
}

/** Translates repository-level `TFilter`/`TWhere` into a search-engine-specific query. */
export interface ISearchQueryDialect {
  build(opts: { filter?: TFilter; hiddenFields?: string[] }): ISearchQuery;
  toWhere(opts: { where: TWhere }): string;

  /** Writes every engine-specific consequence of a non-raw search input onto `query` (mode
   * dispatch, vector clause, tuning knobs) - keeping `ReadableSearchRepository` engine-free. */
  applySearchInput(opts: {
    query: ISearchQuery;
    input: Exclude<TSearchInput, { mode: typeof SearchModes.RAW }>;
  }): void;

  /** Maps a camelCase `ISearchQuery` (or any camelCase query record) onto the engine's wire-format
   * field names via a key lookup, never via a wire-cased identifier. `engineParams` merges last. */
  toWireParams(opts: { query: Partial<ISearchQuery> }): Record<string, unknown>;
}
