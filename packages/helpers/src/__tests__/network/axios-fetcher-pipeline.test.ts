/** The shared pipeline with axios as the client: the same status check, schema, defaults, hooks and retries. */

import { afterAll, describe, expect, test } from 'bun:test';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { z } from 'zod';
import {
  AxiosFetcher,
  AxiosNetworkRequest,
} from '@/modules/network/http-request/fetcher/axios-fetcher';
import { FetchSchemaError } from '@/modules/network/http-request/fetcher/common/errors';
import { UrlFetchError } from '@/modules/network/utilities/url-safety/common/errors';

const hits: Array<{ path: string; headers: Headers; body: string }> = [];
let flaky = 0;

const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: async (request) => {
    const { pathname } = new URL(request.url);
    const body = await request.text();
    hits.push({ path: pathname, headers: request.headers, body });

    switch (pathname) {
      case '/user': {
        return Response.json({ id: 7, name: 'Ada' });
      }
      case '/wrong': {
        return Response.json({ id: 'x', secret: 'top-secret-value' });
      }
      case '/404': {
        return Response.json({ error: 'missing' }, { status: 404 });
      }
      case '/flaky': {
        flaky += 1;

        return flaky < 3 ? new Response('no', { status: 503 }) : new Response('yes');
      }
      case '/slow': {
        await Bun.sleep(300);

        return new Response('late');
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
const User = z.object({ id: z.number(), name: z.string() });
const FAST = { initialDelayMs: 1, maxDelayMs: 2 };

afterAll(async () => {
  await server.stop(true);
});

describe('AxiosFetcher - the pipeline', () => {
  test('a 2xx answers the AxiosResponse, with the parsed json in data', async () => {
    const fetcher = new AxiosFetcher({ name: 'a' });
    const response = await fetcher.get({ url: `${base}/user` });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ id: 7, name: 'Ada' });
  });

  test('any other status throws a UrlFetchError<AxiosResponse>; acceptStatus is the opt-out', async () => {
    const fetcher = new AxiosFetcher({ name: 'a' });
    const error = await RejectionHelper.rejectionOf({ task: fetcher.get({ url: `${base}/404` }) });

    expect(UrlFetchError.is(error)).toBe(true);
    expect((error as UrlFetchError<unknown>).status).toBe(404);
    expect((error as UrlFetchError<unknown>).headers.get('content-type')).toContain('json');

    const accepted = await fetcher.get({
      url: `${base}/404`,
      acceptStatus: (status) => status === 404,
    });
    expect(accepted.status).toBe(404);
  });

  test('a schema answers { data, status, headers, response }, and a mismatch is a FetchSchemaError without the body', async () => {
    const fetcher = new AxiosFetcher({ name: 'a' });
    const parsed = await fetcher.get({ url: `${base}/user`, schema: User });

    expect(parsed.data.name).toBe('Ada');
    expect(parsed.response.status).toBe(200);

    const error = await RejectionHelper.rejectionOf({
      task: fetcher.get({ url: `${base}/wrong`, schema: User }),
    });

    expect(FetchSchemaError.is(error)).toBe(true);
    expect((error as FetchSchemaError).message).not.toContain('top-secret-value');
  });

  test('send has no type argument: the data is unknown until a schema says otherwise', async () => {
    const fetcher = new AxiosFetcher({ name: 'a' });
    const response = await fetcher.send({ url: `${base}/user` });
    const data: unknown = response.data;

    expect(data).toEqual({ id: 7, name: 'Ada' });
  });

  test('defaults: headers merge per header, a null removes one, a timeout applies per attempt', async () => {
    const fetcher = new AxiosFetcher({
      name: 'a',
      defaults: { headers: { 'x-app': 'one', 'x-gone': 'here' }, timeout: 50 },
    });

    const error = await RejectionHelper.rejectionOf({ task: fetcher.get({ url: `${base}/slow` }) });
    expect((error as DOMException).name).toBe('TimeoutError');

    await fetcher.get({ url: `${base}/user`, headers: { 'x-gone': null, 'x-call': '2' } });
    const hit = hits[hits.length - 1];

    expect(hit.headers.get('x-app')).toBe('one');
    expect(hit.headers.get('x-call')).toBe('2');
    expect(hit.headers.get('x-gone')).toBeNull();
  });

  test('hooks: onRequest per attempt, onResponse per attempt, onError once; retry reuses the shared helper', async () => {
    flaky = 0;
    const events: string[] = [];
    const fetcher = new AxiosFetcher({
      name: 'a',
      hooks: {
        onRequest: ({ attempt, headers }) => {
          events.push(`request ${attempt}`);
          headers.set('x-attempt', String(attempt));
        },
        onResponse: ({ status }) => {
          events.push(`response ${status}`);
        },
        onError: () => {
          events.push('error');
        },
      },
    });

    const response = await fetcher.get({
      url: `${base}/flaky`,
      retry: { maxAttempts: 3, backoff: FAST },
    });

    expect(response.data).toBe('yes');
    expect(events).toEqual([
      'request 1',
      'response 503',
      'request 2',
      'response 503',
      'request 3',
      'response 200',
    ]);
    expect(hits[hits.length - 1].headers.get('x-attempt')).toBe('3');

    await RejectionHelper.rejectionOf({ task: fetcher.get({ url: `${base}/404` }) });
    expect(events.filter((event) => event === 'error')).toHaveLength(1);
  });

  test('maxRedirects: 0 hands back the 3xx as a UrlFetchError, a positive one walks by hand', async () => {
    const fetcher = new AxiosFetcher({ name: 'a' });
    const error = await RejectionHelper.rejectionOf({
      task: fetcher.get({ url: `${base}/redirect`, maxRedirects: 0 }),
    });

    expect((error as UrlFetchError<unknown>).status).toBe(302);
    expect((error as UrlFetchError<unknown>).location).toBe('/user');

    const followed = await fetcher.get({ url: `${base}/redirect`, maxRedirects: 2 });
    expect(followed.data).toEqual({ id: 7, name: 'Ada' });
  });

  test('a guarded call without the engine says what to pass', async () => {
    const fetcher = new AxiosFetcher({ name: 'a' });
    const error = await RejectionHelper.rejectionOf({
      task: fetcher.get({ url: `${base}/user`, guard: {} }),
    });

    expect((error as Error).message).toContain('guardEngine: UrlGuard');
  });

  test('a caller agent is refused with a guard: it could connect elsewhere than the vetted address', async () => {
    const engine = {
      createRoute: () => ({
        vet: async () => ({ url: new URL(`${base}/user`), addresses: ['127.0.0.1'] }),
      }),
    };
    const fetcher = new AxiosFetcher({ name: 'a', guardEngine: engine });
    const error = await RejectionHelper.rejectionOf({
      task: fetcher.get({ url: `${base}/user`, guard: {}, httpAgent: {} }),
    });

    expect((error as Error).message).toContain('cannot carry its own httpAgent');
  });
});

describe('AxiosNetworkRequest', () => {
  test('keeps its defaults: a json content type and a 60s timeout, and a 404 now throws', async () => {
    const request = new AxiosNetworkRequest({
      name: 'a',
      networkOptions: { baseUrl: base },
    });
    const fetcher = request.getNetworkService();

    await fetcher.get({ url: request.getRequestUrl({ paths: ['user'] }) });
    expect(hits[hits.length - 1].headers.get('content-type')).toContain('application/json');

    const error = await RejectionHelper.rejectionOf({
      task: fetcher.get({ url: request.getRequestUrl({ paths: ['404'] }) }),
    });
    expect(UrlFetchError.is(error)).toBe(true);
  });
});
