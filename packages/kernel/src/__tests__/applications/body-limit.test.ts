import { BodyLimits } from '@/base/applications/body-limit';
import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class BodyLimitApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'body-limit-app', version: '0.0.0', description: '' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

const BODY_TOO_LARGE_CODE = 'core.request.body_too_large';

/** The default stack as a host installs it, then two routes that read their whole body. */
const buildServer = async (opts: { middlewares?: IApplicationConfigs['middlewares'] }) => {
  const application = new BodyLimitApplication({
    scope: BodyLimitApplication.name,
    config: { path: { base: '/', isStrict: true }, middlewares: opts.middlewares },
  });

  await application['registerDefaultMiddlewares']();

  const server = application.getServer();
  server.post('/echo', async (context) => {
    const text = await context.req.text();

    return context.json({ length: text.length });
  });
  server.post('/upload/file', async (context) => {
    const text = await context.req.text();

    return context.json({ length: text.length });
  });

  return server;
};

const post = (opts: {
  server: Awaited<ReturnType<typeof buildServer>>;
  path: string;
  body: string;
}) =>
  opts.server.request(opts.path, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'content-length': String(opts.body.length) },
    body: opts.body,
  });

/** A ReadableStream body carries no Content-Length, so only the counted stream can refuse it. */
const postChunked = (opts: {
  server: Awaited<ReturnType<typeof buildServer>>;
  path: string;
  body: string;
}) => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(opts.body));
      controller.close();
    },
  });

  return opts.server.request(opts.path, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: stream,
    duplex: 'half',
  } satisfies RequestInit & { duplex: 'half' });
};

const LARGE_BODY = 'x'.repeat(2048);

describe('configs.middlewares.bodyLimit', () => {
  test('unset, a body of the default size still reaches the handler (the default limit is tested below)', async () => {
    const server = await buildServer({});

    const response = await post({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toEqual({ length: LARGE_BODY.length });
  });

  test('a declared length over maxSize is a 413 in the error envelope, with its code', async () => {
    const server = await buildServer({
      middlewares: { bodyLimit: { enable: true, maxSize: 1024 } },
    });

    const response = await post({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    const result = await response.json();
    expect(JSON.stringify(result)).toContain(BODY_TOO_LARGE_CODE);
  });

  test('a chunked body over maxSize is a 413 too', async () => {
    const server = await buildServer({
      middlewares: { bodyLimit: { enable: true, maxSize: 1024 } },
    });

    const response = await postChunked({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    const result = await response.json();
    expect(JSON.stringify(result)).toContain(BODY_TOO_LARGE_CODE);
  });

  test('a body within maxSize reaches the handler intact, chunked or not', async () => {
    const server = await buildServer({
      middlewares: { bodyLimit: { enable: true, maxSize: 4096 } },
    });

    const declared = await post({ server, path: '/echo', body: LARGE_BODY });
    const chunked = await postChunked({ server, path: '/echo', body: LARGE_BODY });

    const result = await declared.json();
    expect(result).toEqual({ length: LARGE_BODY.length });
    const result2 = await chunked.json();
    expect(result2).toEqual({ length: LARGE_BODY.length });
  });

  test('enable: false registers nothing', async () => {
    const server = await buildServer({
      middlewares: { bodyLimit: { enable: false, maxSize: 1024 } },
    });

    const response = await post({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(200);
  });

  test('path scopes the limit to the routes it matches', async () => {
    const server = await buildServer({
      middlewares: { bodyLimit: { enable: true, path: '/upload/*', maxSize: 1024 } },
    });

    const scoped = await post({ server, path: '/upload/file', body: LARGE_BODY });
    const outside = await post({ server, path: '/echo', body: LARGE_BODY });

    expect(scoped.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    expect(outside.status).toBe(200);
  });

  test('an onError of the application answers instead of the envelope', async () => {
    const server = await buildServer({
      middlewares: {
        bodyLimit: {
          enable: true,
          maxSize: 1024,
          onError: (context) =>
            context.json({ custom: true }, HTTP.ResultCodes.RS_4.ContentTooLarge),
        },
      },
    });

    const response = await post({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    const result = await response.json();
    expect(result).toEqual({ custom: true });
  });

  test('a maxSize that is not a non-negative number is refused at boot, naming the key', async () => {
    let refusal: unknown;

    try {
      await buildServer({
        middlewares: { bodyLimit: { enable: true, maxSize: Number('ten') } },
      });
    } catch (error) {
      refusal = error;
    }

    expect(String(refusal)).toContain('configs.middlewares.bodyLimit.maxSize');
  });
});

/** Assigns `configs.middlewares` from one boot hook, the way an application following the wrong doc would. */
class LateBodyLimitApplication extends BodyLimitApplication {
  lateMiddlewares?: IApplicationConfigs['middlewares'];
  lateHook?: 'staticConfigure' | 'preConfigure';

  override staticConfigure(): void {
    if (this.lateHook === 'staticConfigure') {
      this.configs.middlewares = this.lateMiddlewares;
    }
  }

  override preConfigure(): void {
    if (this.lateHook === 'preConfigure') {
      this.configs.middlewares = this.lateMiddlewares;
    }
  }
}

/** The whole boot: the default stack first, then `initialize()` - the order every host runs. */
const bootApplication = async (opts: {
  middlewares?: IApplicationConfigs['middlewares'];
  lateMiddlewares?: IApplicationConfigs['middlewares'];
  lateHook?: 'staticConfigure' | 'preConfigure';
}) => {
  const application = new LateBodyLimitApplication({
    scope: LateBodyLimitApplication.name,
    config: { path: { base: '/', isStrict: true }, middlewares: opts.middlewares },
  });
  application.lateMiddlewares = opts.lateMiddlewares;
  application.lateHook = opts.lateHook;

  await application['registerDefaultMiddlewares']();
  await application.initialize();

  const server = application.getServer();
  server.post('/echo', async (context) => {
    const text = await context.req.text();

    return context.json({ length: text.length });
  });

  return server;
};

const toRefusal = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

describe('configs.middlewares.bodyLimit is read once, before staticConfigure()', () => {
  test('passed through the constructor config, it still answers 413 after the whole boot', async () => {
    const server = await bootApplication({
      middlewares: { bodyLimit: { enable: true, maxSize: 1024 } },
    });

    const response = await post({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  for (const lateHook of ['staticConfigure', 'preConfigure'] as const) {
    test(`set in ${lateHook}(), the boot is refused instead of running with the default`, async () => {
      const refusal = await toRefusal(
        bootApplication({
          lateHook,
          lateMiddlewares: { bodyLimit: { enable: true, maxSize: 1024 } },
        }),
      );

      expect(String(refusal)).toContain('configs.middlewares.bodyLimit');
      expect(String(refusal)).toContain('constructor');
    });
  }

  test('the same values assigned again late are not a change', async () => {
    const refusal = await toRefusal(
      bootApplication({
        middlewares: { bodyLimit: { enable: true, maxSize: 4096 } },
        lateHook: 'staticConfigure',
        lateMiddlewares: { bodyLimit: { enable: true, maxSize: 4096 } },
      }),
    );

    expect(refusal).toBeUndefined();
  });

  test('a maxSize changed in place in staticConfigure() is refused too', async () => {
    const middlewares = { bodyLimit: { enable: true, maxSize: 4096 } };
    const application = new LateBodyLimitApplication({
      scope: LateBodyLimitApplication.name,
      config: { path: { base: '/', isStrict: true }, middlewares },
    });

    application.staticConfigure = () => {
      middlewares.bodyLimit.maxSize = 10;
    };

    await application['registerDefaultMiddlewares']();

    const result = await toRefusal(application.initialize());
    expect(String(result)).toContain('configs.middlewares.bodyLimit');
  });

  test('a disabled limit assigned late installs nothing either way, so the boot goes on', async () => {
    const refusal = await toRefusal(
      bootApplication({
        middlewares: { bodyLimit: { enable: false, maxSize: 1024 } },
        lateHook: 'staticConfigure',
        lateMiddlewares: { bodyLimit: { enable: false, maxSize: 2048 } },
      }),
    );

    expect(refusal).toBeUndefined();
  });

  test('a limit disabled late, where the default was installed, is a change: the boot is refused', async () => {
    const refusal = await toRefusal(
      bootApplication({
        lateHook: 'staticConfigure',
        lateMiddlewares: { bodyLimit: { enable: false, maxSize: 1024 } },
      }),
    );

    expect(String(refusal)).toContain('configs.middlewares.bodyLimit');
    expect(String(refusal)).toContain(`installed maxSize: ${BodyLimits.DEFAULT_MAX_SIZE}`);
  });

  test('without the default stack, nothing was installed, so nothing is compared', async () => {
    const application = new LateBodyLimitApplication({
      scope: LateBodyLimitApplication.name,
      config: { path: { base: '/', isStrict: true } },
    });
    application.lateHook = 'staticConfigure';
    application.lateMiddlewares = { bodyLimit: { enable: true, maxSize: 1024 } };

    const result = await toRefusal(application.initialize());
    expect(result).toBeUndefined();
  });
});

/** The same stack, with routes that declare their own limit: one larger, one smaller. */
const buildRouteServer = async (opts: { middlewares?: IApplicationConfigs['middlewares'] }) => {
  const application = new BodyLimitApplication({
    scope: BodyLimitApplication.name,
    config: { path: { base: '/', isStrict: true }, middlewares: opts.middlewares },
  });

  await application['registerDefaultMiddlewares']();

  const server = application.getServer();

  const read = async (context: import('hono').Context) => {
    const text = await context.req.text();

    return context.json({ length: text.length });
  };

  server.post('/plain', read);
  server.post('/import', BodyLimits.route({ maxSize: BodyLimits.DEFAULT_MAX_SIZE * 2 }), read);
  server.post('/tiny', BodyLimits.route({ maxSize: 16 }), read);

  return server;
};

const DEFAULT = BodyLimits.DEFAULT_MAX_SIZE;

describe('the default body limit: 5 MiB on every route', () => {
  test('the default is 5 MiB', () => {
    expect(DEFAULT).toBe(5 * 1024 * 1024);
  });

  test('a body of exactly the default size reaches the handler', async () => {
    const server = await buildServer({});

    const response = await post({ server, path: '/echo', body: 'x'.repeat(DEFAULT) });

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    const result2 = await response.json();
    expect(result2).toEqual({ length: DEFAULT });
  });

  test('a declared length of one byte over is a 413 in the error envelope, with its code', async () => {
    const server = await buildServer({});

    const response = await post({ server, path: '/echo', body: 'x'.repeat(DEFAULT + 1) });
    const result3 = await response.json();
    const result = result3 as { message?: string; normalized?: { code?: string } };

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    expect(JSON.stringify(result)).toContain(BODY_TOO_LARGE_CODE);
  });

  test('a chunked body over the default is a 413 too: no Content-Length is needed', async () => {
    const server = await buildServer({});

    const response = await postChunked({ server, path: '/echo', body: 'x'.repeat(DEFAULT + 1) });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  test('every route has it, a nested upload path included', async () => {
    const server = await buildServer({});

    const response = await post({ server, path: '/upload/file', body: 'x'.repeat(DEFAULT + 1) });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  test('a configured bodyLimit replaces the default, larger or smaller', async () => {
    const larger = await buildServer({ middlewares: { bodyLimit: { maxSize: DEFAULT * 2 } } });
    const smaller = await buildServer({ middlewares: { bodyLimit: { maxSize: 1024 } } });

    const result4 = await post({ server: larger, path: '/echo', body: 'x'.repeat(DEFAULT + 1) });
    expect(result4.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    const result5 = await post({ server: smaller, path: '/echo', body: LARGE_BODY });
    expect(result5.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  test('enable: false removes the limit', async () => {
    const server = await buildServer({ middlewares: { bodyLimit: { enable: false, maxSize: 1 } } });

    const response = await post({ server, path: '/echo', body: 'x'.repeat(DEFAULT + 1) });

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
  });
});

describe('BodyLimits.route: a route sets its own limit', () => {
  test('a route with a larger limit takes a body the default refuses', async () => {
    const server = await buildRouteServer({});
    const body = 'x'.repeat(DEFAULT + 1);

    const result = await post({ server, path: '/plain', body });
    expect(result.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    const result2 = await post({ server, path: '/import', body });
    expect(result2.status).toBe(HTTP.ResultCodes.RS_2.Ok);
  });

  test('the route limit is a limit: a body over it is a 413, declared or chunked', async () => {
    const server = await buildRouteServer({});
    const body = 'x'.repeat(DEFAULT * 2 + 1);

    const result3 = await post({ server, path: '/import', body });
    expect(result3.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    const result4 = await postChunked({ server, path: '/import', body });
    expect(result4.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  test('a route may set a smaller limit than the default', async () => {
    const server = await buildRouteServer({});

    const result5 = await post({ server, path: '/tiny', body: 'x'.repeat(16) });
    expect(result5.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    const result6 = await post({ server, path: '/tiny', body: 'x'.repeat(17) });
    expect(result6.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  test('the default stands aside for a route limit also over a configured default', async () => {
    const server = await buildRouteServer({ middlewares: { bodyLimit: { maxSize: 1024 } } });

    const result7 = await post({ server, path: '/import', body: 'x'.repeat(DEFAULT) });
    expect(result7.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    const result8 = await post({ server, path: '/plain', body: LARGE_BODY });
    expect(result8.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  test('a maxSize that is not a non-negative number is refused when the route is declared', () => {
    for (const maxSize of [-1, Number.NaN, Number.POSITIVE_INFINITY, '5', undefined]) {
      expect(() => BodyLimits.route({ maxSize: maxSize as never })).toThrow(/maxSize/);
    }
  });
});
