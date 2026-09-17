import { expectRejection } from '../rejection.helper';
import { HttpDataSource } from '@/http/datasource';
import { afterEach, describe, expect, test } from 'bun:test';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Records every attempt so a test can assert on the SECOND one, which is where the retry path hides.
 *
 * Headers go through `new Headers()` rather than being copied as an object, because that is what
 * `fetch` does - and it is the step that turns an `undefined` value into the STRING "undefined".
 *
 * DO NOT simplify this back to a spread. Copying the object preserves `undefined`, so the provider
 * test below goes green while the bug ships - it was written that way first and the positive control
 * caught it. Same shape as a test that trusts a runtime for defining `localStorage` when production
 * does not: the environment being quietly kinder than the real thing.
 */
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
  /**
   * Written FIRST, before the repository, because a retry path is a SECOND place headers are built -
   * and a second place is where a guard gets forgotten. The assertion is on attempt two.
   */
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

  /** The bug the retry path hides: a token without a provider must not send the string "undefined". */
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

  /** Without the flag a 401 is the answer, not the start of a loop. */
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

  /** No token at all is a valid state - a public endpoint needs no header invented for it. */
  test('no token sends no authorization header', async () => {
    const attempts = stubFetch([{ status: 200, contentRange: 'items 0-0/1' }]);
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts[0].headers.authorization).toBeUndefined();
  });
});

describe('the recovery hook decides, not the transport', () => {
  /** Refreshing a token, logging out, or giving up is the HOST's policy. The transport only asks. */
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

  /** At most once. A hook that refreshes and still fails must not start a loop. */
  test('a second 401 is the answer, not a third attempt', async () => {
    const attempts = stubFetch([{ status: 401 }]);

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => true,
    });

    await expectRejection({ task: dataSource.read({ paths: ['tickets'] }), message: /401/ });

    expect(attempts).toHaveLength(2);
  });

  /** The hook runs BEFORE the retry, so whatever it refreshed is what the retry picks up. */
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

/**
 * Header names are case-insensitive on the wire. A plain-object merge keeps both spellings, and
 * `Headers` then APPENDS them into one comma-joined value - so a caller who meant to override a
 * default gets `"false, true"`, which parses as neither.
 */
describe('a caller header overrides a default, whatever its case', () => {
  test('the same name in a different case replaces, never appends', async () => {
    const attempts = stubFetch([{ status: 200, contentRange: 'items 0-0/1' }]);

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      headers: { 'X-Request-Count': 'true' },
    });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts[0].headers['x-request-count']).toBe('true');
  });

  test('untouched, the default stands', async () => {
    const attempts = stubFetch([{ status: 200, contentRange: 'items 0-0/1' }]);
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });

    await dataSource.read({ paths: ['tickets'] });

    expect(attempts[0].headers['x-request-count']).toBe('false');
  });

  /** A `Headers` instance is accepted as-is, which a `Record` type would have refused. */
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

/**
 * An export endpoint answers bytes, not rows. `read` cannot express that, and inventing a blob shape
 * on a repository whose contract is rows would be worse - so the transport stays reachable.
 */
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

  /** The same auth path, not a second one - that is the point of routing `read` through it. */
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

  /** Raw means raw: a failing status is the caller's to read, not an exception. */
  test('it does not throw on a non-2xx', async () => {
    stubFetch([{ status: 404 }]);
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });

    expect((await dataSource.request({ paths: ['nope'] })).status).toBe(404);
  });
});
