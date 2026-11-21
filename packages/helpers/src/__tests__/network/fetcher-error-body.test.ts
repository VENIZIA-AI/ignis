/** A refused status keeps its body readable (up to 64 KiB), a fetcher can be given the sender, and an async `shouldRetry` decides a retry. */

import { afterAll, describe, expect, test } from 'bun:test';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { HTTP } from '@/common/constants/http';
import { NativeFetcher } from '@/modules/network/http-request/fetcher/native-fetcher';
import { UrlFetchError } from '@/modules/network/utilities/url-safety/common/errors';

const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: (request) => {
    const { pathname } = new URL(request.url);

    switch (pathname) {
      case '/envelope': {
        return Response.json({ error: { code: 'x.y', text: 'no' } }, { status: 422 });
      }
      case '/huge': {
        return new Response('e'.repeat(200_000), { status: 500 });
      }
      case '/not-modified': {
        return new Response(null, { status: 304 });
      }
      default: {
        return new Response('ok');
      }
    }
  },
});

const base = `http://127.0.0.1:${server.port}`;
const FAST = { initialDelayMs: 1, maxDelayMs: 2 };

afterAll(async () => {
  await server.stop(true);
});

const failure = async (task: Promise<unknown>): Promise<UrlFetchError<Response>> => {
  const error = await RejectionUtility.rejectionOf({ task });

  if (!(error instanceof UrlFetchError)) {
    throw new Error('expected a UrlFetchError');
  }

  return error;
};

describe('a refused status keeps its body', () => {
  test('the error carries a response whose body is readable', async () => {
    const error = await failure(new NativeFetcher({ name: 'n' }).get({ url: `${base}/envelope` }));
    const body = await error.response?.json();

    expect(error.status).toBe(HTTP.ResultCodes.RS_4.UnprocessableEntity);
    expect(body).toEqual({ error: { code: 'x.y', text: 'no' } });
    expect(error.response?.status).toBe(HTTP.ResultCodes.RS_4.UnprocessableEntity);
  });

  test('only the first 64 KiB are kept', async () => {
    const error = await failure(new NativeFetcher({ name: 'n' }).get({ url: `${base}/huge` }));
    const text = await error.response?.text();

    expect(text?.length).toBe(UrlFetchError.MAX_BODY_BYTES);
  });

  test('a status that has no body (304) still answers a response', async () => {
    const error = await failure(
      new NativeFetcher({ name: 'n' }).get({
        url: `${base}/not-modified`,
        acceptStatus: () => false,
      }),
    );

    expect(error.response?.status).toBe(HTTP.ResultCodes.RS_3.NotModified);
    const result = await error.response?.text();
    expect(result).toBe('');
  });
});

describe('the fetcher sender', () => {
  test('a given fetch sends the request, with the url as text and the pipeline init', async () => {
    const seen: Array<{ url: string; method: string | undefined; redirect: string | undefined }> =
      [];
    const fetcher = new NativeFetcher({
      name: 'n',
      fetch: async (url, init) => {
        seen.push({ url, method: init.method, redirect: init.redirect });

        return new Response('from the sender');
      },
    });
    const response = await fetcher.post({ url: `${base}/x`, body: { a: 1 } });

    const result = await response.text();
    expect(result).toBe('from the sender');
    expect(seen).toEqual([{ url: `${base}/x`, method: 'POST', redirect: 'follow' }]);
  });

  test('without one, the global fetch is looked up at call time', async () => {
    const original = globalThis.fetch;
    const fetcher = new NativeFetcher({ name: 'n' });

    globalThis.fetch = (async () => new Response('swapped')) as unknown as typeof fetch;

    try {
      const response = await fetcher.get({ url: `${base}/x` });

      const result2 = await response.text();
      expect(result2).toBe('swapped');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('the sender is called as a plain function', () => {
  test('a sender that rejects any `this` (window.fetch in a browser) is called without one', async () => {
    const sender = function (this: unknown): Promise<Response> {
      if (this !== undefined) {
        throw new TypeError('Illegal invocation');
      }

      return Promise.resolve(new Response('ok'));
    };

    const nativeFetcher = new NativeFetcher({ name: 'n', fetch: sender });
    const response = await nativeFetcher.get({ url: `${base}/x` });

    const result = await response.text();
    expect(result).toBe('ok');
  });
});

describe('shouldRetry may be async', () => {
  test('a promise that resolves false stops the retry, one that resolves true allows it', async () => {
    let calls = 0;
    const fetcher = new NativeFetcher({
      name: 'n',
      fetch: async () => {
        calls += 1;

        return new Response('down', { status: 503 });
      },
    });

    await failure(
      fetcher.get({
        url: `${base}/x`,
        retry: { maxAttempts: 3, backoff: FAST, shouldRetry: async () => false },
      }),
    );
    expect(calls).toBe(1);

    calls = 0;
    await failure(
      fetcher.get({
        url: `${base}/x`,
        retry: { maxAttempts: 3, backoff: FAST, shouldRetry: async () => true },
      }),
    );
    expect(calls).toBe(3);
  });
});
