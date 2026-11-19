/**
 * What a review of the fetcher pipeline asked to pin: the options that would route around the guard, the Retry-After
 * ceiling, the default cap of a guarded call, a hook that fails, replay of a JSON body and the axios size error.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { z } from 'zod';
import { AxiosFetcher } from '@/modules/network/http-request/fetcher/axios-fetcher';
import { NativeFetcher } from '@/modules/network/http-request/fetcher/native-fetcher';
import { FetchRetry } from '@/modules/network/http-request/fetcher/common/utilities';
import type { IFetchGuard } from '@/modules/network/http-request/fetcher/common/guard';
import { UrlFetchError } from '@/modules/network/utilities/url-safety/common/errors';
import { UrlPolicy } from '@/modules/network/utilities/url-safety/policy';

const FAST = { initialDelayMs: 1, maxDelayMs: 2 };
const hits: Array<{ path: string; method: string; body: string }> = [];
let limitCalls = 0;

const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: async (request) => {
    const { pathname } = new URL(request.url);

    const result = await request.text();
    hits.push({ path: pathname, method: request.method, body: result });

    switch (pathname) {
      case '/long-wait': {
        return new Response('later', { status: 429, headers: { 'retry-after': '100000' } });
      }
      case '/redirect-307': {
        return new Response(null, { status: 307, headers: { location: '/echo' } });
      }
      case '/echo': {
        return new Response(hits[hits.length - 1].body || 'empty');
      }
      case '/limit': {
        limitCalls += 1;

        return new Response('x'.repeat(5000));
      }
      default: {
        return new Response('plain');
      }
    }
  },
});

const base = `http://127.0.0.1:${server.port}`;
const engine: IFetchGuard = {
  createRoute: () => ({ vet: async ({ url }) => ({ url: new URL(url), addresses: [] }) }),
};

afterAll(async () => {
  await server.stop(true);
});

const refusal = async (task: Promise<unknown>): Promise<string> => {
  const error = await RejectionHelper.rejectionOf({ task });

  return error instanceof Error ? error.message : String(error);
};

describe('a guard refuses every option that chooses the connection', () => {
  test('axios: guard.proxy would go direct and unpinned, so it is refused', async () => {
    const fetcher = new AxiosFetcher({ name: 'a', guardEngine: engine });

    const result = await refusal(
      fetcher.get({ url: `${base}/x`, guard: { proxy: 'http://127.0.0.1:1' } }),
    );
    expect(result).toContain('guard.proxy');
  });

  for (const option of [
    'socketPath',
    'lookup',
    'transport',
    'proxy',
    'httpAgent',
    'httpsAgent',
    'family',
  ]) {
    test(`axios: ${option} is refused per call and in defaultConfigs`, async () => {
      const value =
        option === 'proxy'
          ? false
          : option === 'family'
            ? 4
            : option === 'socketPath'
              ? '/tmp/x'
              : {};
      const perCall = new AxiosFetcher({ name: 'a', guardEngine: engine });
      const inDefaults = new AxiosFetcher({
        name: 'a',
        guardEngine: engine,
        defaultConfigs: Object.fromEntries([[option, value]]),
      });

      const result2 = await refusal(
        perCall.get({ url: `${base}/x`, guard: {}, ...Object.fromEntries([[option, value]]) }),
      );
      expect(result2).toContain(option);
      const result3 = await refusal(inDefaults.get({ url: `${base}/x`, guard: {} }));
      expect(result3).toContain(option);
    });
  }

  test('axios: a custom adapter function and a stream response are refused', async () => {
    const fetcher = new AxiosFetcher({ name: 'a', guardEngine: engine });

    const result4 = await refusal(
      fetcher.get({
        url: `${base}/x`,
        guard: {},
        adapter: async () => Promise.reject(new Error('x')),
      }),
    );
    expect(result4).toContain('adapter');
    const result5 = await refusal(
      fetcher.get({ url: `${base}/x`, guard: {}, responseType: 'stream' }),
    );
    expect(result5).toContain('stream');
  });

  for (const option of ['unix', 'dispatcher', 'proxy', 'tls']) {
    test(`native: ${option} is refused per call and in defaultConfigs`, async () => {
      const perCall = new NativeFetcher({ name: 'n', guardEngine: engine });
      const inDefaults = new NativeFetcher({
        name: 'n',
        guardEngine: engine,
        defaultConfigs: Object.fromEntries([[option, 'x']]),
      });

      const result6 = await refusal(
        perCall.get({ url: `${base}/x`, guard: {}, ...Object.fromEntries([[option, 'x']]) }),
      );
      expect(result6).toContain(option);
      const result7 = await refusal(inDefaults.get({ url: `${base}/x`, guard: {} }));
      expect(result7).toContain(option);
    });
  }

  test("without a guard the same options are the caller's own business", async () => {
    const nativeFetcher = new NativeFetcher({ name: 'n', guardEngine: engine });
    const response = await nativeFetcher.get({ url: `${base}/x`, tls: {} });

    expect(response.status).toBe(200);
  });
});

describe('Retry-After', () => {
  test('a wait above the backoff ceiling ends the retries and rethrows the 429', async () => {
    const before = hits.length;
    const error = await RejectionHelper.rejectionOf({
      task: new NativeFetcher({ name: 'n' }).get({
        url: `${base}/long-wait`,
        retry: { maxAttempts: 4, backoff: FAST },
      }),
    });

    expect(UrlFetchError.is(error)).toBe(true);
    expect((error as UrlFetchError).status).toBe(429);
    expect(hits.length - before).toBe(1);
  });

  test("the default ceiling is the retry helper's 30 seconds", () => {
    const error = new UrlFetchError({
      message: 'x',
      status: 429,
      url: 'http://x',
      headers: new Headers({ 'retry-after': '100000' }),
      response: new Response(null),
    });

    expect(FetchRetry.DEFAULT_MAX_DELAY_MS).toBe(30_000);
    expect(FetchRetry.readRetryAfterMs({ error })).toBe(100_000_000);
  });

  test('an HTTP date is read, and a negative, a fractional or a garbled value is ignored', () => {
    const make = (value: string) =>
      new UrlFetchError({
        message: 'x',
        status: 503,
        url: 'http://x',
        headers: new Headers({ 'retry-after': value }),
        response: new Response(null),
      });
    const now = Date.parse('2026-11-19T10:00:00Z');

    expect(FetchRetry.readRetryAfterMs({ error: make('Thu, 19 Nov 2026 10:00:05 GMT'), now })).toBe(
      5000,
    );
    expect(FetchRetry.readRetryAfterMs({ error: make('-5'), now })).toBeUndefined();
    expect(FetchRetry.readRetryAfterMs({ error: make('1.5'), now })).toBeUndefined();
    expect(FetchRetry.readRetryAfterMs({ error: make('soon'), now })).toBeUndefined();
  });
});

describe('a guarded call caps the body it reads', () => {
  test('with a schema and no maxBytes the default 10 MB cap still applies (declared length)', async () => {
    const original = globalThis.fetch;

    globalThis.fetch = (async () =>
      new Response('{}', {
        headers: { 'content-type': 'application/json', 'content-length': '20000000' },
      })) as unknown as typeof fetch;

    try {
      const message = await refusal(
        new NativeFetcher({ name: 'n', guardEngine: engine }).get({
          url: `${base}/x`,
          guard: {},
          schema: z.object({}),
        }),
      );

      expect(message).toContain('Body exceeds the cap');
      expect(message).toContain('10485760');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('an unguarded call with no maxBytes stays uncapped', async () => {
    const nativeFetcher = new NativeFetcher({ name: 'n' });
    const response = await nativeFetcher.get({ url: `${base}/limit` });

    const result = await response.text();
    expect(result.length).toBe(5000);
    expect(limitCalls).toBeGreaterThan(0);
  });
});

describe('axios: the size cap is a refusal, not a transport error', () => {
  test('maxBytes overflow is the url-refused error and is not retried', async () => {
    const before = hits.length;
    const error = await RejectionHelper.rejectionOf({
      task: new AxiosFetcher({ name: 'a' }).get({
        url: `${base}/limit`,
        maxBytes: 100,
        retry: { maxAttempts: 3, backoff: FAST },
      }),
    });

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect(hits.length - before).toBe(1);
  });
});

describe('hooks', () => {
  test('a throwing onResponse releases the body before the error goes on', async () => {
    const original = globalThis.fetch;
    let isCancelled = false;

    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data'));
          },
          cancel() {
            isCancelled = true;
          },
        }),
      )) as unknown as typeof fetch;

    try {
      const message = await refusal(
        new NativeFetcher({
          name: 'n',
          hooks: {
            onResponse: () => {
              throw new Error('hook failed');
            },
          },
        }).get({ url: `${base}/x` }),
      );

      expect(message).toBe('hook failed');
      expect(isCancelled).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('replay', () => {
  test('a JSON object body follows a same-origin 307 with its body, on both fetchers', async () => {
    const nativeFetcher = new NativeFetcher({ name: 'n' });
    const native = await nativeFetcher.post({
      url: `${base}/redirect-307`,
      body: { a: 1 },
      maxRedirects: 2,
    });
    const result = await native.text();
    expect(result).toBe('{"a":1}');

    const axiosFetcher = new AxiosFetcher({ name: 'a' });
    const axiosResponse = await axiosFetcher.post({
      url: `${base}/redirect-307`,
      body: { b: 2 },
      maxRedirects: 2,
    });
    expect(axiosResponse.data).toEqual({ b: 2 });
  });

  test('a body that can be sent only once cannot be retried: a clear error, nothing sent', async () => {
    const before = hits.length;
    const message = await refusal(
      new NativeFetcher({ name: 'n' }).post({
        url: `${base}/x`,
        body: new ReadableStream(),
        retry: { maxAttempts: 2 },
      }),
    );

    expect(message).toContain('cannot carry a body that is sent once');
    expect(hits.length).toBe(before);
  });
});
