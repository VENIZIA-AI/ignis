import { afterEach, describe, expect, test } from 'bun:test';
import { AnyType } from '@/common';
import { NodeFetcher } from '@/modules/network';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface ICapturedRequest {
  url?: string;
  signal?: AbortSignal;
}

const captureRequest = (): ICapturedRequest => {
  const captured: ICapturedRequest = {};

  globalThis.fetch = ((input: AnyType, init?: RequestInit) => {
    captured.url = String(input);
    captured.signal = init?.signal ?? undefined;
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as AnyType;

  return captured;
};

const buildFetcher = () => {
  return new NodeFetcher({ name: 'request-building', defaultConfigs: {} });
};

describe('NodeFetcher - query string assembly', () => {
  test('params are appended with ? when the url carries none', async () => {
    const captured = captureRequest();

    await buildFetcher().send({ url: 'http://example.test/a', params: { page: '2' } });

    expect(captured.url).toBe('http://example.test/a?page=2');
  });

  test('params are appended with & when the url ALREADY carries a query string', async () => {
    const captured = captureRequest();

    await buildFetcher().send({
      url: 'http://example.test/a?existing=1',
      params: { extra: '2' },
    });

    // A second '?' makes the server read `existing` as the literal string `1?extra=2`.
    expect(captured.url).toBe('http://example.test/a?existing=1&extra=2');
  });

  test('an empty params object leaves the url untouched - no dangling separator', async () => {
    const captured = captureRequest();

    await buildFetcher().send({ url: 'http://example.test/a', params: {} });

    expect(captured.url).toBe('http://example.test/a');
  });

  test('no params leaves the url untouched', async () => {
    const captured = captureRequest();

    await buildFetcher().send({ url: 'http://example.test/a' });

    expect(captured.url).toBe('http://example.test/a');
  });
});

describe('NodeFetcher - abort signal', () => {
  test("the caller's signal is forwarded when no timeout is set", async () => {
    const captured = captureRequest();
    const caller = new AbortController();

    await buildFetcher().send({ url: 'http://example.test/a', signal: caller.signal });

    expect(captured.signal).toBe(caller.signal);
  });

  test("a timeout does NOT swallow the caller's signal - aborting the caller still aborts the request", async () => {
    const captured = captureRequest();
    const caller = new AbortController();

    await buildFetcher().send({
      url: 'http://example.test/a',
      timeout: 60_000,
      signal: caller.signal,
    });

    expect(captured.signal?.aborted).toBe(false);

    caller.abort();

    // Losing this means a caller believes it cancelled a request that is in fact still running.
    expect(captured.signal?.aborted).toBe(true);
  });

  test('a timeout aborts an IN-FLIGHT request when the caller passes no signal', async () => {
    // The timer is cleared as soon as a response lands (no leaked timers), so the abort has to be observed while the request is still open - a fake transport that only settles on abort.
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = ((_input: AnyType, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
    }) as AnyType;

    let caught: unknown;
    try {
      await buildFetcher().send({ url: 'http://example.test/a', timeout: 5 });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(capturedSignal?.aborted).toBe(true);
  });

  test('a caller signal already aborted before the call aborts the request immediately', async () => {
    const captured = captureRequest();
    const caller = new AbortController();
    caller.abort();

    await buildFetcher().send({
      url: 'http://example.test/a',
      timeout: 60_000,
      signal: caller.signal,
    });

    expect(captured.signal?.aborted).toBe(true);
  });
});
