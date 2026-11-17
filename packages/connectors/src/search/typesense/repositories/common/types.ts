import type { ISearchQuery } from '@/search/core/repositories/common';

/** What `infix` takes per field: Typesense's `OperationMode`. */
export type TTypesenseOperationMode = 'off' | 'always' | 'fallback';

/** How Typesense combines the scores of several matching fields: its `text_match_type` values. */
export type TTypesenseTextMatchType = 'max_score' | 'max_weight' | 'sum_score';

/**
 * Typesense tuning params in camelCase, mapped to the wire names by `TypesenseQueryDialect` (`numTypos` -> `num_typos`).
 * They are accepted as fields of `ITypesenseSearchQuery` and as keys of `engineParams`, next to wire-named keys, which still pass verbatim.
 * The numeric ones must be non-negative integers (`maxCandidates`: positive); anything else is a 400 before a request.
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
  /** How many candidate documents Typesense considers for a typo or prefix match; a positive integer. */
  maxCandidates?: number;
  /**
   * Typesense's own `sort_by`, for the sorts `filter.order` cannot name: `_text_match:desc,_eval([(status:=ACTIVATED):1]):desc,createdAt:desc`.
   * At most three top-level entries, `_eval(...)` counted as one; field names are Typesense's to check. Give it instead of `filter.order`, never with it.
   *
   * @example
   * ```typescript
   * import { DefaultSearchRepository } from '@venizia/ignis-connectors/typesense';
   *
   * declare const repository: DefaultSearchRepository<{ name: string }>;
   *
   * await repository.search({
   *   mode: 'keyword',
   *   query: 'shoes',
   *   queryBy: ['name'],
   *   engineParams: { sortBy: '_text_match:desc,createdAt:desc' },
   * });
   * ```
   */
  sortBy?: string;
}

/** Typesense-only search params written by `TypesenseQueryDialect`, mapped to snake_case wire by `toWireParams`; tuning not typed here travels through `engineParams` under the engine's own wire names. */
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
