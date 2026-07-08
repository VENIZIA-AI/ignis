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
    const call = fake.calls.find(c => c.op === 'documents.search');
    expect(call?.args[1]).toEqual({ q: 'shoe' });
  });

  test('maps facet_counts/grouped_hits/text_match onto camelCase result fields', async () => {
    // Wire-shaped fixture assembled via bracket assignment (never a snake_case TS identifier),
    // same convention as connector.ts's buildEmptySearchResponse().
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
    expect(result.facetCounts).toEqual([facetCount]);
    expect(result.groupedHits).toEqual([groupedHit]);
    expect(result.hits?.[0]?.document).toEqual({ id: '1' });
    expect(result.hits?.[0]?.highlight).toEqual({ title: {} });
    expect(result.hits?.[0]?.textMatch).toBe(123456);
  });

  test('search on a missing collection returns an empty result, not a 500', async () => {
    const { helper } = makeHelper({ throwOn: { 'documents.search': { httpStatus: 404 } } });
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
    const { helper } = makeHelper({ throwOn: { 'documents.search': new Error('boom') } });
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
    expect(fake.calls.some(c => c.op === 'multiSearch.perform')).toBe(true);
    const ms = fake.calls.find(c => c.op === 'multiSearch.perform');
    expect((ms?.args[0] as { searches: unknown[] }).searches.length).toBe(1);
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
    const ms = fake.calls.find(c => c.op === 'multiSearch.perform');
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
    const ms = fake.calls.find(c => c.op === 'multiSearch.perform');
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
    const call = fake.calls.find(c => c.op === 'documents.search');
    // record('documents.search', name, params, options) => args[2] is the options
    expect(call?.args[2]).toEqual({ cacheSearchResultsForSeconds: 60 });
  });

  test('multiSearch forwards per-request SearchOptions as the third argument', async () => {
    const { helper, fake } = makeHelper({ multiSearchResult: { results: [] } });
    const abortController = new AbortController();
    await helper.multiSearch({
      searches: [{ collection: 'products', q: 'x' }],
      options: { abortSignal: abortController.signal },
    });
    const ms = fake.calls.find(c => c.op === 'multiSearch.perform');
    expect((ms?.args[2] as { abortSignal: AbortSignal }).abortSignal).toBe(abortController.signal);
  });
});
