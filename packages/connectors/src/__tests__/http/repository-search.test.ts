import { expectRejection } from '@venizia/dev-configs/testing';
import { HttpDataSource } from '@/http/datasource';
import { HttpRepository } from '@/http/repository';
import { afterEach, describe, expect, test } from 'bun:test';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const stubFetch = (spec: { body?: unknown; status?: number }) => {
  const calls: Array<{ url: URL; method: string; body?: unknown }> = [];

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(url)),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });

    return new Response(JSON.stringify(spec.body), { status: spec.status ?? 200 });
  }) as never;

  return calls;
};

type TRow = { id: string; name: string };

const build = (opts?: { searchPath?: string }) =>
  new HttpRepository<TRow>({
    dataSource: new HttpDataSource({ baseUrl: 'https://api.example.com' }),
    resource: 'tickets',
    ...opts,
  });

const ANSWER = {
  found: 7,
  isFoundExact: true,
  hits: [{ document: { id: 'a', name: 'alpha' } }],
};

describe('search maps onto the IGNIS search route', () => {
  test('it POSTs the input to <resource>/search and returns the envelope', async () => {
    const calls = stubFetch({ body: ANSWER });

    const rs = await build().search({
      input: { mode: 'keyword', query: 'alp', queryBy: ['name'], filter: { limit: 10 } },
    });

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url.pathname).toBe('/tickets/search');
    expect(calls[0].body).toEqual({
      mode: 'keyword',
      query: 'alp',
      queryBy: ['name'],
      filter: { limit: 10 },
    });
    expect(rs).toEqual(ANSWER);
    expect(rs.hits[0].document.name).toBe('alpha');
  });

  test('found is the total, and isFoundExact says when it is an estimate', async () => {
    stubFetch({ body: { ...ANSWER, isFoundExact: false } });

    const rs = await build().search({ input: { mode: 'keyword', query: 'a' } });

    expect(rs.found).toBe(7);
    expect(rs.isFoundExact).toBe(false);
  });

  test('an extra query rides on the URL', async () => {
    const calls = stubFetch({ body: ANSWER });

    await build().search({ input: { mode: 'keyword', query: 'a' }, query: { merchantId: 'm1' } });

    expect(calls[0].url.searchParams.get('merchantId')).toBe('m1');
  });

  test('searchPath renames the segment', async () => {
    const calls = stubFetch({ body: ANSWER });

    await build({ searchPath: 'find-text' }).search({ input: { mode: 'keyword', query: 'a' } });

    expect(calls[0].url.pathname).toBe('/tickets/find-text');
  });

  test('a subclass moves the route in getSearchPaths', async () => {
    class ScopedRepository extends HttpRepository<TRow> {
      protected override getSearchPaths(): Array<string> {
        return ['search', this.resource];
      }
    }

    const calls = stubFetch({ body: ANSWER });
    await new ScopedRepository({
      dataSource: new HttpDataSource({ baseUrl: 'https://api.example.com' }),
      resource: 'tickets',
    }).search({ input: { mode: 'keyword', query: 'a' } });

    expect(calls[0].url.pathname).toBe('/search/tickets');
  });

  test('a body that is not the search envelope throws, never an empty page', async () => {
    stubFetch({ body: [] });

    await expectRejection({
      task: build().search({ input: { mode: 'keyword', query: 'a' } }),
      message: /no \{ found, hits \} envelope/,
    });
  });

  test('a server error is the error it threw', async () => {
    stubFetch({ status: 422, body: { message: 'bad input' } });

    await expectRejection({
      task: build().search({ input: { mode: 'keyword', query: 'a' } }),
      message: /bad input/,
    });
  });
});
