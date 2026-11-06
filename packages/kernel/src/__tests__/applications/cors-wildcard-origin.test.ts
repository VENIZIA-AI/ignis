import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import { CorsUtility } from '@/base/applications/cors';
import { RestApplication } from '@/base/applications/rest';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class WildcardApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'wildcard-app', version: '0.0.0', description: '' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

const buildServer = async (middlewares: IApplicationConfigs['middlewares']) => {
  const application = new WildcardApplication({
    scope: WildcardApplication.name,
    config: { path: { base: '/', isStrict: true }, middlewares },
  });

  await application['registerDefaultMiddlewares']();

  const server = application.getServer();
  server.get('/ping', (context) => context.json({ ok: true }));

  return server;
};

const allowedOrigin = async (opts: {
  server: Awaited<ReturnType<typeof buildServer>>;
  origin: string;
}) => {
  const response = await opts.server.request('/ping', { headers: { origin: opts.origin } });

  return response.headers.get('access-control-allow-origin');
};

const matches = (pattern: string, origin: string) =>
  CorsUtility.matchOriginPattern({ pattern: CorsUtility.parseOriginPattern({ pattern }), origin });

describe('CorsUtility.matchOriginPattern', () => {
  const PATTERN = 'https://*.example.com';

  test('matches one or more subdomain labels', () => {
    expect(matches(PATTERN, 'https://app.example.com')).toBe(true);
    expect(matches(PATTERN, 'https://a-1.b.example.com')).toBe(true);
  });

  test('the apex domain is not a subdomain', () => {
    expect(matches(PATTERN, 'https://example.com')).toBe(false);
    expect(matches(PATTERN, 'https://.example.com')).toBe(false);
  });

  test('a host that only ends or contains the same text does not match', () => {
    expect(matches(PATTERN, 'https://evilexample.com')).toBe(false);
    expect(matches(PATTERN, 'https://example.com.evil.net')).toBe(false);
    expect(matches(PATTERN, 'https://app.example.com.evil.net')).toBe(false);
    expect(matches(PATTERN, 'https://app.example.com.')).toBe(false);
    expect(matches(PATTERN, 'https://app-example.com')).toBe(false);
    expect(matches(PATTERN, 'https://app.xexample.com')).toBe(false);
  });

  test('a dot in the pattern is a dot, not any character', () => {
    expect(matches(PATTERN, 'https://app.exampleXcom')).toBe(false);
    expect(matches(PATTERN, 'https://appXexample.com')).toBe(false);
  });

  test('userinfo, path, query, fragment, space and empty labels do not match', () => {
    for (const origin of [
      'https://evil.com@app.example.com',
      'https://evil.com:pw@app.example.com',
      'https://app.example.com/',
      'https://evil.com/.example.com',
      'https://evil.com?.example.com',
      'https://evil.com#.example.com',
      'https://evil.com\\.example.com',
      'https://a b.example.com',
      'https://a..example.com',
      'https://-.example.com',
      'https://*.example.com',
    ]) {
      expect(matches(PATTERN, origin)).toBe(false);
    }
  });

  test('the scheme must be equal, and must be present', () => {
    expect(matches(PATTERN, 'http://app.example.com')).toBe(false);
    expect(matches(PATTERN, 'app.example.com')).toBe(false);
    expect(matches(PATTERN, '//app.example.com')).toBe(false);
    expect(matches(PATTERN, 'xhttps://app.example.com')).toBe(false);
    expect(matches('http://*.example.com', 'http://app.example.com')).toBe(true);
  });

  test('a pattern without a port does not match an origin with one', () => {
    expect(matches(PATTERN, 'https://app.example.com:8443')).toBe(false);
    expect(matches(PATTERN, 'https://app.example.com:443')).toBe(false);
  });

  test('a pattern with a port matches that port only', () => {
    const withPort = 'https://*.example.com:8443';

    expect(matches(withPort, 'https://app.example.com:8443')).toBe(true);
    expect(matches(withPort, 'https://app.example.com')).toBe(false);
    expect(matches(withPort, 'https://app.example.com:8444')).toBe(false);
    expect(matches(withPort, 'https://app.example.com:84430')).toBe(false);
    expect(matches(withPort, 'https://app.example.com:08443')).toBe(false);
  });

  test('is case sensitive: a browser sends lower case, anything else fails closed', () => {
    expect(matches(PATTERN, 'https://APP.example.com')).toBe(false);
    expect(matches(PATTERN, 'HTTPS://app.example.com')).toBe(false);
  });
});

describe('CorsUtility.parseOriginPattern', () => {
  test('refuses a wildcard anywhere but the whole leftmost label', () => {
    for (const pattern of [
      'https://*',
      'https://*.com',
      'https://*.*.example.com',
      'https://app.*.example.com',
      'https://app*.example.com',
      'https://*app.example.com',
      'https://*example.com',
      'https://example.*',
      'https://*.example.com:*',
      'https://*.example.com/*',
      '*.example.com',
      '*://*.example.com',
      'https://*.Example.com',
      'https://*.example.com:0',
      'https://*.example.com:70000',
    ]) {
      expect(() => CorsUtility.parseOriginPattern({ pattern })).toThrow(/invalid wildcard/);
    }
  });

  test('isOriginPattern: a bare * is not a pattern, a plain origin is not either', () => {
    expect(CorsUtility.isOriginPattern({ value: '*' })).toBe(false);
    expect(CorsUtility.isOriginPattern({ value: 'https://app.example.com' })).toBe(false);
    expect(CorsUtility.isOriginPattern({ value: 'https://*.example.com' })).toBe(true);
  });
});

describe('configs.middlewares.cors - wildcard origins end to end', () => {
  test('a string pattern echoes the matching origin and nothing else', async () => {
    const server = await buildServer({ cors: { origin: 'https://*.example.com' } });

    const result = await allowedOrigin({ server, origin: 'https://app.example.com' });
    expect(result).toBe('https://app.example.com');
    const result2 = await allowedOrigin({ server, origin: 'https://example.com' });
    expect(result2).toBeNull();
    const result3 = await allowedOrigin({ server, origin: 'https://example.com.evil.net' });
    expect(result3).toBeNull();
    const result4 = await allowedOrigin({ server, origin: 'https://evilexample.com' });
    expect(result4).toBeNull();
    const result5 = await allowedOrigin({ server, origin: 'http://app.example.com' });
    expect(result5).toBeNull();
    const result6 = await allowedOrigin({ server, origin: 'https://app.example.com:8443' });
    expect(result6).toBeNull();
  });

  test('a list mixes plain origins and patterns', async () => {
    const server = await buildServer({
      cors: { origin: ['https://example.com', 'https://*.example.com', 'http://localhost:3000'] },
    });

    const result7 = await allowedOrigin({ server, origin: 'https://example.com' });
    expect(result7).toBe('https://example.com');
    const result8 = await allowedOrigin({ server, origin: 'https://app.example.com' });
    expect(result8).toBe('https://app.example.com');
    const result9 = await allowedOrigin({ server, origin: 'http://localhost:3000' });
    expect(result9).toBe('http://localhost:3000');
    const result10 = await allowedOrigin({ server, origin: 'http://localhost:3001' });
    expect(result10).toBeNull();
    const result11 = await allowedOrigin({ server, origin: 'https://evil.net' });
    expect(result11).toBeNull();
  });

  test("a '*' in a list next to a pattern is a literal entry, as Hono treats it in a list: it allows no origin", async () => {
    const server = await buildServer({ cors: { origin: ['*', 'https://*.example.com'] } });

    expect(await allowedOrigin({ server, origin: 'https://other.net' })).toBeNull();
    expect(await allowedOrigin({ server, origin: 'https://app.example.com' })).toBe(
      'https://app.example.com',
    );
  });

  test('a preflight is answered for a matching origin and is not for another', async () => {
    const server = await buildServer({ cors: { origin: 'https://*.example.com' } });
    const preflight = (origin: string) =>
      server.request('/ping', {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'GET' },
      });

    const allowed = await preflight('https://app.example.com');
    const refused = await preflight('https://example.com.evil.net');

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(allowed.headers.get('vary')).toContain('Origin');
    expect(refused.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('credentials work with a pattern: the matching origin is echoed, never a *', async () => {
    const server = await buildServer({
      cors: { origin: 'https://*.example.com', credentials: true },
    });

    const response = await server.request('/ping', {
      headers: { origin: 'https://app.example.com' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  test('the string, list and function forms without a pattern are untouched', () => {
    const fn = () => null;
    const list = ['https://a.example', 'https://b.example'];

    expect(CorsUtility.resolveOrigin({ origin: 'https://a.example' })).toBe('https://a.example');
    expect(CorsUtility.resolveOrigin({ origin: '*' })).toBe('*');
    expect(CorsUtility.resolveOrigin({ origin: list })).toBe(list);
    expect(CorsUtility.resolveOrigin({ origin: fn })).toBe(fn);
  });

  test("a bare '*' with credentials is refused at boot, alone and inside a list", async () => {
    for (const origin of ['*', ['https://*.example.com', '*']]) {
      let message = '';

      try {
        await buildServer({ cors: { origin, credentials: true } });
      } catch (error) {
        message = String((error as Error).message);
      }

      expect(message).toMatch(/credentials cannot be combined with origin '\*'/);
    }
  });

  test('an invalid pattern is refused at boot, not on the first request', async () => {
    let message = '';

    try {
      await buildServer({ cors: { origin: ['https://ok.example', 'https://*.com'] } });
    } catch (error) {
      message = String((error as Error).message);
    }

    expect(message).toMatch(/invalid wildcard 'https:\/\/\*\.com'/);
  });
});
