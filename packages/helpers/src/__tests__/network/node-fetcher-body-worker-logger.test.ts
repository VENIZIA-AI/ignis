import { afterEach, describe, expect, test } from 'bun:test';
import { type AnyType } from '@/common';
import { loggerSlot } from '@/modules/logger/slot';
import { NodeFetcher, NodeFetchNetworkRequest } from '@/modules/network';

const originalFetch = globalThis.fetch;
const originalResolve = loggerSlot.resolve;

afterEach(() => {
  globalThis.fetch = originalFetch;
  loggerSlot.resolve = originalResolve;
});

interface ICaptured {
  url?: string;
  init?: RequestInit;
}

const captureRequest = (): ICaptured => {
  const captured: ICaptured = {};

  globalThis.fetch = ((input: AnyType, init?: RequestInit) => {
    captured.url = String(input);
    captured.init = init;
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as AnyType;

  return captured;
};

const buildFetcher = (opts?: { queryString?: AnyType }) => {
  return new NodeFetcher({ name: 'body-test', defaultConfigs: {}, queryString: opts?.queryString });
};

describe('NodeFetcher - body', () => {
  test('a plain object is JSON-encoded', async () => {
    const captured = captureRequest();

    await buildFetcher().post({ url: 'http://example.test/a', body: { a: 1 } as AnyType });

    expect(captured.init?.body).toBe('{"a":1}');
  });

  test('an array is JSON-encoded', async () => {
    const captured = captureRequest();

    await buildFetcher().post({ url: 'http://example.test/a', body: [1, { b: 2 }] as AnyType });

    expect(captured.init?.body).toBe('[1,{"b":2}]');
  });

  test('null and undefined send no body', async () => {
    const captured = captureRequest();

    await buildFetcher().post({ url: 'http://example.test/a', body: null });
    expect(captured.init?.body).toBeUndefined();

    await buildFetcher().post({ url: 'http://example.test/a' });
    expect(captured.init?.body).toBeUndefined();
  });

  test('every raw body kind passes through untouched', async () => {
    const raw: Array<unknown> = [
      '{"already":"json"}',
      new Blob(['x']),
      new ArrayBuffer(4),
      new Uint8Array([1, 2]),
      Buffer.from('x'),
      new FormData(),
      new URLSearchParams({ a: '1' }),
      new ReadableStream(),
    ];

    for (const body of raw) {
      const captured = captureRequest();

      await buildFetcher().post({ url: 'http://example.test/a', body: body as AnyType });

      expect(captured.init?.body).toBe(body as AnyType);
    }
  });
});

describe('NodeFetcher - worker', () => {
  test('getWorker() is the fetch the fetcher sends with', () => {
    expect(buildFetcher().getWorker()).toBe(fetch);
  });

  test('and through a network request', () => {
    const request = new NodeFetchNetworkRequest({
      name: 'worker-test',
      networkOptions: { baseUrl: 'http://example.test' },
    });

    expect(request.getWorker()).toBe(fetch);
  });
});

describe('NodeFetcher - query string options', () => {
  const filter = { where: { id: 1 } };

  test('the default writes an object param as an empty value', async () => {
    const captured = captureRequest();

    await buildFetcher().get({ url: 'http://example.test/a', params: { filter, q: undefined } });

    expect(captured.url).toBe('http://example.test/a?filter=&q=');
  });

  test('the ARDOR options send the filter as JSON and skip an undefined', async () => {
    const captured = captureRequest();

    await buildFetcher({ queryString: { nullish: 'skip', nested: 'json' } }).get({
      url: 'http://example.test/a?x=1',
      params: { filter, q: undefined, ids: [1, 2] },
    });

    expect(captured.url).toBe(
      `http://example.test/a?x=1&filter=${encodeURIComponent(JSON.stringify(filter))}&ids=%5B1%2C2%5D`,
    );
  });

  test('NodeFetchNetworkRequest carries the options to its fetcher and keeps them out of RequestInit', async () => {
    const captured = captureRequest();
    const request = new NodeFetchNetworkRequest({
      name: 'qs-test',
      networkOptions: {
        baseUrl: 'http://example.test',
        queryString: { nullish: 'skip', nested: 'json' },
      },
    });

    await request.getNetworkService().get({
      url: request.getRequestUrl({ paths: ['items'] }),
      params: { filter },
    });

    expect(captured.url).toBe(
      `http://example.test/items?filter=${encodeURIComponent(JSON.stringify(filter))}`,
    );
    expect(Object.keys(captured.init ?? {})).not.toContain('queryString');
  });
});

describe('NodeFetcher - logging', () => {
  test('a logger with only debug and info is accepted, and gets one debug line without the body', async () => {
    captureRequest();
    const lines: string[] = [];
    const logger = {
      debug: (message: string, ...args: unknown[]) => lines.push(`${message} ${args.map(String)}`),
      info: () => undefined,
    };

    await buildFetcher().post(
      {
        url: 'http://example.test/a',
        body: { secret: 'pw' } as AnyType,
        headers: { authorization: 'Bearer SUPER_SECRET_TOKEN' },
      },
      logger,
    );

    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('http://example.test/a');
    expect(lines[0]).not.toContain('SUPER_SECRET_TOKEN');
    expect(lines[0]).not.toContain('pw');
  });

  test('with no logger, no default logger is resolved - a browser never reaches the node provider', async () => {
    captureRequest();
    let resolved = 0;
    loggerSlot.resolve = () => {
      resolved += 1;
      throw new Error('the default logger must not be built by a request');
    };

    const request = new NodeFetchNetworkRequest({
      name: 'no-logger',
      networkOptions: { baseUrl: 'http://example.test', headers: { a: 'b' } },
    });
    await request.getNetworkService().send({ url: request.getRequestUrl({ paths: ['x'] }) });

    expect(resolved).toBe(0);
  });
});

describe('NodeFetcher - headers', () => {
  const headersOf = (captured: ICaptured) => {
    return Object.fromEntries(new Headers(captured.init?.headers));
  };

  test('the default headers survive a call that passes none', async () => {
    const captured = captureRequest();
    const fetcher = new NodeFetcher({
      name: 'h',
      defaultConfigs: { headers: { 'content-type': 'application/json', 'x-app': 'one' } },
    });

    await fetcher.get({ url: 'http://example.test/a' });

    expect(headersOf(captured)).toEqual({ 'content-type': 'application/json', 'x-app': 'one' });
  });

  test("a call's headers replace the defaults, so a body can leave the content type to fetch", async () => {
    const captured = captureRequest();
    const fetcher = new NodeFetcher({
      name: 'h',
      defaultConfigs: { headers: { 'content-type': 'application/json', 'x-app': 'one' } },
    });

    await fetcher.post({ url: 'http://example.test/a', headers: { authorization: 'Bearer t' } });

    expect(headersOf(captured)).toEqual({ authorization: 'Bearer t' });
  });

  test('no headers anywhere sends none', async () => {
    const captured = captureRequest();

    await buildFetcher().get({ url: 'http://example.test/a' });

    expect(captured.init?.headers).toBeUndefined();
  });
});
