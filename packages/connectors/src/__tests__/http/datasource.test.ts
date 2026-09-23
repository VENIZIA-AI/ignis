import { expectRejection } from '../rejection.helper';
import type { THttpHeaders } from '@/http/common/types';
import { HttpDataSource } from '@/http/datasource';
import { afterEach, describe, expect, test } from 'bun:test';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Headers pass through `new Headers()` as fetch does - a spread would keep `undefined` and hide the bug.
const stubFetch = (responses: Array<{ status: number; body?: unknown; contentRange?: string }>) => {
  const attempts: Array<{ url: string; headers: Record<string, string> }> = [];
  let index = 0;

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    attempts.push({
      url: String(url),
      headers: Object.fromEntries(new Headers(init?.headers ?? {}).entries()),
    });

    const spec = responses[Math.min(index, responses.length - 1)];
    index += 1;

    return new Response(JSON.stringify(spec.body ?? []), {
      status: spec.status,
      headers: spec.contentRange ? { 'content-range': spec.contentRange } : {},
    });
  }) as never;

  return attempts;
};

describe('the 401 retry re-resolves the token and rebuilds every header', () => {
  test('the second attempt carries the newly resolved token', async () => {
    const attempts = stubFetch([{ status: 401 }, { status: 200, contentRange: 'items 0-0/1' }]);
    const tokens = ['stale', 'fresh'];

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => true,
      authTokenResolver: () => ({ value: tokens.shift() ?? 'exhausted' }),
    });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts).toHaveLength(2);
    expect(attempts[0].headers.authorization).toBe('Bearer stale');
    expect(attempts[1].headers.authorization).toBe('Bearer fresh');
  });

  test('a token with no provider sends no provider header, on BOTH attempts', async () => {
    const attempts = stubFetch([{ status: 401 }, { status: 200, contentRange: 'items 0-0/1' }]);

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => true,
      authTokenResolver: () => ({ value: 'token-without-provider' }),
    });

    await dataSource.read({ paths: ['tickets'] });

    for (const attempt of attempts) {
      expect(attempt.headers['x-auth-provider']).toBeUndefined();
    }
  });

  test('a provider that IS there is sent, on both attempts', async () => {
    const attempts = stubFetch([{ status: 401 }, { status: 200, contentRange: 'items 0-0/1' }]);

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => true,
      authTokenResolver: () => ({ value: 'v', provider: 'keycloak' }),
    });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts.map(attempt => attempt.headers['x-auth-provider'])).toEqual([
      'keycloak',
      'keycloak',
    ]);
  });

  test('no retry without the hook - one attempt, and it throws', async () => {
    const attempts = stubFetch([{ status: 401 }]);
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });

    await expectRejection({ task: dataSource.read({ paths: ['tickets'] }), message: /401/ });
    expect(attempts).toHaveLength(1);
  });
});

describe('an explicit token is never overridden by a lookup', () => {
  test('the resolver is not consulted when authToken is given', async () => {
    const attempts = stubFetch([{ status: 200, contentRange: 'items 0-0/1' }]);
    let resolverCalls = 0;

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      authToken: { value: 'explicit' },
      authTokenResolver: () => {
        resolverCalls += 1;
        return { value: 'from-resolver' };
      },
    });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts[0].headers.authorization).toBe('Bearer explicit');
    expect(resolverCalls).toBe(0);
  });

  test('no token sends no authorization header', async () => {
    const attempts = stubFetch([{ status: 200, contentRange: 'items 0-0/1' }]);
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts[0].headers.authorization).toBeUndefined();
  });
});

describe('the recovery hook decides, not the transport', () => {
  test('a hook answering false leaves the 401 standing, with one attempt', async () => {
    const attempts = stubFetch([{ status: 401 }]);
    let asked = 0;

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => {
        asked += 1;
        return false;
      },
    });

    await expectRejection({ task: dataSource.read({ paths: ['tickets'] }), message: /401/ });

    expect(asked).toBe(1);
    expect(attempts).toHaveLength(1);
  });

  test('a second 401 is the answer, not a third attempt', async () => {
    const attempts = stubFetch([{ status: 401 }]);

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => true,
    });

    await expectRejection({ task: dataSource.read({ paths: ['tickets'] }), message: /401/ });

    expect(attempts).toHaveLength(2);
  });

  test('the hook runs before the retry re-resolves the token', async () => {
    const attempts = stubFetch([{ status: 401 }, { status: 200, contentRange: 'items 0-0/1' }]);
    let stored = 'stale';

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      authTokenResolver: () => ({ value: stored }),
      onUnauthorized: () => {
        stored = 'refreshed';
        return true;
      },
    });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts.map(attempt => attempt.headers.authorization)).toEqual([
      'Bearer stale',
      'Bearer refreshed',
    ]);
  });
});

describe('x-request-count belongs to the connector', () => {
  const refusedHeaders: Array<THttpHeaders> = [
    { 'X-Request-Count': 'true' },
    [['x-request-count', 'false']],
    new Headers({ 'x-REQUEST-count': '1' }),
  ];

  for (const headers of refusedHeaders) {
    const entries = [...new Headers(headers).entries()];

    test(`a caller value is refused: ${JSON.stringify(entries)}`, () => {
      expect(() => new HttpDataSource({ baseUrl: 'https://api.example.com', headers })).toThrow(
        /x-request-count is owned by HttpDataSource/,
      );
    });
  }

  test('untouched, the default stands', async () => {
    const attempts = stubFetch([{ status: 200, contentRange: 'items 0-0/1' }]);
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts[0].headers['x-request-count']).toBe('false');
  });

  test('a Headers instance is accepted', async () => {
    const attempts = stubFetch([{ status: 200, contentRange: 'items 0-0/1' }]);

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      headers: new Headers({ 'x-tenant': 'acme' }),
    });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts[0].headers['x-tenant']).toBe('acme');
  });
});

describe('request() answers raw, with auth and retry intact', () => {
  test('a non-JSON response comes back whole', async () => {
    globalThis.fetch = (async () =>
      new Response('col-a,col-b\n1,2', {
        status: 200,
        headers: {
          'content-type': 'text/csv',
          'content-disposition': 'attachment; filename="export.csv"',
        },
      })) as never;

    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });
    const response = await dataSource.request({ paths: ['reports', 'export'] });

    expect(response.headers.get('content-disposition')).toContain('export.csv');
    expect(await response.text()).toContain('col-a');
  });

  test('it carries the token, and retries once on 401', async () => {
    const attempts = stubFetch([{ status: 401 }, { status: 200 }]);

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      authToken: { value: 'export-token' },
      onUnauthorized: () => true,
    });

    await dataSource.request({ paths: ['reports', 'export'] });

    expect(attempts).toHaveLength(2);
    expect(attempts[1].headers.authorization).toBe('Bearer export-token');
  });

  test('it does not throw on a non-2xx', async () => {
    stubFetch([{ status: 404 }]);
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });

    expect((await dataSource.request({ paths: ['nope'] })).status).toBe(404);
  });
});

describe('Content-Range is read in every shape a server sends', () => {
  const cases: Array<{
    header: string;
    expected: { hasRange: boolean; skip?: number; total?: number };
  }> = [
    { header: 'records 0-24/137', expected: { hasRange: true, skip: 0, total: 137 } },
    { header: 'items 10-11/137', expected: { hasRange: true, skip: 10, total: 137 } },
    { header: 'bytes 0-99/1000', expected: { hasRange: true, skip: 0, total: 1000 } },
    { header: 'records 0 - 24 / 137', expected: { hasRange: true, skip: 0, total: 137 } },
    { header: 'records */0', expected: { hasRange: true, skip: undefined, total: 0 } },
    { header: 'records */137', expected: { hasRange: true, skip: undefined, total: 137 } },
    { header: 'records * / 5', expected: { hasRange: true, skip: undefined, total: 5 } },
    { header: 'records 0-24/*', expected: { hasRange: false } },
    { header: 'records */abc', expected: { hasRange: false } },
    { header: 'records', expected: { hasRange: false } },
    { header: 'garbage', expected: { hasRange: false } },
  ];

  for (const { header, expected } of cases) {
    test(`"${header}"`, async () => {
      stubFetch([{ status: 200, contentRange: header }]);
      const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });

      const rs = await dataSource.read({ paths: ['tickets'] });

      expect({ hasRange: rs.hasRange, skip: rs.skip, total: rs.total }).toEqual({
        hasRange: expected.hasRange,
        skip: expected.skip,
        total: expected.total,
      });
    });
  }
});

describe('a failed read names the URL without carrying all of it', () => {
  test('431 says the URL is too long, and the message stays short', async () => {
    stubFetch([{ status: 431 }]);
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });
    const ids = Array.from(
      { length: 500 },
      (_, index) => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
    );

    const task = dataSource.read({
      paths: ['tickets'],
      query: { filter: { where: { id: { inq: ids } } } },
    });

    await expectRejection({
      task,
      message: /431 .*\.\.\. \(\d+ chars\) \| The URL is too long for a GET/,
    });
    const error = await task.catch((rejected: Error) => rejected);
    expect((error as Error).message.length).toBeLessThan(500);
  });

  test('any other failure keeps the short URL whole', async () => {
    stubFetch([{ status: 500 }]);
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });

    await expectRejection({
      task: dataSource.read({ paths: ['tickets'] }),
      message: /^\[http\]\[read\] 500 \| https:\/\/api\.example\.com\/tickets$/,
    });
  });
});

// Two spellings of one name inside the CALLER's own headers: `new Headers(input)` appends them into
// a value neither spelling wrote. Reported by ARDOR, measured against the published build.
describe('a caller that names one header twice gets the last value, not a joined one', () => {
  const twice: Array<[string, THttpHeaders]> = [
    [
      'an array of pairs',
      [
        ['X-Tenant', 'north'],
        ['x-tenant', 'south'],
      ],
    ],
    ['a record with two spellings', { 'X-Tenant': 'north', 'x-tenant': 'south' }],
  ];

  for (const [label, headers] of twice) {
    test(`${label} sends the last one`, async () => {
      const attempts = stubFetch([{ status: 200, contentRange: 'items 0-0/1' }]);
      const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com', headers });

      await dataSource.read({ paths: ['tickets'] });

      expect(attempts[0].headers['x-tenant']).toBe('south');
    });
  }

  // A `Headers` instance joined them before this package saw it - there is nothing left to undo.
  test('a Headers instance arrives already joined, and is passed through', async () => {
    const attempts = stubFetch([{ status: 200, contentRange: 'items 0-0/1' }]);
    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      headers: new Headers([
        ['X-Tenant', 'north'],
        ['x-tenant', 'south'],
      ]),
    });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts[0].headers['x-tenant']).toBe('north, south');
  });
});

describe('a relative baseUrl resolves against the page or worker that runs it', () => {
  // Bun has no `location`; the stub stands in for a page, and the descriptor goes back after each test.
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');

  const stubLocation = (opts: { href: string }) => {
    Object.defineProperty(globalThis, 'location', {
      value: { href: opts.href },
      configurable: true,
      writable: true,
    });
  };

  afterEach(() => {
    if (originalLocation) {
      Object.defineProperty(globalThis, 'location', originalLocation);
      return;
    }

    Reflect.deleteProperty(globalThis, 'location');
  });

  test('an absolute baseUrl is unchanged, with or without a location', () => {
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com/v1' });
    expect(dataSource.buildUrl({ paths: ['products'], query: { limit: 5 } })).toBe(
      'https://api.example.com/v1/products?limit=5',
    );

    stubLocation({ href: 'http://localhost:5173/app/' });
    expect(dataSource.buildUrl({ paths: ['products'] })).toBe(
      'https://api.example.com/v1/products',
    );
  });

  test('telling absolute from relative needs no URL.canParse, which Safari before 17 lacks', () => {
    const canParse = Object.getOwnPropertyDescriptor(URL, 'canParse');
    Reflect.deleteProperty(URL, 'canParse');

    try {
      expect('canParse' in URL).toBe(false);

      const absolute = new HttpDataSource({ baseUrl: 'https://api.example.com/v1' });
      expect(absolute.buildUrl({ paths: ['products'] })).toBe(
        'https://api.example.com/v1/products',
      );

      stubLocation({ href: 'http://localhost:5173/app/' });
      const relative = new HttpDataSource({ baseUrl: '/api' });
      expect(relative.buildUrl({ paths: ['products'] })).toBe('http://localhost:5173/api/products');
    } finally {
      if (canParse) {
        Object.defineProperty(URL, 'canParse', canParse);
      }
    }
  });

  test("a scheme-less '//host' baseUrl takes the page's scheme", () => {
    stubLocation({ href: 'https://shop.example.com/app/' });
    const dataSource = new HttpDataSource({ baseUrl: '//api.example.com/v1' });

    expect(dataSource.buildUrl({ paths: ['products'] })).toBe(
      'https://api.example.com/v1/products',
    );
  });

  test("'/api' resolves against the page's origin", () => {
    stubLocation({ href: 'http://localhost:5173/app/notes?tab=1' });
    const dataSource = new HttpDataSource({ baseUrl: '/api' });

    expect(dataSource.buildUrl({ paths: ['products'], query: { limit: 5 } })).toBe(
      'http://localhost:5173/api/products?limit=5',
    );
  });

  test('with no location (a server), a relative baseUrl fails naming the baseUrl and the fix', () => {
    // A server has no location; remove any the runtime defines so the case does not depend on it.
    Reflect.deleteProperty(globalThis, 'location');
    const dataSource = new HttpDataSource({ baseUrl: '/api' });

    expect(() => dataSource.buildUrl({ paths: ['products'] })).toThrow(
      "[http] Relative baseUrl '/api' needs a page or worker location to resolve against, and there is none here | Pass an absolute baseUrl such as 'https://api.example.com'",
    );
  });
});
