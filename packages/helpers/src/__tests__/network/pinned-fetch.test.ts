/**
 * `UrlIngest.fetchGuarded` connects to the address it vetted (#945). The name never resolves in real DNS here: `lookup`
 * is replaced, and the address it answers is the only way the request can reach the local server, which is the proof.
 */

import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

const lookupMock = mock(async (_hostname: string, _options?: unknown): Promise<unknown[]> => []);

await mock.module('node:dns/promises', () => ({ lookup: lookupMock }));

const { UrlIngest } = await import('@/modules/network/utilities/url-safety/ingest');
const { UrlPolicy } = await import('@/modules/network/utilities/url-safety/policy');
const { UrlSchemes } = await import('@/modules/network/utilities/url-safety/common/constants');

const policy = { allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS], maxRedirects: 3 };
const originalFetch = globalThis.fetch;

interface IRecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** A real HTTP server on loopback; each route decides the answer. */
const startServer = (routes: Record<string, (request: Request) => Response>) => {
  const seen: IRecordedRequest[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      const body = await request.text();

      seen.push({
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers),
        body,
      });

      return routes[path]?.(request) ?? new Response('not found', { status: 404 });
    },
  });

  return { server, seen, port: server.port };
};

/** Marks only loopback as public, so a local server can stand in for a vetted public address. */
const treatLoopbackAsPublic = () => {
  const original = UrlPolicy.isNonPublicAddress.bind(UrlPolicy);

  return spyOn(UrlPolicy, 'isNonPublicAddress').mockImplementation((opts) =>
    opts.address === '127.0.0.1' ? false : original(opts),
  );
};

const answer = (...addresses: string[]) =>
  addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

const rejectionOf = async (task: Promise<unknown>): Promise<Error> => {
  try {
    await task;
  } catch (error) {
    return error as Error;
  }

  throw new Error('Expected the call to reject, but it resolved');
};

beforeEach(() => {
  lookupMock.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

afterAll(() => {
  mock.restore();
});

describe('UrlIngest.fetchGuarded - the connect goes to the vetted address', () => {
  test('a host whose second lookup answers 127.0.0.1 is still fetched at the first, vetted address', async () => {
    lookupMock.mockResolvedValueOnce(answer('203.0.113.10')).mockResolvedValue(answer('127.0.0.1'));
    const calls: Array<{ url: string; init: RequestInit & { tls?: { serverName?: string } } }> = [];

    globalThis.fetch = (async (input: URL | string, init: RequestInit) => {
      calls.push({ url: String(input), init });

      return new Response('ok');
    }) as unknown as typeof fetch;

    await UrlIngest.fetchGuarded({ url: 'https://hook.example.test/in', policy });

    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://203.0.113.10/in');
    expect((calls[0].init.headers as Record<string, string>).Host).toBe('hook.example.test');
    expect(calls[0].init.tls?.serverName).toBe('hook.example.test');
    expect((calls[0].init as { proxy?: unknown }).proxy).toBe(false);
  });

  test('a host that resolves to an internal address next to a public one is refused, nothing is fetched', async () => {
    lookupMock.mockResolvedValue(answer('203.0.113.10', '127.0.0.1'));
    let fetched = false;

    globalThis.fetch = (async () => {
      fetched = true;

      return new Response('ok');
    }) as unknown as typeof fetch;

    const error = await rejectionOf(
      UrlIngest.fetchGuarded({ url: 'https://hook.example.test/in', policy }),
    );

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect(fetched).toBe(false);
  });

  test('http pins by address and Host, with no TLS server name', async () => {
    lookupMock.mockResolvedValue(answer('203.0.113.10'));
    const calls: Array<{ url: string; init: Record<string, unknown> }> = [];

    globalThis.fetch = (async (input: URL | string, init: Record<string, unknown>) => {
      calls.push({ url: String(input), init });

      return new Response('ok');
    }) as unknown as typeof fetch;

    await UrlIngest.fetchGuarded({ url: 'http://hook.example.test:8080/in?x=1', policy });

    expect(calls[0].url).toBe('http://203.0.113.10:8080/in?x=1');
    expect((calls[0].init.headers as Record<string, string>).Host).toBe('hook.example.test:8080');
    expect(calls[0].init.tls).toBeUndefined();
  });

  test('an IPv6 address is bracketed in the connect url', async () => {
    lookupMock.mockResolvedValue(answer('2606:4700:4700::1111'));
    const urls: string[] = [];

    globalThis.fetch = (async (input: URL | string) => {
      urls.push(String(input));

      return new Response('ok');
    }) as unknown as typeof fetch;

    await UrlIngest.fetchGuarded({ url: 'https://hook.example.test/in', policy });

    expect(urls[0]).toBe('https://[2606:4700:4700::1111]/in');
  });

  test('a Host header from the caller is ignored', async () => {
    lookupMock.mockResolvedValue(answer('203.0.113.10'));
    const seen: Array<Record<string, string>> = [];

    globalThis.fetch = (async (_input: URL | string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);

      return new Response('ok');
    }) as unknown as typeof fetch;

    await UrlIngest.fetchGuarded({
      url: 'https://hook.example.test/in',
      policy,
      headers: { host: 'internal.example.test', 'X-Signature': 'abc' },
    });

    expect(seen[0].Host).toBe('hook.example.test');
    expect(seen[0]['X-Signature']).toBe('abc');
    expect(Object.keys(seen[0]).filter((name) => name.toLowerCase() === 'host')).toEqual(['Host']);
  });

  test('a connect error moves to the next vetted address, the deadline does not', async () => {
    lookupMock.mockResolvedValue(answer('2606:4700:4700::1111', '203.0.113.10'));
    const urls: string[] = [];

    globalThis.fetch = (async (input: URL | string) => {
      urls.push(String(input));

      if (urls.length === 1) {
        throw new TypeError('Unable to connect');
      }

      return new Response('ok');
    }) as unknown as typeof fetch;

    const response = await UrlIngest.fetchGuarded({ url: 'https://hook.example.test/', policy });

    const result = await response.text();
    expect(result).toBe('ok');
    expect(urls).toEqual(['https://[2606:4700:4700::1111]/', 'https://203.0.113.10/']);

    urls.length = 0;
    globalThis.fetch = (async (input: URL | string) => {
      urls.push(String(input));

      throw Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;

    const error = await rejectionOf(
      UrlIngest.fetchGuarded({ url: 'https://hook.example.test/', policy }),
    );

    expect(error.name).toBe('TimeoutError');
    expect(urls).toHaveLength(1);
  });

  test('policy.proxy sends the request through the proxy and does not pin', async () => {
    lookupMock.mockResolvedValue(answer('203.0.113.10'));
    const calls: Array<{ url: string; init: Record<string, unknown> }> = [];

    globalThis.fetch = (async (input: URL | string, init: Record<string, unknown>) => {
      calls.push({ url: String(input), init });

      return new Response('ok');
    }) as unknown as typeof fetch;

    await UrlIngest.fetchGuarded({
      url: 'https://hook.example.test/in',
      policy: { ...policy, proxy: 'http://proxy.example.test:3128' },
    });

    expect(calls[0].url).toBe('https://hook.example.test/in');
    expect(calls[0].init.proxy).toBe('http://proxy.example.test:3128');
  });
});

describe('UrlIngest.fetchGuarded - a POST with headers and a body, over a real socket', () => {
  test('is delivered to the vetted address with its method, headers, body and the original Host', async () => {
    const { server, seen, port } = startServer({ '/in': () => new Response('accepted') });

    try {
      treatLoopbackAsPublic();
      lookupMock.mockResolvedValue(answer('127.0.0.1'));

      const response = await UrlIngest.fetchGuarded({
        url: `http://hook.example.test:${port}/in`,
        policy,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-signature': 'sha256=abc' },
        body: '{"event":"paid"}',
      });

      const result = await response.text();
      expect(result).toBe('accepted');
      expect(seen).toHaveLength(1);
      expect(seen[0].method).toBe('POST');
      expect(seen[0].body).toBe('{"event":"paid"}');
      expect(seen[0].headers['x-signature']).toBe('sha256=abc');
      expect(seen[0].headers['content-type']).toBe('application/json');
      expect(seen[0].headers.host).toBe(`hook.example.test:${port}`);
    } finally {
      await server.stop(true);
    }
  });

  test('bytes are accepted as a body', async () => {
    const { server, seen, port } = startServer({ '/in': () => new Response('ok') });

    try {
      treatLoopbackAsPublic();
      lookupMock.mockResolvedValue(answer('127.0.0.1'));

      await UrlIngest.fetchGuarded({
        url: `http://hook.example.test:${port}/in`,
        policy,
        method: 'PUT',
        body: new TextEncoder().encode('raw bytes'),
      });

      expect(seen[0].method).toBe('PUT');
      expect(seen[0].body).toBe('raw bytes');
    } finally {
      await server.stop(true);
    }
  });

  test('a GET or HEAD with a body is refused before any lookup', async () => {
    const error = await rejectionOf(
      UrlIngest.fetchGuarded({ url: 'https://hook.example.test/', policy, body: 'x' }),
    );

    expect(error.message).toContain('cannot carry a body');
    expect(lookupMock).not.toHaveBeenCalled();
  });
});

describe('UrlIngest.fetchGuarded - redirects are re-vetted, re-pinned and do not leak the request', () => {
  test('a redirect to an internal address is refused', async () => {
    const { server, port } = startServer({
      '/start': () =>
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }),
    });

    try {
      treatLoopbackAsPublic();
      lookupMock.mockResolvedValue(answer('127.0.0.1'));

      const error = await rejectionOf(
        UrlIngest.fetchGuarded({ url: `http://hook.example.test:${port}/start`, policy }),
      );

      expect(UrlPolicy.isRefusedError({ error })).toBe(true);
      expect(error.message).toContain('non-public');
    } finally {
      await server.stop(true);
    }
  });

  test('a redirect to a host that resolves to an internal address is refused on the second lookup', async () => {
    const { server, port } = startServer({
      '/start': () =>
        new Response(null, {
          status: 302,
          headers: { location: `http://rebound.example.test:${port}/final` },
        }),
    });

    try {
      treatLoopbackAsPublic();
      lookupMock.mockImplementation(async (hostname: string) =>
        hostname === 'rebound.example.test' ? answer('10.0.0.5') : answer('127.0.0.1'),
      );

      const error = await rejectionOf(
        UrlIngest.fetchGuarded({ url: `http://hook.example.test:${port}/start`, policy }),
      );

      expect(UrlPolicy.isRefusedError({ error })).toBe(true);
      expect(error.message).toContain('10.0.0.5');
    } finally {
      await server.stop(true);
    }
  });

  test('a 302 on a POST becomes a GET without the body or its headers', async () => {
    const { server, seen, port } = startServer({
      '/start': () => new Response(null, { status: 302, headers: { location: '/final' } }),
      '/final': () => new Response('landed'),
    });

    try {
      treatLoopbackAsPublic();
      lookupMock.mockResolvedValue(answer('127.0.0.1'));

      const response = await UrlIngest.fetchGuarded({
        url: `http://hook.example.test:${port}/start`,
        policy,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-signature': 'sha256=abc' },
        body: '{"event":"paid"}',
      });

      const result = await response.text();
      expect(result).toBe('landed');
      expect(seen[1].method).toBe('GET');
      expect(seen[1].body).toBe('');
      expect(seen[1].headers['content-type']).toBeUndefined();
      expect(seen[1].headers['x-signature']).toBe('sha256=abc');
    } finally {
      await server.stop(true);
    }
  });

  test('a 307 on the same origin repeats the POST with its body', async () => {
    const { server, seen, port } = startServer({
      '/start': () => new Response(null, { status: 307, headers: { location: '/final' } }),
      '/final': () => new Response('landed'),
    });

    try {
      treatLoopbackAsPublic();
      lookupMock.mockResolvedValue(answer('127.0.0.1'));

      await UrlIngest.fetchGuarded({
        url: `http://hook.example.test:${port}/start`,
        policy,
        method: 'POST',
        body: '{"event":"paid"}',
      });

      expect(seen[1].method).toBe('POST');
      expect(seen[1].body).toBe('{"event":"paid"}');
    } finally {
      await server.stop(true);
    }
  });

  test('a 307 with a body to ANOTHER origin is refused, and the other origin is never contacted', async () => {
    const { server, seen, port } = startServer({
      '/start': () =>
        new Response(null, {
          status: 307,
          headers: { location: `http://other.example.test:${port}/final` },
        }),
      '/final': () => new Response('landed'),
    });

    try {
      treatLoopbackAsPublic();
      lookupMock.mockResolvedValue(answer('127.0.0.1'));

      const error = await rejectionOf(
        UrlIngest.fetchGuarded({
          url: `http://hook.example.test:${port}/start`,
          policy,
          method: 'POST',
          body: '{"event":"paid"}',
        }),
      );

      expect(UrlPolicy.isRefusedError({ error })).toBe(true);
      expect(error.message).toContain('another origin');
      expect(seen.map((entry) => new URL(entry.url).pathname)).toEqual(['/start']);
    } finally {
      await server.stop(true);
    }
  });

  test('every caller header but accept, accept-language and user-agent is dropped when a hop changes origin', async () => {
    const { server, seen, port } = startServer({
      '/same': () => new Response(null, { status: 302, headers: { location: '/landed' } }),
      '/cross': () =>
        new Response(null, {
          status: 302,
          headers: { location: `http://other.example.test:${port}/landed` },
        }),
      '/landed': () => new Response('landed'),
    });

    try {
      treatLoopbackAsPublic();
      lookupMock.mockResolvedValue(answer('127.0.0.1'));
      const headers = {
        authorization: 'Bearer secret',
        cookie: 'a=b',
        'x-api-key': 'KEY',
        'X-Webhook-Signature': 'sig',
        accept: 'application/json',
      };

      await UrlIngest.fetchGuarded({
        url: `http://hook.example.test:${port}/same`,
        policy,
        headers,
      });
      await UrlIngest.fetchGuarded({
        url: `http://hook.example.test:${port}/cross`,
        policy,
        headers,
      });

      const sameHop = seen[1];
      const crossHop = seen[3];

      expect(sameHop.headers.authorization).toBe('Bearer secret');
      expect(sameHop.headers['x-api-key']).toBe('KEY');
      expect(crossHop.headers.authorization).toBeUndefined();
      expect(crossHop.headers.cookie).toBeUndefined();
      expect(crossHop.headers['x-api-key']).toBeUndefined();
      expect(crossHop.headers['x-webhook-signature']).toBeUndefined();
      expect(crossHop.headers.accept).toBe('application/json');
      expect(crossHop.headers.host).toBe(`other.example.test:${port}`);
    } finally {
      await server.stop(true);
    }
  });
});

describe('UrlIngest.fetchGuarded - replay, deadline and non-redirect 3xx', () => {
  test('a POST that may have reached the server is not repeated on the next address; a refused connect is', async () => {
    lookupMock.mockResolvedValue(answer('203.0.113.10', '203.0.113.11'));
    const urls: string[] = [];

    globalThis.fetch = (async (input: URL | string) => {
      urls.push(String(input));

      throw Object.assign(new TypeError('The socket connection was closed unexpectedly'), {
        code: 'ECONNRESET',
      });
    }) as unknown as typeof fetch;

    const error = await rejectionOf(
      UrlIngest.fetchGuarded({
        url: 'https://hook.example.test/',
        policy,
        method: 'POST',
        body: 'payment-created',
      }),
    );

    expect((error as { code?: string }).code).toBe('ECONNRESET');
    expect(urls).toEqual(['https://203.0.113.10/']);

    urls.length = 0;
    globalThis.fetch = (async (input: URL | string) => {
      urls.push(String(input));

      if (urls.length === 1) {
        throw Object.assign(new TypeError('Unable to connect'), { code: 'ECONNREFUSED' });
      }

      return new Response('ok');
    }) as unknown as typeof fetch;

    await UrlIngest.fetchGuarded({
      url: 'https://hook.example.test/',
      policy,
      method: 'POST',
      body: 'payment-created',
    });

    expect(urls).toEqual(['https://203.0.113.10/', 'https://203.0.113.11/']);
  });

  test('a GET moves to the next address after a reset', async () => {
    lookupMock.mockResolvedValue(answer('203.0.113.10', '203.0.113.11'));
    const urls: string[] = [];

    globalThis.fetch = (async (input: URL | string) => {
      urls.push(String(input));

      if (urls.length === 1) {
        throw Object.assign(new TypeError('closed'), { code: 'ECONNRESET' });
      }

      return new Response('ok');
    }) as unknown as typeof fetch;

    await UrlIngest.fetchGuarded({ url: 'https://hook.example.test/', policy });

    expect(urls).toHaveLength(2);
  });

  test('the deadline covers the lookup: a resolver slower than the timeout does not outlive it', async () => {
    lookupMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(answer('203.0.113.10')), 600)),
    );
    let fetched = false;

    globalThis.fetch = (async () => {
      fetched = true;

      return new Response('ok');
    }) as unknown as typeof fetch;

    const started = performance.now();
    const error = await rejectionOf(
      UrlIngest.fetchGuarded({
        url: 'https://hook.example.test/',
        policy: { ...policy, timeout: { value: 100, unit: 'millisecond' } },
      }),
    );

    expect(['TimeoutError', 'AbortError']).toContain(error.name);
    expect(performance.now() - started).toBeLessThan(400);
    expect(fetched).toBe(false);
  });

  test('the deadline is one for the whole call, not one per hop', async () => {
    lookupMock.mockResolvedValue(answer('203.0.113.10'));
    let calls = 0;

    globalThis.fetch = (async (_input: URL | string, init: RequestInit) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 70));
      init.signal?.throwIfAborted();

      return new Response(null, { status: 302, headers: { location: '/again' } });
    }) as unknown as typeof fetch;

    const started = performance.now();
    const error = await rejectionOf(
      UrlIngest.fetchGuarded({
        url: 'https://hook.example.test/',
        policy: { ...policy, maxRedirects: 10, timeout: { value: 200, unit: 'millisecond' } },
      }),
    );

    expect(['TimeoutError', 'AbortError']).toContain(error.name);
    expect(calls).toBeLessThan(5);
    expect(performance.now() - started).toBeLessThan(450);
  });

  test('a 304 or a 300 is an answer, not a redirect', async () => {
    lookupMock.mockResolvedValue(answer('203.0.113.10'));
    globalThis.fetch = (async () => new Response(null, { status: 304 })) as unknown as typeof fetch;

    const error = await rejectionOf(
      UrlIngest.fetchGuarded({ url: 'https://hook.example.test/', policy }),
    );

    expect(error.message).toContain('Request failed | status: 304');
    expect(UrlPolicy.isRefusedError({ error })).toBe(false);
  });
});
