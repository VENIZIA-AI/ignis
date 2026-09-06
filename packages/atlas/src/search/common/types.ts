import type { TCorpus } from '@/common';

/** One search result: a chunk ranked by `bm25()`, with a query-context snippet from its body. */
export interface IHit {
  id: string;
  corpus: TCorpus;
  title: string;
  headingPath: string;
  anchor: string;
  snippet: string;
  score: number;
}

/** The two FTS5 `MATCH` strings `QueryPlanner` builds from one query: all terms, then any term. */
export interface IQueryPlan {
  and: string;
  or: string;
  corpus?: TCorpus;
}
