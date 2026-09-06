import { AtlasConstants } from '@/common';
import type { TCorpus } from '@/common';
import type { IToolHandler } from '@/protocol/common';
import type { IHit } from '@/search/common';
import type { ChunkStore } from '@/search/store';
import { z } from 'zod';
import { parseInput, SearchInputSchema } from './common';

const DESCRIPTION =
  'Search the wiki, changelogs and knowledge bundle for chunks matching a keyword query, ranked by relevance.';

type TSearchCorpus = z.infer<typeof SearchInputSchema>['corpus'];

interface ISearchToolResponse {
  total: number;
  hits: IHit[];
}

/** `'all'` (or omitted) means no corpus filter; every other value is already a `TCorpus`. */
const corpusFilterOf = (opts: { corpus?: TSearchCorpus }): TCorpus | undefined => {
  if (opts.corpus === undefined || opts.corpus === 'all') {
    return undefined;
  }

  return opts.corpus;
};

/** Drops trailing hits until the JSON reply fits `SEARCH_BUDGET_CHARS`; `total` is left untouched, and the last hit always survives. */
const withinBudget = (opts: { response: ISearchToolResponse }): ISearchToolResponse => {
  const hits = [...opts.response.hits];
  let response: ISearchToolResponse = { total: opts.response.total, hits };

  while (hits.length > 1 && JSON.stringify(response).length > AtlasConstants.SEARCH_BUDGET_CHARS) {
    hits.pop();
    response = { total: opts.response.total, hits };
  }

  return response;
};

export const buildSearchTool = (opts: { store: ChunkStore }): IToolHandler => ({
  definition: {
    name: 'search',
    description: DESCRIPTION,
    inputSchema: z.toJSONSchema(SearchInputSchema),
  },
  call: async ({ args }) => {
    const input = parseInput({ schema: SearchInputSchema, args });
    const result = opts.store.search({
      query: input.query,
      corpus: corpusFilterOf({ corpus: input.corpus }),
      limit: input.limit ?? AtlasConstants.SEARCH_DEFAULT_LIMIT,
      offset: input.offset ?? 0,
    });

    return withinBudget({ response: result });
  },
});
