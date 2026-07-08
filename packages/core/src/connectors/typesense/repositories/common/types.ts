import { TFilter, TWhere } from '@/base/repositories/common';

/** Search-engine query parameters produced by translating a repository-level TFilter. Shaped after
 * Typesense's search params, but pure data - no SDK import. Field names here are camelCase; the
 * engine's snake_case wire format is produced only at the dialect's `toWireParams` boundary. */
export interface ISearchQuery {
  /** Search query string. Use '*' for pure filter listings (no full-text search term). */
  q: string;
  filterBy?: string;
  sortBy?: string;
  page?: number;
  perPage?: number;
  includeFields?: string;
  excludeFields?: string;

  // Native offset pagination for engines that support it; the Typesense dialect keeps page/perPage and never sets this.
  offset?: number;

  // Field-list form of `q` for keyword/hybrid search (Typesense's comma-joined `query_by` wire field).
  queryBy?: string;

  // Vector-search clause produced by `toVectorQuery` (Typesense's `<field>:([...], k: N, alpha: A)` syntax).
  vectorQuery?: string;

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

  // Search tuning
  numTypos?: number | string;
  prefix?: boolean | string;
  infix?: string;
  useCache?: boolean;
  cacheTtl?: number;
  exhaustiveSearch?: boolean;
  pinnedHits?: string;
  hiddenHits?: string;
}

/** Translates repository-level `TFilter`/`TWhere` into a search-engine-specific query. */
export interface ISearchQueryDialect {
  build(opts: { filter?: TFilter; hiddenFields?: string[] }): ISearchQuery;
  toWhere(opts: { where: TWhere }): string;

  /** Builds the engine-specific vector-search clause. Empty `nearVector`/omitted means auto-embed (server-side vector generation). */
  toVectorQuery(opts: {
    field: string;
    nearVector?: number[];
    k?: number;
    alpha?: number;
    distanceThreshold?: number;
    ef?: number;
  }): { vectorQuery: string };

  /** Maps a camelCase `ISearchQuery` (or any camelCase query record) onto the engine's wire-format
   * field names (e.g. Typesense's snake_case) via a key lookup, never via a snake_case identifier. */
  toWireParams(opts: { query: Record<string, unknown> }): Record<string, unknown>;
}
