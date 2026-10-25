import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import { RestApplication } from '@/base/applications/rest';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class CorsApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'cors-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

const ORIGIN = 'https://app.example';
const OTHER_ORIGIN = 'https://other.example';
const BODY = 'x'.repeat(100);

const buildServer = async (opts: { middlewares?: IApplicationConfigs['middlewares'] }) => {
  const application = new CorsApplication({
    scope: CorsApplication.name,
    config: { path: { base: '/', isStrict: true }, middlewares: opts.middlewares },
  });

  await application['registerDefaultMiddlewares']();

  const server = application.getServer();
  server.post('/echo', async (context) =>
    context.json({ length: (await context.req.text()).length }),
  );
  server.get('/boom', () => {
    throw new Error('route failure');
  });

  return server;
};

const WITH_CORS = {
  bodyLimit: { enable: true, maxSize: 10 },
  cors: { enable: true, origin: ORIGIN, exposeHeaders: ['x-request-id'] },
};

const postOverLimit = (opts: {
  server: Awaited<ReturnType<typeof buildServer>>;
  origin?: string;
}) =>
  opts.server.request('/echo', {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'content-length': String(BODY.length),
      ...(opts.origin ? { origin: opts.origin } : {}),
    },
    body: BODY,
  });

describe('configs.middlewares.cors - installed first in the default stack', () => {
  test('a cross-origin request over the body limit gets 413 with Access-Control-Allow-Origin', async () => {
    const server = await buildServer({ middlewares: WITH_CORS });

    const response = await postOverLimit({ server, origin: ORIGIN });

    expect(response.status).toBe(413);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-expose-headers')).toContain('x-request-id');
  });

  test('a route error and an unknown path carry the headers too', async () => {
    const server = await buildServer({ middlewares: WITH_CORS });

    const failure = await server.request('/boom', { headers: { origin: ORIGIN } });
    const missing = await server.request('/nope', { headers: { origin: ORIGIN } });

    expect(failure.status).toBe(500);
    expect(failure.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  test('an origin that is not allowed gets no allow-origin header', async () => {
    const server = await buildServer({ middlewares: WITH_CORS });

    const response = await postOverLimit({ server, origin: OTHER_ORIGIN });

    expect(response.status).toBe(413);
    expect(response.headers.get('access-control-allow-origin')).not.toBe(OTHER_ORIGIN);
  });

  test('a preflight is answered with 204 and the allow headers, and bodyLimit never sees it', async () => {
    const server = await buildServer({ middlewares: WITH_CORS });

    const response = await server.request('/echo', {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  test('with no cors config nothing is installed: the 413 has no allow-origin header', async () => {
    const server = await buildServer({ middlewares: { bodyLimit: WITH_CORS.bodyLimit } });

    const response = await postOverLimit({ server, origin: ORIGIN });

    expect(response.status).toBe(413);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('enable: false installs nothing', async () => {
    const server = await buildServer({
      middlewares: { bodyLimit: WITH_CORS.bodyLimit, cors: { ...WITH_CORS.cors, enable: false } },
    });

    const response = await postOverLimit({ server, origin: ORIGIN });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('path scopes it to a prefix', async () => {
    const server = await buildServer({
      middlewares: { cors: { ...WITH_CORS.cors, path: '/api/*' } },
    });

    const outside = await server.request('/boom', { headers: { origin: ORIGIN } });

    expect(outside.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('a list of origins and a function both work', async () => {
    const list = await buildServer({
      middlewares: { cors: { enable: true, origin: [ORIGIN, OTHER_ORIGIN] } },
    });
    const fn = await buildServer({
      middlewares: {
        cors: { enable: true, origin: (origin: string) => (origin === ORIGIN ? origin : null) },
      },
    });

    expect(
      (await list.request('/boom', { headers: { origin: OTHER_ORIGIN } })).headers.get(
        'access-control-allow-origin',
      ),
    ).toBe(OTHER_ORIGIN);
    expect(
      (await fn.request('/boom', { headers: { origin: ORIGIN } })).headers.get(
        'access-control-allow-origin',
      ),
    ).toBe(ORIGIN);
    expect(
      (await fn.request('/boom', { headers: { origin: OTHER_ORIGIN } })).headers.get(
        'access-control-allow-origin',
      ),
    ).toBeNull();
  });
});

/** The message the boot refusal carries, or an empty string when the application booted. */
const bootFailure = async (middlewares: IApplicationConfigs['middlewares']): Promise<string> => {
  try {
    await buildServer({ middlewares });
  } catch (error) {
    return String((error as Error).message);
  }

  return '';
};

describe('configs.middlewares.cors - validated at boot', () => {
  test("credentials with origin '*' is refused with a message naming both", async () => {
    expect(await bootFailure({ cors: { enable: true, origin: '*', credentials: true } })).toMatch(
      /credentials cannot be combined with origin '\*'/,
    );
  });

  test("credentials with a list that contains '*' is refused too", async () => {
    expect(
      await bootFailure({ cors: { enable: true, origin: [ORIGIN, '*'], credentials: true } }),
    ).toMatch(/credentials/);
  });

  test('a missing or empty origin is refused', async () => {
    expect(await bootFailure({ cors: { enable: true, origin: '' } })).toMatch(/origin is required/);
    expect(await bootFailure({ cors: { enable: true, origin: [] } })).toMatch(/origin is required/);
  });

  test('a wildcard origin without credentials is accepted', async () => {
    const server = await buildServer({ middlewares: { cors: { enable: true, origin: '*' } } });
    const response = await server.request('/boom', { headers: { origin: ORIGIN } });

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
