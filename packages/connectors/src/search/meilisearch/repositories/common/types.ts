import type { ISearchQuery } from '@/search/core/repositories/common';

/** Meilisearch-only search parameters. `MeilisearchQueryDialect` is the only writer. */
export interface IMeilisearchSearchQuery extends ISearchQuery {
  /** `semanticRatio` 0..1: 0 = pure keyword, 1 = pure vector. `embedder` names an `embedders` entry. */
  hybrid?: { semanticRatio: number; embedder: string };

  /** Caller-supplied query vector, used with a `userProvided` embedder or to bypass auto-embedding. */
  vector?: number[];
}
