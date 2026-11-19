/** The half `url-safety.test.ts` cannot reach: redirects, the timeout, and the body cap. */

import { afterEach, describe, expect, test } from 'bun:test';
import { UrlFetchError } from '@/modules/network/utilities/url-safety/common/errors';
import { UrlGuard } from '@/modules/network/utilities/url-safety/guard';
import { createFetchGuarded } from './fixtures/guarded';
import { UrlSchemes } from '@/modules/network/utilities/url-safety/common/constants';
import { UrlPolicy } from '@/modules/network/utilities/url-safety/policy';

const originalFetch = globalThis.fetch;
const fetchGuarded = createFetchGuarded({ engine: UrlGuard });

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Only public hosts resolve here, so DNS never decides these cases - the redirect walk does. */
const publicPolicy = {
  allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS],
  allowPrivateAddress: true,
};

const captureMessage = async (task: Promise<unknown>): Promise<string> => {
  try {
    await task;

    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

const stubResponses = (responses: Response[]): { calls: string[] } => {
  const calls: string[] = [];
  let index = 0;

  globalThis.fetch = (async (input: any) => {
    calls.push(String(input));

    return responses[Math.min(index++, responses.length - 1)];
  }) as typeof fetch;

  return { calls };
};

const redirectTo = (location: string): Response =>
  new Response(null, { status: 302, headers: { location } });

describe('NativeFetcher with a guard - the redirect walk', () => {
  test('follows a redirect and returns the final response', async () => {
    stubResponses([redirectTo('https://cdn.example.com/final.png'), new Response('bytes')]);

    const response = await fetchGuarded({
      url: 'https://cdn.example.com/a.png',
      policy: publicPolicy,
    });
    const result = await response.text();
    expect(result).toBe('bytes');
  });

  test('re-checks every hop - a redirect into a private address is refused', async () => {
    stubResponses([redirectTo('http://169.254.169.254/latest/meta-data/'), new Response('secret')]);

    // A literal public address: `lookup` answers it without a network round trip, so this case
    // measures the redirect walk rather than whatever DNS happens to do.
    const message = await captureMessage(
      fetchGuarded({
        url: 'https://8.8.8.8/a.png',
        // Private addresses NOT allowed: this is the case the guard exists for.
        policy: { allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS] },
      }),
    );

    expect(message).toContain('non-public');
  });

  test('refuses a redirect chain longer than the cap', async () => {
    stubResponses([redirectTo('https://cdn.example.com/next.png')]);

    const message = await captureMessage(
      fetchGuarded({
        url: 'https://cdn.example.com/a.png',
        policy: { ...publicPolicy, maxRedirects: 2 },
      }),
    );

    expect(message).toContain('Too many redirects');
  });

  test('refuses a redirect with no location', async () => {
    stubResponses([new Response(null, { status: 302 })]);

    const message = await captureMessage(
      fetchGuarded({ url: 'https://cdn.example.com/a.png', policy: publicPolicy }),
    );

    expect(message).toContain('no location');
  });

  test('refuses a non-2xx response', async () => {
    stubResponses([new Response('nope', { status: 404 })]);

    const message = await captureMessage(
      fetchGuarded({ url: 'https://cdn.example.com/a.png', policy: publicPolicy }),
    );

    expect(message).toContain('404');
  });
});

describe('isUrlRefusedError - permanent versus worth retrying', () => {
  const refusedFrom = async (task: Promise<unknown>): Promise<unknown> => {
    try {
      await task;

      return undefined;
    } catch (error) {
      return error;
    }
  };

  test.each([
    ['a disallowed scheme', 'file:///etc/passwd'],
    ['a non-public literal', 'https://169.254.169.254/latest'],
    ['a malformed url', 'not a url'],
  ])('%s is permanent', async (_label, url) => {
    const error = await refusedFrom(fetchGuarded({ url }));
    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
  });

  test('a redirect into a private address is permanent', async () => {
    stubResponses([redirectTo('http://10.0.0.5/internal')]);

    const error = await refusedFrom(
      fetchGuarded({
        url: 'https://8.8.8.8/a.png',
        policy: { allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS] },
      }),
    );

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
  });

  test('a 5xx is NOT permanent - the caller may retry it', async () => {
    stubResponses([new Response('boom', { status: 503 })]);

    const error = await refusedFrom(
      fetchGuarded({ url: 'https://cdn.example.com/a.png', policy: publicPolicy }),
    );

    expect(UrlPolicy.isRefusedError({ error })).toBe(false);
  });
});

const rejectionOf = async (task: Promise<unknown>): Promise<unknown> => {
  try {
    await task;
  } catch (error) {
    return error;
  }

  throw new Error('Expected the call to reject, but it resolved');
};

describe('NativeFetcher with a guard - a typed error for an answer it does not return', () => {
  test('a non-ok answer is a UrlFetchError with the upstream status, the url and the response', async () => {
    stubResponses([new Response('nope', { status: 503, headers: { 'retry-after': '7' } })]);

    const error = await rejectionOf(
      fetchGuarded({ url: 'https://cdn.example.com/a.png', policy: publicPolicy }),
    );

    expect(UrlFetchError.is(error)).toBe(true);
    const typed = error as UrlFetchError;
    expect(typed.status).toBe(503);
    expect(typed.url).toBe('https://cdn.example.com/a.png');
    expect(typed.response?.headers.get('retry-after')).toBe('7');
    expect(typed.message).toContain('Request failed | status: 503');
    // Our own answer stays what it was, and a 5xx is still worth a retry.
    expect(typed.statusCode).toBe(400);
    expect(UrlPolicy.isRefusedError({ error })).toBe(false);
  });

  test('maxRedirects: 0 returns the 3xx as a typed error with its status and location', async () => {
    const { calls } = stubResponses([redirectTo('https://cdn.example.com/moved.png')]);

    const result = await rejectionOf(
      fetchGuarded({
        url: 'https://cdn.example.com/a.png',
        policy: { ...publicPolicy, maxRedirects: 0 },
      }),
    );
    const error = result as UrlFetchError;

    expect(UrlFetchError.is(error)).toBe(true);
    expect(error.status).toBe(302);
    expect(error.location).toBe('https://cdn.example.com/moved.png');
    expect(error.message).not.toContain('Too many redirects');
    expect(calls).toHaveLength(1);
  });

  test('maxRedirects: 0 keeps a relative location as sent, and a 3xx without one is typed too', async () => {
    stubResponses([new Response(null, { status: 301, headers: { location: '/moved' } })]);
    const result2 = await rejectionOf(
      fetchGuarded({
        url: 'https://cdn.example.com/a.png',
        policy: { ...publicPolicy, maxRedirects: 0 },
      }),
    );
    const relative = result2 as UrlFetchError;

    expect(relative.status).toBe(301);
    expect(relative.location).toBe('/moved');

    stubResponses([new Response(null, { status: 302 })]);
    const result3 = await rejectionOf(
      fetchGuarded({
        url: 'https://cdn.example.com/a.png',
        policy: { ...publicPolicy, maxRedirects: 0 },
      }),
    );
    const missing = result3 as UrlFetchError;

    expect(UrlFetchError.is(missing)).toBe(true);
    expect(missing.location).toBeUndefined();
  });

  test('a Location that is not a url is a typed error, never a bare TypeError', async () => {
    stubResponses([redirectTo('http://[bad')]);

    const error = await rejectionOf(
      fetchGuarded({ url: 'https://cdn.example.com/a.png', policy: publicPolicy }),
    );

    expect(error).not.toBeInstanceOf(TypeError);
    expect(UrlFetchError.is(error)).toBe(true);
    expect((error as UrlFetchError).status).toBe(302);
    expect((error as UrlFetchError).location).toBe('http://[bad');
  });

  test('a positive budget that runs out is still the refusal it was', async () => {
    stubResponses([redirectTo('https://cdn.example.com/next.png')]);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'https://cdn.example.com/a.png',
        policy: { ...publicPolicy, maxRedirects: 1 },
      }),
    );

    expect(UrlFetchError.is(error)).toBe(false);
    expect((error as Error).message).toContain('Too many redirects');
    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
  });
});

describe('NativeFetcher with a guard - the caller signal', () => {
  const neverAnswering = () => {
    globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;

        if (signal.aborted) {
          reject(signal.reason);

          return;
        }

        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })) as typeof fetch;
  };

  test('a caller abort rejects with the caller reason, not a timeout', async () => {
    neverAnswering();
    const controller = new AbortController();
    const reason = new Error('user cancelled');

    const pending = rejectionOf(
      fetchGuarded({
        url: 'https://cdn.example.com/a.png',
        policy: publicPolicy,
        signal: controller.signal,
      }),
    );
    controller.abort(reason);

    const result = await pending;
    expect(result).toBe(reason);
  });

  test('a caller abort with the default reason is an AbortError', async () => {
    neverAnswering();
    const controller = new AbortController();

    const pending = rejectionOf(
      fetchGuarded({
        url: 'https://cdn.example.com/a.png',
        policy: publicPolicy,
        signal: controller.signal,
      }),
    );
    controller.abort();

    const result2 = await pending;
    expect((result2 as Error).name).toBe('AbortError');
  });

  test('the internal timeout is still a TimeoutError, apart from the caller abort', async () => {
    neverAnswering();
    const controller = new AbortController();

    const error = await rejectionOf(
      fetchGuarded({
        url: 'https://cdn.example.com/a.png',
        policy: { ...publicPolicy, timeout: { value: 20, unit: 'millisecond' } as never },
        signal: controller.signal,
      }),
    );

    expect((error as Error).name).toBe('TimeoutError');
    expect(controller.signal.aborted).toBe(false);
  });

  test('an already aborted signal rejects before anything is fetched', async () => {
    const { calls } = stubResponses([new Response('bytes')]);
    const controller = new AbortController();
    const reason = new Error('too late');
    controller.abort(reason);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'https://8.8.8.8/a.png',
        policy: { allowedSchemes: [UrlSchemes.HTTPS] },
        signal: controller.signal,
      }),
    );

    expect(error).toBe(reason);
    expect(calls).toHaveLength(0);
  });
});

describe('NativeFetcher with a guard - trusted origins', () => {
  const trusted = (...origins: string[]) => ({
    allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS],
    hosts: { trusted: origins as never },
  });

  test('a trusted private origin is reached, and its answer returned, whatever allowedSchemes says', async () => {
    const { calls } = stubResponses([new Response('secret-key')]);

    const response = await fetchGuarded({
      url: 'http://10.0.0.5:8080/v1/key',
      policy: { hosts: { trusted: ['http://10.0.0.5:8080'] } },
    });

    const result = await response.text();
    expect(result).toBe('secret-key');
    expect(calls).toHaveLength(1);
  });

  test('a redirect from a trusted origin to another trusted one is followed', async () => {
    stubResponses([redirectTo('http://10.0.0.6:9000/k'), new Response('ok')]);

    const response = await fetchGuarded({
      url: 'http://10.0.0.5:8080/v1/key',
      policy: trusted('http://10.0.0.5:8080', 'http://10.0.0.6:9000'),
    });

    const result2 = await response.text();
    expect(result2).toBe('ok');
  });

  test('a redirect from a trusted origin to an untrusted private one is refused on that hop', async () => {
    const { calls } = stubResponses([redirectTo('http://10.9.9.9/k'), new Response('leak')]);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'http://10.0.0.5:8080/v1/key',
        policy: trusted('http://10.0.0.5:8080'),
      }),
    );

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect((error as Error).message).toContain('non-public');
    expect(calls).toHaveLength(1);
  });

  test('a redirect from a trusted origin to the metadata address is refused', async () => {
    stubResponses([redirectTo('http://169.254.169.254/latest/meta-data/'), new Response('leak')]);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'http://10.0.0.5:8080/v1/key',
        policy: trusted('http://10.0.0.5:8080'),
      }),
    );

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
  });

  test('trust is not entered through an untrusted hop: a public url cannot redirect into a trusted private origin', async () => {
    const { calls } = stubResponses([redirectTo('http://10.0.0.5:8080/k'), new Response('leak')]);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'https://8.8.8.8/a',
        policy: trusted('http://10.0.0.5:8080'),
      }),
    );

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect((error as Error).message).toContain('non-public');
    expect(calls).toHaveLength(1);
  });

  test('a public url cannot redirect into a trusted metadata literal either', async () => {
    const { calls } = stubResponses([
      redirectTo('http://169.254.169.254/latest/meta-data/'),
      new Response('leak'),
    ]);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'https://8.8.8.8/a',
        policy: trusted('http://169.254.169.254'),
      }),
    );

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test('once a hop is untrusted, a later trusted origin is refused too (trusted -> public -> trusted)', async () => {
    const { calls } = stubResponses([
      redirectTo('https://8.8.8.8/b'),
      redirectTo('http://10.0.0.5:8080/k'),
      new Response('leak'),
    ]);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'http://10.0.0.6:9000/a',
        policy: trusted('http://10.0.0.6:9000', 'http://10.0.0.5:8080'),
      }),
    );

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test('a chain that stays trusted is followed all the way (trusted -> trusted -> trusted)', async () => {
    stubResponses([
      redirectTo('http://10.0.0.6:9000/b'),
      redirectTo('http://10.0.0.7:9001/c'),
      new Response('ok'),
    ]);

    const response = await fetchGuarded({
      url: 'http://10.0.0.5:8080/a',
      policy: trusted('http://10.0.0.5:8080', 'http://10.0.0.6:9000', 'http://10.0.0.7:9001'),
    });

    const result3 = await response.text();
    expect(result3).toBe('ok');
  });

  test('strict refuses a public origin that is not trusted, before any request', async () => {
    const { calls } = stubResponses([new Response('bytes')]);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'https://8.8.8.8/a',
        policy: { hosts: { trusted: ['http://10.0.0.5:8080'], strict: true } },
      }),
    );

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect((error as Error).message).toContain('not trusted');
    expect(calls).toHaveLength(0);
  });

  test('strict also judges every redirect hop', async () => {
    stubResponses([redirectTo('https://8.8.8.8/elsewhere'), new Response('leak')]);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'http://10.0.0.5:8080/v1/key',
        policy: { hosts: { trusted: ['http://10.0.0.5:8080'], strict: true } },
      }),
    );

    expect((error as Error).message).toContain('not trusted');
  });

  test('an invalid entry is a configuration error before any request', async () => {
    const { calls } = stubResponses([new Response('bytes')]);

    const error = await rejectionOf(
      fetchGuarded({
        url: 'https://8.8.8.8/a',
        policy: { hosts: { trusted: ['https://8.8.8.8/'] } },
      }),
    );

    expect((error as Error).message).toContain(' holds ');
    expect(calls).toHaveLength(0);
  });

  test('a leftover allowedHosts is refused, naming the replacement', async () => {
    const error = await rejectionOf(
      fetchGuarded({
        url: 'https://8.8.8.8/a',
        policy: { allowedHosts: ['8.8.8.8'] } as never,
      }),
    );

    expect((error as Error).message).toContain('allowedHosts was removed');
  });
});
