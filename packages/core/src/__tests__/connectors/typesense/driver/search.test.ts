import { describe, test, expect } from 'bun:test';
import { makeHelper } from './fake-client';

describe('TypesenseDriver search', () => {
  test('search returns the raw engine result', async () => {
    const { helper, fake } = makeHelper({
      searchResult: { found: 2, hits: [{ document: { id: '1' } }, { document: { id: '2' } }] },
    });
    const result = await helper.search({
      collection: 'products',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      params: { q: 'shoe', query_by: 'title' },
    });
    expect(result.found).toBe(2);
    const call = fake.calls.find(c => c.op === 'documents.search');
    // eslint-disable-next-line @typescript-eslint/naming-convention
    expect(call?.args[1]).toEqual({ q: 'shoe', query_by: 'title' });
  });

  test('search on a missing collection returns an empty result, not a 500', async () => {
    const { helper } = makeHelper({ throwOn: { 'documents.search': { httpStatus: 404 } } });
    const result = await helper.search({
      collection: 'nope',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      params: { q: 'x', query_by: 'title' },
    });
    expect(result.found).toBe(0);
    expect(result.hits).toEqual([]);
    expect(typeof result.out_of).toBe('number');
    expect(typeof result.page).toBe('number');
    expect(typeof result.search_time_ms).toBe('number');
  });

  test('search rethrows sanitized 503 on real failure', async () => {
    const { helper } = makeHelper({ throwOn: { 'documents.search': new Error('boom') } });
    let status = 0;
    try {
      await helper.search({
        collection: 'products',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        params: { q: 'x', query_by: 'title' },
      });
    } catch (e) {
      status = (e as { statusCode: number }).statusCode;
    }
    expect(status).toBe(503);
  });

  test('multiSearch forwards to multiSearch.perform', async () => {
    const { helper, fake } = makeHelper({ multiSearchResult: { results: [{ found: 1 }] } });
    await helper.multiSearch({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      searches: [{ collection: 'products', q: 'x', query_by: 'title' }],
      // eslint-disable-next-line @typescript-eslint/naming-convention
      commonParams: { query_by: 'title' },
    });
    expect(fake.calls.some(c => c.op === 'multiSearch.perform')).toBe(true);
    const ms = fake.calls.find(c => c.op === 'multiSearch.perform');
    expect((ms?.args[0] as { searches: unknown[] }).searches.length).toBe(1);
  });

  test('search forwards per-request SearchOptions (caching/abort) to the client', async () => {
    const { helper, fake } = makeHelper();
    await helper.search({
      collection: 'products',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      params: { q: 'x', query_by: 'title' },
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
      // eslint-disable-next-line @typescript-eslint/naming-convention
      searches: [{ collection: 'products', q: 'x', query_by: 'title' }],
      options: { abortSignal: abortController.signal },
    });
    const ms = fake.calls.find(c => c.op === 'multiSearch.perform');
    expect((ms?.args[2] as { abortSignal: AbortSignal }).abortSignal).toBe(abortController.signal);
  });
});
