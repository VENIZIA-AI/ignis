import { AtlasConstants } from '@/common';
import type { TCorpus } from '@/common';
import type { IToolHandler } from '@/protocol/common';
import type { IHit } from '@/search/common';
import type { ChunkStore } from '@/search/store';
import type { ISymbolBrief, SymbolStore } from '@/symbols';
import { z } from 'zod';
import { parseInput, SearchInputSchema } from './common';

const DESCRIPTION =
  'Search the wiki, changelogs and knowledge bundle for chunks matching a keyword query, ranked ' +
  "by relevance. Each hit's `score` is bm25 times authority, lower is better, only comparable " +
  'within one response. The reply size budget can return fewer hits than `limit` - page with ' +
  '`offset: nextOffset` (present only when more hits remain) to see every hit exactly once.';

// Built once at module load - `z.toJSONSchema` is pure over the schema, so a guarded tool that
// re-resolves its store on every call never needs to rebuild this.
const INPUT_JSON_SCHEMA = z.toJSONSchema(SearchInputSchema);

type TSearchCorpus = z.infer<typeof SearchInputSchema>['corpus'];

interface ISearchToolResponse {
  total: number;
  returned: number;
  symbol?: ISymbolBrief;
  hits: IHit[];
  nextOffset?: number;
}

/** The query as one word, or `undefined` for prose - a multi-word query never names a symbol. */
const identifierOf = (opts: { query: string }): string | undefined => {
  const tokens = opts.query.trim().split(/\s+/);
  return tokens.length === 1 ? tokens[0] : undefined;
};

/** The first exact match for a single-identifier query; absent for prose, or a name no table knows. */
const symbolBriefOf = (opts: {
  symbols?: SymbolStore;
  query: string;
}): ISymbolBrief | undefined => {
  const identifier = identifierOf({ query: opts.query });
  if (!opts.symbols || identifier === undefined) {
    return undefined;
  }

  const [record] = opts.symbols.lookup({ name: identifier });
  if (!record) {
    return undefined;
  }

  return {
    name: record.name,
    package: record.package,
    specifier: record.specifier,
    kind: record.kind,
    file: record.file,
    line: record.line,
  };
};

/** `'all'` (or omitted) means no corpus filter; every other value is already a `TCorpus`. */
const corpusFilterOf = (opts: { corpus?: TSearchCorpus }): TCorpus | undefined => {
  if (opts.corpus === undefined || opts.corpus === 'all') {
    return undefined;
  }

  return opts.corpus;
};

/**
 * `nextOffset` is where this page's own hits end, not `offset + limit` - the budget below can
 * return fewer hits than `limit`, and a caller that paged by `offset + limit` instead would skip
 * every hit the budget trimmed. Absent once there is nothing left to page to.
 */
const responseOf = (opts: {
  total: number;
  hits: IHit[];
  offset: number;
  symbol?: ISymbolBrief;
}): ISearchToolResponse => {
  const { total, hits, offset, symbol } = opts;
  const nextOffset = offset + hits.length;
  const response: ISearchToolResponse = symbol
    ? { total, returned: hits.length, symbol, hits }
    : { total, returned: hits.length, hits };

  return nextOffset < total ? { ...response, nextOffset } : response;
};

/** Drops trailing hits until the JSON reply fits `SEARCH_BUDGET_CHARS`; `total` and `symbol` are left untouched, and the last hit always survives. */
const withinBudget = (opts: {
  total: number;
  hits: IHit[];
  offset: number;
  symbol?: ISymbolBrief;
}): ISearchToolResponse => {
  const { total, offset, symbol } = opts;
  const hits = [...opts.hits];
  let response = responseOf({ total, hits, offset, symbol });

  while (hits.length > 1 && JSON.stringify(response).length > AtlasConstants.SEARCH_BUDGET_CHARS) {
    hits.pop();
    response = responseOf({ total, hits, offset, symbol });
  }

  return response;
};

export const buildSearchTool = (opts: {
  store: ChunkStore;
  symbols?: SymbolStore;
}): IToolHandler => ({
  definition: {
    name: 'search',
    description: DESCRIPTION,
    inputSchema: INPUT_JSON_SCHEMA,
  },
  call: async ({ args }) => {
    const input = parseInput({ schema: SearchInputSchema, args });
    const offset = input.offset ?? 0;
    const result = opts.store.search({
      query: input.query,
      corpus: corpusFilterOf({ corpus: input.corpus }),
      limit: input.limit ?? AtlasConstants.SEARCH_DEFAULT_LIMIT,
      offset,
    });

    return withinBudget({
      total: result.total,
      hits: result.hits,
      offset,
      symbol: symbolBriefOf({ symbols: opts.symbols, query: input.query }),
    });
  },
});
