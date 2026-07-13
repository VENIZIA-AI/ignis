import type { ISearchQuery } from '@/connectors/search/repositories/common';

/**
 * Typesense-only search parameters written by `TypesenseQueryDialect` and mapped onto Typesense's
 * snake_case wire by `toWireParams`. Neutral callers never see these: engine-specific tuning
 * (`num_typos`, `pinned_hits`, `use_cache`, ...) travels through `engineParams` under the engine's
 * own wire names, so it needs no typed field here.
 */
export interface ITypesenseSearchQuery extends ISearchQuery {
  /** Typesense's `<field>:([v1, v2], k: N, alpha: A)` vector-search clause. */
  vectorQuery?: string;

  /** Forced off for semantic/hybrid - remote embedders reject prefix search; passes through unmapped (same wire name). */
  prefix?: boolean | string;
}
