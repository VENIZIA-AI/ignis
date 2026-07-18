import type { ISearchQuery } from '@/connectors/search/repositories/common';

/** Typesense-only search params written by `TypesenseQueryDialect`, mapped to snake_case wire by
 * `toWireParams`. Engine-specific tuning travels through `engineParams` under the engine's own
 * wire names, so it needs no typed field here. */
export interface ITypesenseSearchQuery extends ISearchQuery {
  /** Typesense's `<field>:([v1, v2], k: N, alpha: A)` vector-search clause. */
  vectorQuery?: string;

  /** Forced off for semantic/hybrid - remote embedders reject prefix search; passes through unmapped (same wire name). */
  prefix?: boolean | string;
}
