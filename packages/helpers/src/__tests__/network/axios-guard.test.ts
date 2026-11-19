/**
 * `AxiosFetcher` with a `guard`, over real sockets on loopback. The names never resolve in real DNS: `lookup` is
 * replaced, and the address the guard vets is the only way the request can reach a local server - which is the proof
 * that axios connected where the guard said, and nowhere else (an unpinned axios would fail with ENOTFOUND).
 */

import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

const realDns = { ...(await import('node:dns/promises')) };
const lookupMock = mock(async (_hostname: string, _options?: unknown): Promise<unknown[]> => []);

await mock.module('node:dns/promises', () => ({ lookup: lookupMock }));

const { UrlGuard } = await import('@/modules/network/utilities/url-safety/guard');
const { UrlPolicy } = await import('@/modules/network/utilities/url-safety/policy');
const { AxiosFetcher } = await import('@/modules/network/http-request/fetcher/axios-fetcher');

const answer = (...addresses: string[]) =>
  addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

const startServer = (opts: { hostname: string; port?: number; label: string }) => {
  const seen: Array<{ path: string; host: string | null }> = [];
  const server: ReturnType<typeof Bun.serve> = Bun.serve({
    port: opts.port ?? 0,
    hostname: opts.hostname,
    fetch: (request): Response => {
      const url = new URL(request.url);
      seen.push({ path: url.pathname, host: request.headers.get('host') });

      return url.pathname === '/to-internal'
        ? new Response(null, { status: 302, headers: { location: `http://internal.test:${server.port}/secret` } })
        : new Response(opts.label);
    },
  });

  return { server, seen };
};

const policy = { allowedSchemes: ['http:', 'https:'], maxRedirects: 3 };
const servers: Array<ReturnType<typeof Bun.serve>> = [];

beforeEach(() => {
  lookupMock.mockReset();
  // Loopback stands in for a public address, so a local server can be the vetted target.
  const original = UrlPolicy.isNonPublicAddress.bind(UrlPolicy);

  spyOn(UrlPolicy, 'isNonPublicAddress').mockImplementation((opts) =>
    opts.address === '127.0.0.1' || opts.address === '127.0.0.2' ? false : original(opts),
  );
});

afterEach(async () => {
  mock.restore();

  for (const server of servers.splice(0)) {
    await server.stop(true);
  }
});

afterAll(async () => {
  mock.restore();
  // Later files in this process resolve names for real again.
  await mock.module('node:dns/promises', () => realDns);
});

describe('AxiosFetcher with a guard connects to the vetted address', () => {
  test('a name that resolves nowhere in real DNS is reached through the address the guard vetted', async () => {
    const { server, seen } = startServer({ hostname: '127.0.0.1', label: 'A' });
    servers.push(server);
    lookupMock.mockResolvedValue(answer('127.0.0.1'));

    const response = await new AxiosFetcher({ name: 'pin', guardEngine: UrlGuard }).get({
      url: `http://pinned.invalid:${server.port}/x`,
      guard: policy,
    });

    expect(response.data).toBe('A');
    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ path: '/x', host: `pinned.invalid:${server.port}` }]);
  });

  test('a pin does not leak across calls: the same url goes to the address of ITS lookup, keep-alive or not', async () => {
    const first = startServer({ hostname: '127.0.0.1', label: 'A' });
    const second = startServer({ hostname: '127.0.0.2', port: first.server.port, label: 'B' });
    servers.push(first.server, second.server);
    lookupMock
      .mockResolvedValueOnce(answer('127.0.0.1'))
      .mockResolvedValueOnce(answer('127.0.0.2'))
      .mockResolvedValueOnce(answer('127.0.0.1'));
    const fetcher = new AxiosFetcher({ name: 'leak', guardEngine: UrlGuard });
    const url = `http://rotating.invalid:${first.server.port}/x`;

    const answers: unknown[] = [];

    for (let call = 0; call < 3; call += 1) {
      const response = await fetcher.get({ url, guard: policy });
      answers.push(response.data);
    }

    expect(answers).toEqual(['A', 'B', 'A']);
    expect(lookupMock).toHaveBeenCalledTimes(3);
  });

  test('a host that resolves to a private address is refused, and nothing is sent', async () => {
    const { server, seen } = startServer({ hostname: '127.0.0.1', label: 'A' });
    servers.push(server);
    lookupMock.mockResolvedValue(answer('10.0.0.5'));

    const error = await new AxiosFetcher({ name: 'private', guardEngine: UrlGuard })
      .get({ url: `http://internal.invalid:${server.port}/x`, guard: policy })
      .catch((caught: unknown) => caught);

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect(seen).toHaveLength(0);
  });

  test('a redirect into a host that resolves to a private address is refused on that hop', async () => {
    const { server, seen } = startServer({ hostname: '127.0.0.1', label: 'A' });
    servers.push(server);
    lookupMock.mockImplementation(async (hostname: string) =>
      hostname === 'internal.test' ? answer('10.0.0.5') : answer('127.0.0.1'),
    );

    const error = await new AxiosFetcher({ name: 'hop', guardEngine: UrlGuard })
      .get({ url: `http://public.invalid:${server.port}/to-internal`, guard: policy })
      .catch((caught: unknown) => caught);

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect(seen.map((hit) => hit.path)).toEqual(['/to-internal']);
  });

  test('every retry attempt re-resolves and re-pins', async () => {
    const { server } = startServer({ hostname: '127.0.0.1', label: 'A' });
    servers.push(server);
    lookupMock.mockResolvedValue(answer('127.0.0.1'));
    let calls = 0;
    const flaky = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => {
        calls += 1;

        return calls < 2 ? new Response('no', { status: 503 }) : new Response('yes');
      },
    });
    servers.push(flaky);

    const response = await new AxiosFetcher({ name: 'retry', guardEngine: UrlGuard }).get({
      url: `http://flaky.invalid:${flaky.port}/x`,
      guard: policy,
      retry: { maxAttempts: 2, backoff: { initialDelayMs: 1, maxDelayMs: 2 } },
    });

    expect(response.data).toBe('yes');
    expect(lookupMock).toHaveBeenCalledTimes(2);
  });

  test('a body that cannot be sent twice is not replayed to another origin', async () => {
    const { server } = startServer({ hostname: '127.0.0.1', label: 'A' });
    servers.push(server);
    lookupMock.mockImplementation(async (hostname: string) =>
      hostname === 'internal.test' ? answer('10.0.0.5') : answer('127.0.0.1'),
    );

    const error = await new AxiosFetcher({ name: 'replay', guardEngine: UrlGuard })
      .post({ url: `http://public.invalid:${server.port}/to-internal`, body: { a: 1 }, guard: policy })
      .catch((caught: unknown) => caught);

    // A POST answered 302 becomes a GET without the body, and the hop to the private host is refused by the guard.
    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
  });
});
