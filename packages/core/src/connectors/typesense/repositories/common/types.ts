import type { ISearchQuery } from '@/connectors/search/repositories/common';

/**
 * Typesense-only search parameters. Neutral callers never see these - `TypesenseQueryDialect` is the
 * only writer, via `applySearchInput`, and `toWireParams` maps them onto Typesense's snake_case wire.
 */
export interface ITypesenseSearchQuery extends ISearchQuery {
  /** Typesense's `<field>:([v1, v2], k: N, alpha: A)` vector-search clause. */
  vectorQuery?: string;

  numTypos?: number | string;
  prefix?: boolean | string;
  infix?: string;
  prioritizeExactMatch?: boolean;
  dropTokensThreshold?: number;
  useCache?: boolean;
  cacheTtl?: number;
  exhaustiveSearch?: boolean;
  pinnedHits?: string;
  hiddenHits?: string;

  /** Saved server-side search preset; passes through unmapped (same wire name). */
  preset?: string;
}
