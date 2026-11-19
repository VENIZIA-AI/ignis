/**
 * What a review of the fetcher pipeline asked to pin: the options that would route around the guard, the Retry-After
 * ceiling, the default cap of a guarded call, a hook that fails, replay of a JSON body and the axios size error.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { z } from 'zod';
import {
  AxiosFetcher,
  AxiosNetworkRequest,
} from '@/modules/network/http-request/fetcher/axios-fetcher';
import { NativeFetcher } from '@/modules/network/http-request/fetcher/native-fetcher';
import { FetchRetry } from '@/modules/network/http-request/fetcher/common/utilities';
import type { IFetchGuard } from '@/modules/network/http-request/fetcher/common/guard';
import { UrlFetchError } from '@/modules/network/utilities/url-safety/common/errors';
import { HTTP } from '@/common/constants/http';
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
      case '/missing': {
        return new Response('nope', { status: 404 });
      }
      case '/down': {
        return new Response('down', { status: 503 });
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

  for (const option of ['unix', 'dispatcher', 'proxy', 'tls', 'agent', 'someFutureBunKnob']) {
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

  for (const [option, value] of [
    ['transformRequest', [() => undefined]],
    ['transformResponse', [() => undefined]],
    ['paramsSerializer', { serialize: () => '' }],
    ['formSerializer', { visitor: () => true }],
    ['onUploadProgress', () => undefined],
    ['onDownloadProgress', () => undefined],
    ['cancelToken', {}],
    ['auth', { username: 'u', password: 'p' }],
    ['baseURL', 'http://evil.example'],
    ['allowAbsoluteUrls', false],
    ['withXSRFToken', () => true],
  ] as const) {
    test(`axios: ${option} is refused with a guard, per call and in defaultConfigs, and nothing is sent`, async () => {
      const before = hits.length;
      const perCall = new AxiosFetcher({ name: 'a', guardEngine: engine });
      const inDefaults = new AxiosFetcher({
        name: 'a',
        guardEngine: engine,
        defaultConfigs: Object.fromEntries([[option, value]]),
      });

      const result8 = await refusal(
        perCall.get({ url: `${base}/x`, guard: {}, ...Object.fromEntries([[option, value]]) }),
      );
      expect(result8).toContain(option);
      const result9 = await refusal(inDefaults.get({ url: `${base}/x`, guard: {} }));
      expect(result9).toContain(option);
      expect(hits.length).toBe(before);
    });
  }

  test("axios: a baseUrl on AxiosNetworkRequest is refused in the caller's words", async () => {
    const request = new AxiosNetworkRequest({
      name: 'a',
      networkOptions: { baseUrl: base },
      guardEngine: engine,
    });
    const message = await refusal(request.getNetworkService().get({ url: `${base}/x`, guard: {} }));

    expect(message).toContain('needs one absolute url');
    expect(message).toContain('AxiosFetcher without baseUrl');
  });

  test('axios: a transformRequest that would move the request to a unix socket never runs', async () => {
    let hasRun = false;
    const error = await refusal(
      new AxiosFetcher({ name: 'a', guardEngine: engine }).post({
        url: `${base}/x`,
        guard: {},
        body: { a: 1 },
        transformRequest: [
          function moveToSocket(this: { socketPath?: string | null }) {
            hasRun = true;
            this.socketPath = '/tmp/internal.sock';
          },
        ],
      }),
    );

    expect(error).toContain('transformRequest');
    expect(hasRun).toBe(false);
  });

  test('axios: turning TLS verification off is refused with a guard, per call and on the instance', async () => {
    const perCall = new AxiosFetcher({ name: 'a', guardEngine: engine });
    const onInstance = new AxiosFetcher({
      name: 'a',
      guardEngine: engine,
      rejectUnauthorized: false,
    });

    const result10 = await refusal(
      perCall.get({ url: `${base}/x`, guard: {}, rejectUnauthorized: false }),
    );
    expect(result10).toContain('TLS verification');
    const result11 = await refusal(onInstance.get({ url: `${base}/x`, guard: {} }));
    expect(result11).toContain('TLS verification');
  });

  test('an option on the allowlist passes with a guard', async () => {
    const axiosFetcher = new AxiosFetcher({ name: 'a', guardEngine: engine });
    const response = await axiosFetcher.get({
      url: `${base}/x`,
      guard: {},
      withCredentials: true,
      responseType: 'text',
      rejectUnauthorized: true,
    });
    const nativeFetcher2 = new NativeFetcher({
      name: 'n',
      guardEngine: engine,
      defaultConfigs: { credentials: 'omit', cache: 'no-store' },
    });
    const native = await nativeFetcher2.get({ url: `${base}/x`, guard: {} });

    expect(response.status).toBe(200);
    expect(native.status).toBe(200);
  });

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

  test('with maxAttempts 1 a once-only body is fine even when the fetcher defaults to retry', async () => {
    const fetcher = new NativeFetcher({ name: 'n', defaults: { retry: { maxAttempts: 3 } } });
    const response = await fetcher.post({
      url: `${base}/x`,
      body: new Blob(['x']),
      retry: { maxAttempts: 1 },
    });
    const form = await fetcher.post({
      url: `${base}/x`,
      body: new FormData(),
      retry: { maxAttempts: 1 },
    });

    expect(response.status).toBe(200);
    expect(form.status).toBe(200);
  });

  test('a Blob and URLSearchParams can be retried, a FormData cannot', async () => {
    const fetcher = new NativeFetcher({ name: 'n' });
    const retry = { maxAttempts: 2, backoff: FAST };

    const result2 = await fetcher.post({ url: `${base}/x`, body: new Blob(['x']), retry });
    expect(result2.status).toBe(200);
    const result3 = await fetcher.post({
      url: `${base}/x`,
      body: new URLSearchParams({ a: '1' }),
      retry,
    });
    expect(result3.status).toBe(200);
    const result4 = await refusal(fetcher.post({ url: `${base}/x`, body: new FormData(), retry }));
    expect(result4).toContain('sent once');
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

describe('acceptStatus as a list', () => {
  const NOT_FOUND = HTTP.ResultCodes.RS_4.NotFound;
  const UNAVAILABLE = HTTP.ResultCodes.RS_5.ServiceUnavailable;

  test('a list adds to 2xx: the listed status is an answer, 2xx still is, any other throws', async () => {
    const fetcher = new NativeFetcher({ name: 'n' });
    const missing = await fetcher.get({ url: `${base}/missing`, acceptStatus: [NOT_FOUND] });
    const plain = await fetcher.get({ url: `${base}/x`, acceptStatus: [NOT_FOUND] });
    const error = await RejectionHelper.rejectionOf({
      task: fetcher.get({ url: `${base}/down`, acceptStatus: [NOT_FOUND] }),
    });

    expect(missing.status).toBe(NOT_FOUND);
    expect(plain.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect((error as UrlFetchError).status).toBe(UNAVAILABLE);
  });

  test('a function decides alone: it can refuse a 2xx', async () => {
    const error = await RejectionHelper.rejectionOf({
      task: new NativeFetcher({ name: 'n' }).get({ url: `${base}/x`, acceptStatus: () => false }),
    });

    expect(UrlFetchError.is(error)).toBe(true);
  });

  test('an empty list is 2xx only', async () => {
    const error = await RejectionHelper.rejectionOf({
      task: new NativeFetcher({ name: 'n' }).get({ url: `${base}/missing`, acceptStatus: [] }),
    });

    expect((error as UrlFetchError).status).toBe(NOT_FOUND);
  });

  test('an accepted status is never retried', async () => {
    const before = hits.length;
    const nativeFetcher = new NativeFetcher({ name: 'n' });
    const response = await nativeFetcher.get({
      url: `${base}/down`,
      acceptStatus: [UNAVAILABLE],
      retry: { maxAttempts: 3, backoff: FAST },
    });

    expect(response.status).toBe(UNAVAILABLE);
    expect(hits.length - before).toBe(1);
  });

  test('axios takes the same list', async () => {
    const axiosFetcher = new AxiosFetcher({ name: 'a' });
    const response = await axiosFetcher.get({
      url: `${base}/missing`,
      acceptStatus: [NOT_FOUND],
    });

    expect(response.status).toBe(NOT_FOUND);
  });
});
