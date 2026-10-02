import { HttpDataSource } from '@/http/datasource';
import { HttpRepository } from '@/http/repository';
import { afterEach, describe, expect, test } from 'bun:test';

/**
 * A read sends its filter in the GET query string until the URL would be too long for a proxy, then
 * moves the filter into the body of `POST /<resource>/find`, which every generated IGNIS controller
 * answers with the same rows and the same Content-Range.
 */

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

type TAttempt = { url: string; method: string; body: RequestInit['body'] };

const stubFetch = (spec: { body: unknown; contentRange?: string }) => {
  const attempts: Array<TAttempt> = [];

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    attempts.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body });
    return new Response(JSON.stringify(spec.body), {
      status: 200,
      headers: spec.contentRange ? { 'content-range': spec.contentRange } : {},
    });
  }) as never;

  return attempts;
};

const BASE_URL = 'https://api.example.com';

const tickets = new HttpRepository<{ id: string }>({
  dataSource: new HttpDataSource({ baseUrl: BASE_URL }),
  resource: 'tickets',
});

const uuids = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );

describe('a short filter stays on GET', () => {
  test('find with a few ids is GET /tickets?filter=...', async () => {
    const attempts = stubFetch({ body: [], contentRange: 'records */0' });

    await tickets.find({ filter: { where: { id: { inq: uuids(10) } } } });

    expect(attempts[0].method).toBe('GET');
    expect(attempts[0].url.startsWith(`${BASE_URL}/tickets?filter=`)).toBe(true);
  });
});

describe('a filter that would overflow the URL moves into a POST body', () => {
  test('find with 1000 ids is POST /tickets/find with the filter in the body', async () => {
    const attempts = stubFetch({ body: [{ id: 'a' }], contentRange: 'records 0-0/1' });
    const filter = { where: { id: { inq: uuids(1000) } }, limit: 1000 };

    const rows = await tickets.find({ filter });

    expect(attempts[0]).toMatchObject({ url: `${BASE_URL}/tickets/find`, method: 'POST' });
    expect(JSON.parse(String(attempts[0].body))).toEqual({ filter });
    expect(rows).toEqual([{ id: 'a' }]);
  });

  test('a ranged find keeps reading the total from Content-Range', async () => {
    stubFetch({ body: [{ id: 'a' }], contentRange: 'records 0-0/1000' });

    const rs = await tickets.find({
      filter: { where: { id: { inq: uuids(1000) } }, limit: 1 },
      options: { shouldQueryRange: true },
    });

    expect(rs.range).toEqual({ start: 0, end: 0, total: 1000 });
  });

  test('count and existsWith move too', async () => {
    const attempts = stubFetch({ body: [{ id: 'a' }], contentRange: 'records 0-0/1000' });
    const where = { id: { inq: uuids(1000) } };

    expect(await tickets.count({ where })).toEqual({ count: 1000 });
    expect(await tickets.existsWith({ where })).toBe(true);

    expect(attempts.map(attempt => `${attempt.method} ${attempt.url}`)).toEqual([
      `POST ${BASE_URL}/tickets/find`,
      `POST ${BASE_URL}/tickets/find`,
    ]);
  });
});
