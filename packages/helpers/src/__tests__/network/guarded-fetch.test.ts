/** The half `url-safety.test.ts` cannot reach: redirects, the timeout, and the body cap. */

import { afterEach, describe, expect, test } from 'bun:test';
import { UrlIngest } from '@/modules/network/url-safety/ingest';
import { UrlSchemes } from '@/modules/network/url-safety/common/constants';
import { isUrlRefusedError } from '@/modules/network/url-safety/common/errors';

const originalFetch = globalThis.fetch;

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

describe('UrlIngest.fetchGuarded - the redirect walk', () => {
  test('follows a redirect and returns the final response', async () => {
    stubResponses([redirectTo('https://cdn.example.com/final.png'), new Response('bytes')]);

    const response = await UrlIngest.fetchGuarded({
      url: 'https://cdn.example.com/a.png',
      policy: publicPolicy,
    });
    expect(await response.text()).toBe('bytes');
  });

  test('re-checks every hop - a redirect into a private address is refused', async () => {
    stubResponses([redirectTo('http://169.254.169.254/latest/meta-data/'), new Response('secret')]);

    // A literal public address: `lookup` answers it without a network round trip, so this case
    // measures the redirect walk rather than whatever DNS happens to do.
    const message = await captureMessage(
      UrlIngest.fetchGuarded({
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
      UrlIngest.fetchGuarded({
        url: 'https://cdn.example.com/a.png',
        policy: { ...publicPolicy, maxRedirects: 2 },
      }),
    );

    expect(message).toContain('Too many redirects');
  });

  test('refuses a redirect with no location', async () => {
    stubResponses([new Response(null, { status: 302 })]);

    const message = await captureMessage(
      UrlIngest.fetchGuarded({ url: 'https://cdn.example.com/a.png', policy: publicPolicy }),
    );

    expect(message).toContain('no location');
  });

  test('refuses a non-2xx response', async () => {
    stubResponses([new Response('nope', { status: 404 })]);

    const message = await captureMessage(
      UrlIngest.fetchGuarded({ url: 'https://cdn.example.com/a.png', policy: publicPolicy }),
    );

    expect(message).toContain('404');
  });
});

describe('UrlIngest.readCappedBody', () => {
  test('returns a body inside the cap', async () => {
    const body = await UrlIngest.readCappedBody({
      response: new Response('hello'),
      policy: { maxBytes: 1024 },
    });

    expect(body.toString()).toBe('hello');
  });

  test('refuses on a declared content-length over the cap, before reading', async () => {
    const response = new Response('x', { headers: { 'content-length': '999999' } });
    const message = await captureMessage(
      UrlIngest.readCappedBody({ response, policy: { maxBytes: 8 } }),
    );

    expect(message).toContain('declared');
  });

  test('refuses a body that lies about its length and overruns while streaming', async () => {
    // No content-length, so the cap can only be enforced by counting - which is the point.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('0123456789'));
        controller.enqueue(new TextEncoder().encode('0123456789'));
        controller.close();
      },
    });

    const message = await captureMessage(
      UrlIngest.readCappedBody({ response: new Response(stream), policy: { maxBytes: 12 } }),
    );

    expect(message).toContain('received');
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
    const error = await refusedFrom(UrlIngest.fetchGuarded({ url }));
    expect(isUrlRefusedError({ error })).toBe(true);
  });

  test('a redirect into a private address is permanent', async () => {
    stubResponses([redirectTo('http://10.0.0.5/internal')]);

    const error = await refusedFrom(
      UrlIngest.fetchGuarded({
        url: 'https://8.8.8.8/a.png',
        policy: { allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS] },
      }),
    );

    expect(isUrlRefusedError({ error })).toBe(true);
  });

  test('a 5xx is NOT permanent - the caller may retry it', async () => {
    stubResponses([new Response('boom', { status: 503 })]);

    const error = await refusedFrom(
      UrlIngest.fetchGuarded({ url: 'https://cdn.example.com/a.png', policy: publicPolicy }),
    );

    expect(isUrlRefusedError({ error })).toBe(false);
  });
});
