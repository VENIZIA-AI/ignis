import { describe, test, expect } from 'bun:test';
import { makeHelper } from './fake-client';

describe('TypesenseConnector search', () => {
  test('search returns the raw engine result', async () => {
    const { helper, fake } = makeHelper({
      searchResult: { found: 2, hits: [{ document: { id: '1' } }, { document: { id: '2' } }] },
    });
    const result = await helper.search({
      collection: 'products',
      params: { q: 'shoe' },
    });
    expect(result.found).toBe(2);
    // One collection is still ONE call - it is simply the arity-1 case of the multi_search transport.
    const call = fake.calls.find((c) => c.op === 'multiSearch.perform');
    const [request] = (call?.args ?? []) as Array<{ searches: unknown[] }>;
    expect(request.searches).toEqual([{ q: 'shoe', collection: 'products' }]);
  });

  test('maps facet_counts/grouped_hits/text_match onto camelCase result fields', async () => {
    // Wire-shaped fixture assembled via bracket assignment, never a snake_case TS identifier - same convention as TypesenseSearchWindows.buildEmptySearchResponse().
    const facetCount: Record<string, unknown> = { counts: [{ value: 'nike', count: 1 }] };
    facetCount['field_name'] = 'brand';
    const groupedHit: Record<string, unknown> = { hits: [{ document: { id: '1' } }] };
    groupedHit['group_key'] = ['nike'];
    const hit: Record<string, unknown> = { document: { id: '1' }, highlight: { title: {} } };
    hit['text_match'] = 123456;
    const searchResult: Record<string, unknown> = { found: 1, hits: [hit] };
    searchResult['out_of'] = 10;
    searchResult['search_time_ms'] = 3;
    searchResult['facet_counts'] = [facetCount];
    searchResult['grouped_hits'] = [groupedHit];

    const { helper } = makeHelper({ searchResult });

    const result = await helper.search({
      collection: 'products',
      params: { q: 'shoe' },
    });

    expect(result.outOf).toBe(10);
    expect(result.searchTimeMs).toBe(3);
    expect(result.facetCounts).toEqual([
      { fieldName: 'brand', counts: [{ value: 'nike', count: 1 }] },
    ]);
    expect(result.groupedHits).toEqual([groupedHit]);
    expect(result.hits?.[0]?.document).toEqual({ id: '1' });
    expect(result.hits?.[0]?.highlight).toEqual({ title: {} });
    expect(result.hits?.[0]?.score).toBe(123456);
  });

  test('maps a facet with highlighted values, sampled and stats onto ISearchFacetCount', async () => {
    const facet: Record<string, unknown> = {
      counts: [
        { value: 'nike', count: 3, highlighted: '<mark>ni</mark>ke' },
        { value: 'adidas', count: 1 },
        'not-a-record',
        { count: 2 },
      ],
      sampled: true,
      stats: { avg: 10.5, max: 20, min: 1, sum: 105, ['total_values']: 10 },
    };
    facet['field_name'] = 'brand';
    const searchResult: Record<string, unknown> = { found: 4, hits: [] };
    searchResult['facet_counts'] = [facet, 'junk', { counts: [] }];

    const { helper } = makeHelper({ searchResult });
    const result = await helper.search({ collection: 'products', params: { q: '*' } });

    expect(result.facetCounts).toEqual([
      {
        fieldName: 'brand',
        counts: [
          { value: 'nike', count: 3, highlighted: '<mark>ni</mark>ke' },
          { value: 'adidas', count: 1 },
        ],
        sampled: true,
        stats: { avg: 10.5, max: 20, min: 1, sum: 105, totalValues: 10 },
      },
    ]);
  });

  test('a facet of numbers keeps the value as the string the engine sent', async () => {
    const facet: Record<string, unknown> = { counts: [{ value: '42', count: 5 }] };
    facet['field_name'] = 'price';
    const searchResult: Record<string, unknown> = { found: 5 };
    searchResult['facet_counts'] = [facet];

    const { helper } = makeHelper({ searchResult });
    const result = await helper.search({ collection: 'products', params: { q: '*' } });

    expect(result.facetCounts).toEqual([
      { fieldName: 'price', counts: [{ value: '42', count: 5 }] },
    ]);
  });

  test('a hybrid hit carries rankFusionScore and vectorDistance next to the text_match score', async () => {
    const hit: Record<string, unknown> = { document: { id: '1' } };
    hit['text_match'] = 77;
    hit['vector_distance'] = 0.12;
    hit['hybrid_search_info'] = { ['rank_fusion_score']: 0.83 };
    const keywordOnly: Record<string, unknown> = { document: { id: '2' } };
    keywordOnly['text_match'] = 5;
    const malformed: Record<string, unknown> = { document: { id: '3' } };
    malformed['vector_distance'] = 'far';
    malformed['hybrid_search_info'] = { ['rank_fusion_score']: 'high' };

    const { helper } = makeHelper({
      searchResult: { found: 3, hits: [hit, keywordOnly, malformed] },
    });
    const result = await helper.search({ collection: 'products', params: { q: '*' } });

    expect(result.hits?.[0]).toEqual({
      document: { id: '1' },
      score: 77,
      rankFusionScore: 0.83,
      vectorDistance: 0.12,
    });
    expect(result.hits?.[1]).toEqual({ document: { id: '2' }, score: 5 });
    expect(result.hits?.[2]).toEqual({ document: { id: '3' } });
  });

  test('search on a missing collection returns an empty result, not a 500', async () => {
    // The measured wire shape: /multi_search answers HTTP 200 and reports the missing collection as
    // a per-entry `{ code, error }`, so `multiSearch.perform` does NOT throw. Verified against 27.1
    // and 31.0.rc3 - only the wording differs ('Not found.' vs 'Collection not found'), and
    // classifyEntry keys on the 404 rather than the text.
    const { helper } = makeHelper({
      multiSearchResult: { results: [{ code: 404, error: 'Not found.' }] },
    });
    const result = await helper.search({
      collection: 'nope',
      params: { q: 'x' },
    });
    expect(result.found).toBe(0);
    expect(result.hits).toEqual([]);
    expect(typeof result.outOf).toBe('number');
    expect(typeof result.searchTimeMs).toBe('number');
  });

  test('search rethrows sanitized 503 on real failure', async () => {
    const { helper } = makeHelper({ throwOn: { 'multiSearch.perform': new Error('boom') } });
    let status = 0;

    try {
      await helper.search({
        collection: 'products',
        params: { q: 'x' },
      });
    } catch (e) {
      status = (e as { statusCode: number }).statusCode;
    }

    expect(status).toBe(503);
  });

  test('multiSearch forwards to multiSearch.perform', async () => {
    const { helper, fake } = makeHelper({ multiSearchResult: { results: [{ found: 1 }] } });
    await helper.multiSearch({
      searches: [{ collection: 'products', q: 'x' }],
      commonParams: { q: 'x' },
    });
    expect(fake.calls.some((c) => c.op === 'multiSearch.perform')).toBe(true);
    const ms = fake.calls.find((c) => c.op === 'multiSearch.perform');
    expect((ms!.args[0] as { searches: unknown[] }).searches.length).toBe(1);
  });

  test('multiSearch (federated, default) calls perform without a union flag and returns results[]', async () => {
    const { helper, fake } = makeHelper({
      multiSearchResult: { results: [{ found: 1 }, { found: 2 }] },
    });
    const result = await helper.multiSearch({
      searches: [
        { collection: 'products', q: 'x' },
        { collection: 'categories', q: 'x' },
      ],
    });
    const ms = fake.calls.find((c) => c.op === 'multiSearch.perform');
    expect(ms?.args[0]).toEqual({
      searches: [
        { collection: 'products', q: 'x' },
        { collection: 'categories', q: 'x' },
      ],
    });
    expect(result.results.length).toBe(2);
  });

  test('multiSearch (union: true) calls perform with the union flag and returns the merged result', async () => {
    const { helper, fake } = makeHelper({
      multiSearchResult: { found: 3, hits: [{ document: { id: '1' } }] },
    });
    const result = await helper.multiSearch({
      searches: [
        { collection: 'products', q: 'x' },
        { collection: 'categories', q: 'x' },
      ],
      union: true,
    });
    const ms = fake.calls.find((c) => c.op === 'multiSearch.perform');
    expect(ms?.args[0]).toEqual({
      union: true,
      searches: [
        { collection: 'products', q: 'x' },
        { collection: 'categories', q: 'x' },
      ],
    });
    expect(result.found).toBe(3);
    expect(result.hits?.length).toBe(1);
  });

  test('search forwards per-request SearchOptions (caching/abort) to the client', async () => {
    const { helper, fake } = makeHelper();
    await helper.search({
      collection: 'products',
      params: { q: 'x' },
      options: { cacheSearchResultsForSeconds: 60 },
    });
    const call = fake.calls.find((c) => c.op === 'multiSearch.perform');
    // record('multiSearch.perform', reqs, common, options) => args[2] is the options
    expect(call?.args[2]).toEqual({ cacheSearchResultsForSeconds: 60 });
  });

  test('multiSearch forwards per-request SearchOptions as the third argument', async () => {
    const { helper, fake } = makeHelper({ multiSearchResult: { results: [] } });
    const abortController = new AbortController();
    await helper.multiSearch({
      searches: [{ collection: 'products', q: 'x' }],
      options: { abortSignal: abortController.signal },
    });
    const ms = fake.calls.find((c) => c.op === 'multiSearch.perform');
    expect((ms!.args[2] as { abortSignal: AbortSignal }).abortSignal).toBe(abortController.signal);
  });

  test('use_cache and cache_ttl travel as multi-search common params, not in the per-search body', async () => {
    const { helper, fake } = makeHelper({ searchResult: { found: 0, hits: [] } });

    await helper.search({
      collection: 'products',
      params: { q: 'shoe', ['use_cache']: true, ['cache_ttl']: 30 } as never,
    });

    const call = fake.calls.find((c) => c.op === 'multiSearch.perform');
    const [request, common] = (call?.args ?? []) as [{ searches: unknown[] }, unknown];
    expect(request.searches).toEqual([{ q: 'shoe', collection: 'products' }]);
    expect(common).toEqual({ ['use_cache']: true, ['cache_ttl']: 30 });
  });

  test('a page split into windows keeps use_cache in the common params only', async () => {
    const { helper, fake } = makeHelper({ searchResult: { found: 0, hits: [] } });

    await helper.search({
      collection: 'products',
      params: { q: '*', ['per_page']: 500, ['use_cache']: true } as never,
    });

    const call = fake.calls.find((c) => c.op === 'multiSearch.perform');
    const [request, common] = (call?.args ?? []) as [
      { searches: Array<Record<string, unknown>> },
      unknown,
    ];
    expect(request.searches.length).toBeGreaterThan(1);

    for (const entry of request.searches) {
      expect(entry).not.toHaveProperty('use_cache');
    }

    expect(common).toEqual({ ['use_cache']: true });
  });
});
