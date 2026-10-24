import { HttpDataSource } from '@/http/datasource';
import { HttpRepository } from '@/http/repository';
import { afterEach, describe, expect, test } from 'bun:test';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const stubFetch = (spec: { body?: unknown; contentRange?: string }) => {
  const calls: Array<{ url: URL; method: string; body?: unknown }> = [];

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(url)),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });

    return new Response(JSON.stringify(spec.body ?? []), {
      status: 200,
      headers: spec.contentRange ? { 'content-range': spec.contentRange } : {},
    });
  }) as never;

  return calls;
};

type TRow = { id: string };

const build = (opts?: { defaultLimit?: number; countPath?: string }) =>
  new HttpRepository<TRow>({
    dataSource: new HttpDataSource({ baseUrl: 'https://api.example.com' }),
    resource: 'tickets',
    ...opts,
  });

describe('an extra query rides beside the filter', () => {
  test('find sends query params next to filter', async () => {
    const calls = stubFetch({});

    await build().find({ filter: { where: { id: 'a' } }, query: { merchantId: 'm1', q: 'abc' } });

    const { searchParams } = calls[0].url;
    expect(searchParams.get('merchantId')).toBe('m1');
    expect(searchParams.get('q')).toBe('abc');
    expect(JSON.parse(searchParams.get('filter') ?? '')).toEqual({ where: { id: 'a' } });
  });

  test('the filter wins over a query key of the same name', async () => {
    const calls = stubFetch({});

    await build().find({ filter: { limit: 3 }, query: { filter: 'ignored' } });

    expect(JSON.parse(calls[0].url.searchParams.get('filter') ?? '')).toEqual({ limit: 3 });
  });

  test('findOne, findById, count and existsWith take it too', async () => {
    const calls = stubFetch({ body: [{ id: 'a' }], contentRange: 'items 0-0/1' });
    const repository = build();

    await repository.findOne({ filter: {}, query: { scope: 's' } });
    await repository.findById({ id: 'a', query: { scope: 's' } });
    await repository.count({ where: { id: 'a' }, query: { scope: 's' } });
    await repository.existsWith({ where: { id: 'a' }, query: { scope: 's' } });

    expect(calls.map((call) => call.url.searchParams.get('scope'))).toEqual(['s', 's', 's', 's']);
  });

  test('count on a countPath carries it beside where', async () => {
    const calls = stubFetch({ body: { count: 2 } });

    await build({ countPath: 'count' }).count({ where: { id: 'a' }, query: { scope: 's' } });

    expect(calls[0].url.pathname).toBe('/tickets/count');
    expect(calls[0].url.searchParams.get('scope')).toBe('s');
    expect(JSON.parse(calls[0].url.searchParams.get('where') ?? '')).toEqual({ id: 'a' });
  });

  test('a subclass reshapes it in buildQuery', async () => {
    class KeywordRepository extends HttpRepository<TRow> {
      protected override buildQuery(opts: {
        method: string;
        query?: Record<string, unknown>;
        params: Record<string, unknown>;
      }) {
        const { q, ...rest } = opts.query ?? {};
        return { ...rest, ...opts.params, search: { keyword: q, method: opts.method } };
      }
    }

    const calls = stubFetch({});
    const repository = new KeywordRepository({
      dataSource: new HttpDataSource({ baseUrl: 'https://api.example.com' }),
      resource: 'tickets',
    });

    await repository.find({ query: { q: 'abc' } });

    expect(JSON.parse(calls[0].url.searchParams.get('search') ?? '')).toEqual({
      keyword: 'abc',
      method: 'find',
    });
    expect(calls[0].url.searchParams.has('q')).toBe(false);
  });
});

describe('a default limit is data on the repository', () => {
  test('find adds it when the filter names no limit', async () => {
    const calls = stubFetch({});

    await build({ defaultLimit: 50 }).find({ filter: { where: { id: 'a' } } });

    expect(JSON.parse(calls[0].url.searchParams.get('filter') ?? '')).toEqual({
      where: { id: 'a' },
      limit: 50,
    });
  });

  test('find with no filter at all is bounded too', async () => {
    const calls = stubFetch({});

    await build({ defaultLimit: 50 }).find({});

    expect(JSON.parse(calls[0].url.searchParams.get('filter') ?? '')).toEqual({ limit: 50 });
  });

  test('the filter limit wins', async () => {
    const calls = stubFetch({});

    await build({ defaultLimit: 50 }).find({ filter: { limit: 5 } });

    expect(JSON.parse(calls[0].url.searchParams.get('filter') ?? '')).toEqual({ limit: 5 });
  });

  test('without it a find stays as it was', async () => {
    const calls = stubFetch({});

    await build().find({ filter: {} });

    expect(JSON.parse(calls[0].url.searchParams.get('filter') ?? '')).toEqual({});
  });

  test('the ranged find reads the same bounded page', async () => {
    const calls = stubFetch({ body: [{ id: 'a' }], contentRange: 'items 0-0/9' });

    const rs = await build({ defaultLimit: 50 }).find({
      filter: {},
      options: { shouldQueryRange: true },
    });

    expect(rs.range.total).toBe(9);
    expect(JSON.parse(calls[0].url.searchParams.get('filter') ?? '')).toEqual({ limit: 50 });
  });

  test('findOne, count and existsWith keep their own limit of 1', async () => {
    const calls = stubFetch({ body: [{ id: 'a' }], contentRange: 'items 0-0/1' });
    const repository = build({ defaultLimit: 50 });

    await repository.findOne({});
    await repository.count({ where: {} });
    await repository.existsWith({ where: {} });

    for (const call of calls) {
      expect(JSON.parse(call.url.searchParams.get('filter') ?? '')).toMatchObject({ limit: 1 });
    }
  });

  test('a limit that is not a positive integer is refused at construction', () => {
    expect(() => build({ defaultLimit: 0 })).toThrow(/defaultLimit/);
    expect(() => build({ defaultLimit: 1.5 })).toThrow(/defaultLimit/);
  });
});
