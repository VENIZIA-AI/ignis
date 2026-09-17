import { expectRejection } from '../rejection.helper';
import { HttpDataSource } from '@/http/datasource';
import { HttpRepository } from '@/http/repository';
import { afterEach, describe, expect, test } from 'bun:test';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const stubFetch = (spec: { body?: unknown; contentRange?: string; status?: number }) => {
  const urls: string[] = [];

  globalThis.fetch = (async (url: string | URL) => {
    urls.push(String(url));
    return new Response(JSON.stringify(spec.body ?? []), {
      status: spec.status ?? 200,
      headers: spec.contentRange ? { 'content-range': spec.contentRange } : {},
    });
  }) as never;

  return urls;
};

const build = (opts?: { countPath?: string }) =>
  new HttpRepository<{ id: string }>({
    dataSource: new HttpDataSource({ baseUrl: 'https://api.example.com' }),
    resource: 'tickets',
    countPath: opts?.countPath,
  });

describe('the total comes from the header, not from the page', () => {
  /**
   * The assertion that cannot pass by accident: ONE row comes back, and the answer is seven. A
   * count that fell through to `data.length` would read 1.
   */
  test('count reads Content-Range while the payload holds one row', async () => {
    stubFetch({ body: [{ id: 'a' }], contentRange: 'items 0-0/7' });

    expect(await build().count({ where: {} })).toEqual({ count: 7 });
  });

  test('find with a range fills the envelope from the header', async () => {
    stubFetch({ body: [{ id: 'a' }, { id: 'b' }], contentRange: 'items 10-11/137' });

    const rs = await build().find({ filter: {}, options: { shouldQueryRange: true } });

    expect(rs.range).toEqual({ start: 10, end: 11, total: 137 });
    expect(rs.data).toHaveLength(2);
  });
});

// An empty page on an IGNIS server is `records */N`: the total is there, only the range is not.
describe('an empty page still carries its total', () => {
  test('count answers 0 when nothing matches', async () => {
    stubFetch({ body: [], contentRange: 'records */0' });

    expect(await build().count({ where: {} })).toEqual({ count: 0 });
  });

  /** A page past the end must keep the 137, and the start comes from the filter, as the server derives it. */
  test('find past the end keeps the total and the requested start', async () => {
    stubFetch({ body: [], contentRange: 'records */137' });

    const rs = await build().find({ filter: { skip: 137 }, options: { shouldQueryRange: true } });

    expect(rs.range).toEqual({ start: 137, end: 137, total: 137 });
    expect(rs.data).toEqual([]);
  });
});

// A header that IS there but names no total sends a developer to the server's count, not to a missing header.
describe('an unknown total is not a total, and the message says which', () => {
  const UNKNOWN = 'records 0-24/*';

  test('count refuses, naming the header it got', async () => {
    stubFetch({ body: [{ id: 'a' }], contentRange: UNKNOWN });

    await expectRejection({
      task: build().count({ where: {} }),
      message: /Content-Range "records 0-24\/\*" carries no readable total/,
    });
  });

  test('find with a range refuses the same way', async () => {
    stubFetch({ body: [{ id: 'a' }], contentRange: UNKNOWN });

    await expectRejection({
      task: build().find({ filter: {}, options: { shouldQueryRange: true } }),
      message: /carries no readable total/,
    });
  });

  test('plain find and existsWith need no total', async () => {
    stubFetch({ body: [{ id: 'a' }], contentRange: UNKNOWN });

    expect(await build().find({})).toHaveLength(1);
    expect(await build().existsWith({ where: {} })).toBe(true);
  });
});

describe('no header means no total, and it says so', () => {
  /** Answering with the page size is the silent-wrong class: 1 for a table of 7000, healthy-looking in every screen. */
  test('count refuses rather than reporting the page size', async () => {
    stubFetch({ body: [{ id: 'a' }] });

    await expectRejection({ task: build().count({ where: {} }), message: /no Content-Range/ });
  });

  test('a range that was asked for and not answered refuses too', async () => {
    stubFetch({ body: [{ id: 'a' }] });

    await expectRejection({
      task: build().find({ filter: {}, options: { shouldQueryRange: true } }),
      message: /no Content-Range/,
    });
  });

  /** A plain list never needed the header, so it keeps working. */
  test('find without a range is unaffected', async () => {
    stubFetch({ body: [{ id: 'a' }, { id: 'b' }] });

    expect(await build().find({})).toHaveLength(2);
  });

  /** Existence is a question about rows, not about totals. */
  test('existsWith answers from the rows, with no header', async () => {
    stubFetch({ body: [{ id: 'a' }] });

    expect(await build().existsWith({ where: {} })).toBe(true);
  });
});

describe('countPath is opt-in convention', () => {
  test('when named, the count route is asked instead', async () => {
    const urls = stubFetch({ body: { count: 42 } });

    expect(await build({ countPath: 'count' }).count({ where: {} })).toEqual({ count: 42 });
    expect(urls[0]).toContain('/tickets/count');
  });

  /** Absent, nothing about a count route is assumed - the list route answers. */
  test('when absent, the list route answers', async () => {
    const urls = stubFetch({ body: [], contentRange: 'items 0-0/3' });

    await build().count({ where: {} });

    expect(urls[0]).not.toContain('/count');
  });
});

describe('both IGNIS list shapes are read, not one assumed', () => {
  /**
   * IGNIS answers `{ count, data }` by DEFAULT - `x-request-count` defaults to on. A transport that
   * assumed a bare array would hand the whole envelope back as one row: fifty records reported as
   * one, with no error anywhere.
   */
  test('a count envelope yields its rows, not itself as one row', async () => {
    stubFetch({
      body: { count: 2, data: [{ id: 'a' }, { id: 'b' }] },
      contentRange: 'items 0-1/50',
    });

    expect(await build().find({})).toHaveLength(2);
  });

  test('a bare array is read as it always was', async () => {
    stubFetch({ body: [{ id: 'a' }, { id: 'b' }] });

    expect(await build().find({})).toHaveLength(2);
  });

  /** The envelope `count` is the rows of THAT response. The total is only ever in Content-Range. */
  test('the total comes from the header even when an envelope carries a count', async () => {
    stubFetch({
      body: { count: 2, data: [{ id: 'a' }, { id: 'b' }] },
      contentRange: 'items 0-1/50',
    });

    expect(await build().count({ where: {} })).toEqual({ count: 50 });
  });

  /** An object that is not an envelope stays whole - `findById` answers one record. */
  test('a plain object is not mistaken for an envelope', async () => {
    stubFetch({ body: { id: 'a', count: 3 } });

    expect(await build().findById({ id: 'a' })).toEqual({ id: 'a', count: 3 } as never);
  });
});

/** Structure alone cannot tell an envelope from a row with a `data` column and a `count` column. */
describe('a record is never unwrapped, whatever fields it carries', () => {
  test('findById returns a row that happens to carry data and count', async () => {
    stubFetch({ body: { id: 'a', data: { nested: true }, count: 3 } });

    expect(await build().findById({ id: 'a' })).toEqual({
      id: 'a',
      data: { nested: true },
      count: 3,
    } as never);
  });
});
