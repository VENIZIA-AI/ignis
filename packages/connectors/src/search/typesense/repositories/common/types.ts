import type { ISearchQuery } from '@/search/core/repositories/common';

/** What `infix` takes per field: Typesense's `OperationMode`. */
export type TTypesenseOperationMode = 'off' | 'always' | 'fallback';

/** How Typesense combines the scores of several matching fields: its `text_match_type` values. */
export type TTypesenseTextMatchType = 'max_score' | 'max_weight' | 'sum_score';

/**
 * Typesense tuning params in camelCase, mapped to the wire names by `TypesenseQueryDialect` (`numTypos` -> `num_typos`).
 * They are accepted as fields of `ITypesenseSearchQuery` and as keys of `engineParams`, next to wire-named keys, which still pass verbatim.
 * The numeric ones must be non-negative integers; anything else is a 400 before a request.
 */
export interface ITypesenseTuning {
  /** Typos allowed per match; a list sets it per `queryBy` field. */
  numTypos?: number | number[];
  dropTokensThreshold?: number;
  typoTokensThreshold?: number;
  /** Match inside a word, per field when a list. */
  infix?: TTypesenseOperationMode | TTypesenseOperationMode[];
  prioritizeExactMatch?: boolean;
  prioritizeTokenPosition?: boolean;
  prioritizeNumMatchingFields?: boolean;
  textMatchType?: TTypesenseTextMatchType;
  rerankHybridMatches?: boolean;
  useCache?: boolean;
  /** Seconds a cached result is served. */
  cacheTtl?: number;
}

/** Typesense-only search params written by `TypesenseQueryDialect`, mapped to snake_case wire by `toWireParams`; engine-specific tuning travels through `engineParams` under the engine's own wire names, so it needs no typed field here. */
export interface ITypesenseSearchQuery extends ISearchQuery, ITypesenseTuning {
  /** Typesense's `<field>:([v1, v2], k: N, alpha: A)` vector-search clause. */
  vectorQuery?: string;

  /** Forced off for semantic/hybrid - remote embedders reject prefix search; passes through unmapped (same wire name). */
  prefix?: boolean | string;

  /**
   * Page size for OFFSET pagination - Typesense's companion to `offset`, and the counterpart of
   * `perPage` in the page/per_page pair. The dialect emits one pair or the other and never both,
   * because Typesense documents them as alternatives without stating which wins when both appear.
   * Passes through unmapped (same wire name).
   */
  limit?: number;
}
