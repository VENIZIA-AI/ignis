import { describe, expect, test } from 'bun:test';
import { installBffFetch } from '@/transport/fetch-bridge';
import type { IBffTransport } from '@/transport/common/types';

/** Records what reached the transport, so a test can assert the request was routed intact. */
const createRecordingTransport = () => {
  const seen: Array<{ url: string; method: string; body: string }> = [];

  const transport: IBffTransport = {
    fetch: async ({ request }) => {
      seen.push({
        url: request.url,
        method: request.method,
        body: request.body ? await request.text() : '',
      });
      return new Response('from-bff', { status: 200 });
    },
  };

  return { transport, seen };
};

/** A stand-in for `globalThis`, so no test mutates the real one. */
const createCarrier = () => {
  const networkCalls: Array<{ url: string; body: string }> = [];

  const carrier = {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      networkCalls.push({
        url: request.url,
        body: request.body ? await request.text() : '',
      });
      return new Response('from-network', { status: 200 });
    }) as unknown as typeof globalThis.fetch,
  };

  return { carrier, networkCalls };
};

describe('installBffFetch', () => {
  test('routes a matching path to the transport', async () => {
    const { transport, seen } = createRecordingTransport();
    const { carrier } = createCarrier();

    const uninstall = installBffFetch({ transport, basePath: '/api', carrier });

    const response = await carrier.fetch('https://app.test/api/notes');

    expect(await response.text()).toBe('from-bff');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('https://app.test/api/notes');

    uninstall();
  });

  test('passes a non-matching path to the original fetch', async () => {
    const { transport, seen } = createRecordingTransport();
    const { carrier, networkCalls } = createCarrier();

    const uninstall = installBffFetch({ transport, basePath: '/api', carrier });

    const response = await carrier.fetch('https://app.test/assets/logo.svg');

    expect(await response.text()).toBe('from-network');
    expect(seen).toHaveLength(0);
    expect(networkCalls).toHaveLength(1);

    uninstall();
  });

  /**
   * Documents the intent; it does NOT guard it. Measured: Chromium marks the original body
   * disturbed on `new Request(original)` (`bodyUsed` flips to `true`, `text()` then throws
   * "body stream already read"), while Bun leaves it readable - so this assertion passes under the
   * test runner whichever way the bridge resolves the URL. The browser is where the difference
   * bites, and `resolveRequestUrl` is what avoids it there.
   */
  test('a passed-through Request keeps a readable body', async () => {
    const { transport } = createRecordingTransport();
    const { carrier, networkCalls } = createCarrier();

    const uninstall = installBffFetch({ transport, basePath: '/api', carrier });

    const request = new Request('https://app.test/upstream/items', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'content-type': 'application/json' },
    });

    await carrier.fetch(request);

    expect(networkCalls).toHaveLength(1);
    expect(networkCalls[0]!.body).toBe(JSON.stringify({ hello: 'world' }));

    uninstall();
  });

  test('a routed Request reaches the transport with its body intact', async () => {
    const { transport, seen } = createRecordingTransport();
    const { carrier } = createCarrier();

    const uninstall = installBffFetch({ transport, basePath: '/api', carrier });

    await carrier.fetch(
      new Request('https://app.test/api/notes', {
        method: 'POST',
        body: JSON.stringify({ title: 'first' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.body).toBe(JSON.stringify({ title: 'first' }));

    uninstall();
  });

  test('accepts several prefixes', async () => {
    const { transport, seen } = createRecordingTransport();
    const { carrier, networkCalls } = createCarrier();

    const uninstall = installBffFetch({
      transport,
      basePath: ['/api', '/internal'],
      carrier,
    });

    await carrier.fetch('https://app.test/api/notes');
    await carrier.fetch('https://app.test/internal/health');
    await carrier.fetch('https://app.test/public/index.html');

    expect(seen).toHaveLength(2);
    expect(networkCalls).toHaveLength(1);

    uninstall();
  });

  test('uninstall restores the original fetch', async () => {
    const { transport, seen } = createRecordingTransport();
    const { carrier } = createCarrier();
    const original = carrier.fetch;

    const uninstall = installBffFetch({ transport, basePath: '/api', carrier });
    expect(carrier.fetch).not.toBe(original);

    uninstall();

    expect(carrier.fetch).toBe(original);
    await carrier.fetch('https://app.test/api/notes');
    expect(seen).toHaveLength(0);
  });

  /** Restoring would silently discard whatever patched `fetch` after this bridge did. */
  test('uninstall does nothing once something else has patched fetch', () => {
    const { transport } = createRecordingTransport();
    const { carrier } = createCarrier();

    const uninstall = installBffFetch({ transport, basePath: '/api', carrier });

    const laterPatch = (async () => new Response('later')) as unknown as typeof globalThis.fetch;
    carrier.fetch = laterPatch;

    uninstall();

    expect(carrier.fetch).toBe(laterPatch);
  });

  test('refuses a second install rather than stacking bridges', () => {
    const { transport } = createRecordingTransport();
    const { carrier } = createCarrier();

    const uninstall = installBffFetch({ transport, basePath: '/api', carrier });

    expect(() => installBffFetch({ transport, basePath: '/other', carrier })).toThrow(
      /already installed/,
    );

    uninstall();
  });

  test('refuses an empty basePath, which would route everything', () => {
    const { transport } = createRecordingTransport();
    const { carrier } = createCarrier();

    expect(() => installBffFetch({ transport, basePath: '', carrier })).toThrow(/Invalid basePath/);
    expect(() => installBffFetch({ transport, basePath: [], carrier })).toThrow(/Invalid basePath/);
  });

  /** Whatever the runtime hung on `fetch` has to survive the swap - Bun puts `preconnect` there. */
  test('carries the original fetch own properties across', () => {
    const { transport } = createRecordingTransport();
    const { carrier } = createCarrier();

    Object.defineProperty(carrier.fetch, 'preconnect', { value: () => 'kept', configurable: true });

    const uninstall = installBffFetch({ transport, basePath: '/api', carrier });

    expect((carrier.fetch as unknown as { preconnect: () => string }).preconnect()).toBe('kept');

    uninstall();
  });
});
