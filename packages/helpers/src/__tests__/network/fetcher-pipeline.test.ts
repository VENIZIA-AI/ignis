/**
 * The pipeline every fetcher shares, over a real HTTP server on loopback: the status check, the schema, `acceptStatus`,
 * `defaults`, the three hooks, retries, the body cap, the deadline and the caller's signal. The guard has its own files.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { FetchSchemaError } from '@/modules/network/http-request/fetcher/common/errors';
import { UrlFetchError } from '@/modules/network/utilities/url-safety/common/errors';
import { NativeFetcher } from '@/modules/network/http-request/fetcher/native-fetcher';

interface IHit {
  method: string;
  path: string;
  headers: Headers;
  body: string;
}

const hits: IHit[] = [];
const counters = new Map<string, number>();

/** Counts the visits to `path`, so a route can fail the first times and then answer. */
const visit = (path: string): number => {
  const count = (counters.get(path) ?? 0) + 1;
  counters.set(path, count);

  return count;
};

const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: async (request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    hits.push({
      method: request.method,
      path,
      headers: request.headers,
      body: await request.text(),
    });

    switch (path) {
      case '/user': {
        return Response.json({ id: 7, name: 'Ada' });
      }
      case '/wrong': {
        return Response.json({ id: 'not-a-number', secret: 'top-secret-value' });
      }
      case '/html': {
        return new Response('<html>nope</html>', { headers: { 'content-type': 'text/html' } });
      }
      case '/empty': {
        return new Response(null, { status: 200 });
      }
      case '/404': {
        return Response.json({ error: 'missing' }, { status: 404 });
      }
      case '/503': {
        return new Response('down', { status: 503, headers: { 'retry-after': '0' } });
      }
      case '/flaky': {
        return visit(path) < 3 ? new Response('no', { status: 503 }) : new Response('yes');
      }
      case '/flaky-429': {
        return visit(path) < 2
          ? new Response('slow down', { status: 429, headers: { 'retry-after': '1' } })
          : new Response('ok');
      }
      case '/post-flaky': {
        return visit(path) < 2 ? new Response('no', { status: 500 }) : new Response('created');
      }
      case '/slow': {
        await Bun.sleep(300);

        return new Response('late');
      }
      case '/big': {
        return new Response('x'.repeat(5000));
      }
      case '/redirect': {
        return new Response(null, { status: 302, headers: { location: '/user' } });
      }
      default: {
        return new Response('plain');
      }
    }
  },
});

const base = `http://127.0.0.1:${server.port}`;
const lastHit = () => hits[hits.length - 1];

beforeAll(() => {
  hits.length = 0;
});

afterAll(async () => {
  await server.stop(true);
});

const buildFetcher = (opts?: ConstructorParameters<typeof NativeFetcher>[0]) =>
  new NativeFetcher(opts ?? { name: 'pipeline' });

const User = z.object({ id: z.number(), name: z.string() });

describe('the status check', () => {
  test('a 2xx answers the raw Response, as it always did', async () => {
    const response = await buildFetcher().get({ url: `${base}/user` });

    expect(response).toBeInstanceOf(Response);
    expect(await response.json()).toEqual({ id: 7, name: 'Ada' });
  });

  test('any other status throws a UrlFetchError with the status, the url, the headers and the response', async () => {
    const error = await buildFetcher()
      .get({ url: `${base}/404` })
      .catch((caught: unknown) => caught);

    expect(UrlFetchError.is(error)).toBe(true);
    const typed = error as UrlFetchError;
    expect(typed.status).toBe(404);
    expect(typed.url).toBe(`${base}/404`);
    expect(typed.headers.get('content-type')).toContain('json');
    expect(typed.response?.status).toBe(404);
    expect(typed.statusCode).toBe(400);
  });

  test('acceptStatus is the one opt-out: a 404 can be data', async () => {
    const response = await buildFetcher().get({
      url: `${base}/404`,
      acceptStatus: (status) => status === 404 || status < 300,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'missing' });
  });

  test('a 3xx the client followed is judged on its final answer', async () => {
    const response = await buildFetcher().get({ url: `${base}/redirect` });

    expect(await response.json()).toEqual({ id: 7, name: 'Ada' });
  });
});

describe('the schema', () => {
  test('a body that fits answers { data, status, headers, response } with the type z.infer gives', async () => {
    const parsed = await buildFetcher().get({ url: `${base}/user`, schema: User });
    const name: string = parsed.data.name;

    expect(name).toBe('Ada');
    expect(parsed.data.id).toBe(7);
    expect(parsed.status).toBe(200);
    expect(parsed.headers.get('content-type')).toContain('json');
    expect(parsed.response).toBeInstanceOf(Response);
  });

  test('every verb and send take a schema', async () => {
    const fetcher = buildFetcher();

    for (const parsed of [
      await fetcher.send({ url: `${base}/user`, schema: User }),
      await fetcher.post({ url: `${base}/user`, schema: User }),
      await fetcher.put({ url: `${base}/user`, schema: User }),
      await fetcher.patch({ url: `${base}/user`, schema: User }),
      await fetcher.delete({ url: `${base}/user`, schema: User }),
      await fetcher.query({ url: `${base}/user`, schema: User }),
    ]) {
      expect(parsed.data.id).toBe(7);
    }
  });

  test('a mismatch is a FetchSchemaError (502) naming paths and rules, never the body', async () => {
    const error = await buildFetcher()
      .get({ url: `${base}/wrong`, schema: User })
      .catch((caught: unknown) => caught);

    expect(FetchSchemaError.is(error)).toBe(true);
    const typed = error as FetchSchemaError;
    expect(typed.statusCode).toBe(502);
    expect(typed.status).toBe(200);
    expect(typed.issues.map((issue) => issue.path.join('.'))).toContain('id');
    expect(typed.message).not.toContain('top-secret-value');
    expect(JSON.stringify(typed.issues)).not.toContain('top-secret-value');
  });

  test('a body that is not JSON, and an empty one, are mismatches too', async () => {
    const fetcher = buildFetcher();
    const notJson = await fetcher.get({ url: `${base}/html`, schema: User }).catch((c: unknown) => c);
    const empty = await fetcher.get({ url: `${base}/empty`, schema: User }).catch((c: unknown) => c);

    expect(FetchSchemaError.is(notJson)).toBe(true);
    expect((notJson as FetchSchemaError).issues[0].code).toBe('invalid_json');
    expect(FetchSchemaError.is(empty)).toBe(true);
  });

  test('without a schema nothing is parsed and the raw response is returned', async () => {
    const response = await buildFetcher().get({ url: `${base}/wrong` });

    expect(response.status).toBe(200);
  });
});

describe('defaults', () => {
  test('headers merge per header with the call winning, and null removes a default', async () => {
    const fetcher = buildFetcher({
      name: 'defaults',
      defaults: { headers: { 'x-app': 'one', 'x-gone': 'here' } },
    });

    await fetcher.get({ url: `${base}/user`, headers: { 'x-call': 'two', 'x-gone': null, 'X-App': 'three' } });

    expect(lastHit().headers.get('x-app')).toBe('three');
    expect(lastHit().headers.get('x-call')).toBe('two');
    expect(lastHit().headers.get('x-gone')).toBeNull();
  });

  test('a default timeout applies, and a call timeout replaces it', async () => {
    const fetcher = buildFetcher({ name: 'timeout', defaults: { timeout: 50 } });

    const timedOut = await fetcher.get({ url: `${base}/slow` }).catch((c: unknown) => c);
    expect(timedOut).toBeInstanceOf(DOMException);
    expect((timedOut as DOMException).name).toBe('TimeoutError');

    const response = await fetcher.get({ url: `${base}/slow`, timeout: 2000 });
    expect(await response.text()).toBe('late');
  });

  test('a default retry applies, and a call can stop it with maxAttempts: 1', async () => {
    counters.delete('/flaky');
    const fetcher = buildFetcher({
      name: 'retry-defaults',
      defaults: { retry: { maxAttempts: 4, backoff: { initialDelayMs: 1, maxDelayMs: 2 } } },
    });

    const response = await fetcher.get({ url: `${base}/flaky` });
    expect(await response.text()).toBe('yes');

    counters.delete('/flaky');
    const stopped = await fetcher
      .get({ url: `${base}/flaky`, retry: { maxAttempts: 1 } })
      .catch((c: unknown) => c);
    expect(UrlFetchError.is(stopped)).toBe(true);
  });

  test('a default maxBytes applies to the body', async () => {
    const fetcher = buildFetcher({ name: 'cap', defaults: { maxBytes: 100 } });

    const error = await fetcher.get({ url: `${base}/big` }).catch((c: unknown) => c);

    expect((error as Error).message).toContain('Body exceeds the cap');
  });
});

describe('hooks', () => {
  test('onRequest runs before every send, and what it sets on the headers is sent', async () => {
    let calls = 0;
    const fetcher = buildFetcher({
      name: 'hooks',
      hooks: {
        onRequest: ({ headers, method, url, attempt }) => {
          calls += 1;
          headers.set('x-signed', `${method} ${new URL(url).pathname} #${attempt}`);
        },
      },
    });

    await fetcher.get({ url: `${base}/user` });

    expect(calls).toBe(1);
    expect(lastHit().headers.get('x-signed')).toBe('GET /user #1');
  });

  test('onRequest runs again for each retry attempt, so a signature is fresh', async () => {
    counters.delete('/flaky');
    const signed: string[] = [];
    const fetcher = buildFetcher({
      name: 'hooks-retry',
      hooks: {
        onRequest: ({ headers, attempt }) => {
          headers.set('x-attempt', String(attempt));
          signed.push(`attempt ${attempt}`);
        },
      },
    });

    await fetcher.get({ url: `${base}/flaky`, retry: { maxAttempts: 3, backoff: { initialDelayMs: 1, maxDelayMs: 2 } } });

    expect(signed).toEqual(['attempt 1', 'attempt 2', 'attempt 3']);
    expect(lastHit().headers.get('x-attempt')).toBe('3');
  });

  test('the url of the request cannot be assigned: a hook cannot send the call elsewhere', async () => {
    const fetcher = buildFetcher({
      name: 'hooks-url',
      hooks: {
        onRequest: (request) => {
          Reflect.set(request, 'url', 'http://evil.test/');

          if (request.url !== `${base}/user`) {
            throw new Error('the url changed');
          }
        },
      },
    });

    const before = hits.length;
    const response = await fetcher.get({ url: `${base}/user` });

    expect(response.status).toBe(200);
    expect(hits.length).toBe(before + 1);
    expect(lastHit().path).toBe('/user');
  });

  test('onResponse runs once per attempt, before the status check and the schema', async () => {
    const seen: number[] = [];
    const fetcher = buildFetcher({
      name: 'hooks-response',
      hooks: {
        onResponse: ({ status, headers, durationMs }) => {
          seen.push(status);
          expect(headers).toBeInstanceOf(Headers);
          expect(durationMs).toBeGreaterThanOrEqual(0);
        },
      },
    });

    await fetcher.get({ url: `${base}/404` }).catch(() => undefined);
    await fetcher.get({ url: `${base}/wrong`, schema: User }).catch(() => undefined);

    expect(seen).toEqual([404, 200]);
  });

  test('onError runs once with the final error, which is then rethrown', async () => {
    counters.delete('/flaky');
    const errors: unknown[] = [];
    const fetcher = buildFetcher({
      name: 'hooks-error',
      hooks: {
        onError: ({ error, attempt }) => {
          errors.push([error, attempt]);
        },
      },
    });

    const failure = await fetcher
      .get({ url: `${base}/503`, retry: { maxAttempts: 2, backoff: { initialDelayMs: 1, maxDelayMs: 2 } } })
      .catch((caught: unknown) => caught);

    expect(UrlFetchError.is(failure)).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual([failure, 2]);
  });

  test('onError sees a timeout, a network failure and a schema mismatch', async () => {
    const kinds: string[] = [];
    const fetcher = buildFetcher({
      name: 'hooks-kinds',
      hooks: {
        onError: ({ error }) => {
          kinds.push(error instanceof Error || error instanceof DOMException ? error.name : 'other');
        },
      },
    });

    await fetcher.get({ url: `${base}/slow`, timeout: 20 }).catch(() => undefined);
    await fetcher.get({ url: 'http://127.0.0.1:1/' }).catch(() => undefined);
    await fetcher.get({ url: `${base}/wrong`, schema: User }).catch(() => undefined);

    expect(kinds[0]).toBe('TimeoutError');
    expect(kinds).toHaveLength(3);
    expect(kinds[2]).toBe('FetchSchemaError');
  });

  test('a hook that throws fails the call, and onError sees that failure', async () => {
    const seen: string[] = [];
    const fetcher = buildFetcher({
      name: 'hooks-throw',
      hooks: {
        onRequest: () => {
          throw new Error('cannot sign');
        },
        onError: ({ error }) => { seen.push((error as Error).message); },
      },
    });

    const failure = await fetcher.get({ url: `${base}/user` }).catch((caught: unknown) => caught);

    expect((failure as Error).message).toBe('cannot sign');
    expect(seen).toEqual(['cannot sign']);
  });
});

describe('retry', () => {
  const FAST = { initialDelayMs: 1, maxDelayMs: 2 };

  test('a 5xx is retried until it answers', async () => {
    counters.delete('/flaky');
    const retries: number[] = [];

    const response = await buildFetcher().get({
      url: `${base}/flaky`,
      retry: { maxAttempts: 3, backoff: FAST, onRetry: ({ attempt }) => { retries.push(attempt); } },
    });

    expect(await response.text()).toBe('yes');
    expect(retries).toEqual([1, 2]);
  });

  test('a 4xx, a 3xx the caller does not accept and a schema mismatch are not retried', async () => {
    const fetcher = buildFetcher();
    const before = hits.length;

    await fetcher.get({ url: `${base}/404`, retry: { maxAttempts: 3, backoff: FAST } }).catch(() => undefined);
    await fetcher
      .get({ url: `${base}/redirect`, maxRedirects: 0, retry: { maxAttempts: 3, backoff: FAST } })
      .catch(() => undefined);
    await fetcher
      .get({ url: `${base}/wrong`, schema: User, retry: { maxAttempts: 3, backoff: FAST } })
      .catch(() => undefined);

    expect(hits.length - before).toBe(3);
  });

  test('a timeout and a network error are retried', async () => {
    const attempts: number[] = [];
    const error = await buildFetcher()
      .get({
        url: `${base}/slow`,
        timeout: 20,
        retry: { maxAttempts: 3, backoff: FAST, onRetry: ({ attempt }) => { attempts.push(attempt); } },
      })
      .catch((caught: unknown) => caught);

    expect((error as DOMException).name).toBe('TimeoutError');
    expect(attempts).toEqual([1, 2]);

    const network: number[] = [];
    await buildFetcher()
      .get({
        url: 'http://127.0.0.1:1/',
        retry: { maxAttempts: 2, backoff: FAST, onRetry: ({ attempt }) => { network.push(attempt); } },
      })
      .catch(() => undefined);
    expect(network).toEqual([1]);
  });

  test('a 429 Retry-After is honoured as the least wait, inside the total budget', async () => {
    counters.delete('/flaky-429');
    const delays: number[] = [];
    const startedAt = Date.now();

    const response = await buildFetcher().get({
      url: `${base}/flaky-429`,
      retry: {
        maxAttempts: 2,
        backoff: FAST,
        onRetry: ({ nextDelayMs }) => { delays.push(nextDelayMs); },
      },
    });

    expect(await response.text()).toBe('ok');
    expect(delays).toEqual([1000]);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(950);
  });

  test('a Retry-After that does not fit maxTotalMs ends the retries and rethrows the 429', async () => {
    counters.delete('/flaky-429');

    const error = await buildFetcher()
      .get({ url: `${base}/flaky-429`, retry: { maxAttempts: 3, maxTotalMs: 200, backoff: FAST } })
      .catch((caught: unknown) => caught);

    expect(UrlFetchError.is(error)).toBe(true);
    expect((error as UrlFetchError).status).toBe(429);
  });

  test("the caller's shouldRetry replaces the default decision", async () => {
    const before = hits.length;

    await buildFetcher()
      .get({
        url: `${base}/404`,
        retry: { maxAttempts: 3, backoff: FAST, shouldRetry: ({ error }) => UrlFetchError.is(error) },
      })
      .catch(() => undefined);

    expect(hits.length - before).toBe(3);
  });

  test('a POST is retried because the caller passed retry, and not otherwise', async () => {
    counters.delete('/post-flaky');
    const fetcher = buildFetcher();

    const first = await fetcher.post({ url: `${base}/post-flaky`, body: { a: 1 } }).catch((c: unknown) => c);
    expect(UrlFetchError.is(first)).toBe(true);

    counters.delete('/post-flaky');
    const retried = await fetcher.post({
      url: `${base}/post-flaky`,
      body: { a: 1 },
      retry: { maxAttempts: 2, backoff: FAST },
    });
    expect(await retried.text()).toBe('created');
    expect(lastHit().body).toBe('{"a":1}');
  });

  test("the caller's own abort stops the retries", async () => {
    const controller = new AbortController();
    const reason = new Error('user cancelled');
    let attempts = 0;

    const pending = buildFetcher()
      .get({
        url: `${base}/503`,
        signal: controller.signal,
        retry: {
          maxAttempts: 5,
          backoff: { initialDelayMs: 50, maxDelayMs: 50 },
          onRetry: () => {
            attempts += 1;
            controller.abort(reason);
          },
        },
      })
      .catch((caught: unknown) => caught);

    expect(await pending).toBe(reason);
    expect(attempts).toBe(1);
  });
});

describe('the body cap', () => {
  test('a declared length over maxBytes is refused before the body is read', async () => {
    const error = await buildFetcher()
      .get({ url: `${base}/big`, maxBytes: 100 })
      .catch((caught: unknown) => caught);

    expect((error as Error).message).toContain('Body exceeds the cap | declared: 5000');
  });

  test('a body inside the cap is returned whole', async () => {
    const response = await buildFetcher().get({ url: `${base}/big`, maxBytes: 10_000 });

    expect((await response.text()).length).toBe(5000);
  });

  test('a body that lies about its length is cut off while it streams', async () => {
    const liar = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('x'.repeat(4000)));
              controller.enqueue(new TextEncoder().encode('x'.repeat(4000)));
              controller.close();
            },
          }),
        ),
    });

    try {
      const response = await buildFetcher().get({ url: `http://127.0.0.1:${liar.port}/`, maxBytes: 5000 });
      const error = await response.text().catch((caught: unknown) => caught);

      expect((error as Error).message).toContain('Body exceeds the cap');
    } finally {
      await liar.stop(true);
    }
  });

  test('with a schema the body is read inside the cap too', async () => {
    const error = await buildFetcher()
      .get({ url: `${base}/user`, schema: User, maxBytes: 5 })
      .catch((caught: unknown) => caught);

    expect((error as Error).message).toContain('Body exceeds the cap');
  });
});

describe('the deadline and the signal', () => {
  test('the timeout is per attempt and is a TimeoutError', async () => {
    const error = await buildFetcher().get({ url: `${base}/slow`, timeout: 30 }).catch((c: unknown) => c);

    expect((error as DOMException).name).toBe('TimeoutError');
  });

  test("a caller's abort rejects with the caller's own reason, apart from a timeout", async () => {
    const controller = new AbortController();
    const reason = new Error('stop');
    const pending = buildFetcher()
      .get({ url: `${base}/slow`, timeout: 5000, signal: controller.signal })
      .catch((caught: unknown) => caught);

    setTimeout(() => controller.abort(reason), 20);

    expect(await pending).toBe(reason);
  });

  test('an already aborted signal never reaches the server', async () => {
    const controller = new AbortController();
    controller.abort(new Error('before'));
    const before = hits.length;

    const error = await buildFetcher()
      .get({ url: `${base}/user`, signal: controller.signal })
      .catch((caught: unknown) => caught);

    expect((error as Error).message).toBe('before');
    expect(hits.length).toBe(before);
  });
});

describe('redirects', () => {
  test('maxRedirects: 0 hands back the 3xx as a UrlFetchError with its location', async () => {
    const error = await buildFetcher()
      .get({ url: `${base}/redirect`, maxRedirects: 0 })
      .catch((caught: unknown) => caught);

    expect(UrlFetchError.is(error)).toBe(true);
    expect((error as UrlFetchError).status).toBe(302);
    expect((error as UrlFetchError).location).toBe('/user');
  });

  test('maxRedirects: 0 with acceptStatus accepting the 3xx returns it', async () => {
    const response = await buildFetcher().get({
      url: `${base}/redirect`,
      maxRedirects: 0,
      acceptStatus: (status) => status < 400,
    });

    expect(response.status).toBe(302);
  });

  test('a positive maxRedirects walks the redirect by hand', async () => {
    const response = await buildFetcher().get({ url: `${base}/redirect`, maxRedirects: 2 });

    expect(await response.json()).toEqual({ id: 7, name: 'Ada' });
  });
});

describe('a call with a guard and no engine', () => {
  test('says what to pass, and sends nothing', async () => {
    const before = hits.length;
    const error = await buildFetcher()
      .get({ url: `${base}/user`, guard: {} })
      .catch((caught: unknown) => caught);

    expect((error as Error).message).toContain('guardEngine: UrlGuard');
    expect(hits.length).toBe(before);
  });
});
