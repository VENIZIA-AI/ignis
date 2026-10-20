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
  server.post('/echo', async context =>
    context.json({ length: (await context.req.text()).length }),
  );
  server.post('/upload/file', async context =>
    context.json({ length: (await context.req.text()).length }),
  );

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
  test('unset, a large body reaches the handler: no limit is invented', async () => {
    const server = await buildServer({});

    const response = await post({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ length: LARGE_BODY.length });
  });

  test('a declared length over maxSize is a 413 in the error envelope, with its code', async () => {
    const server = await buildServer({
      middlewares: { bodyLimit: { enable: true, maxSize: 1024 } },
    });

    const response = await post({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    expect(JSON.stringify(await response.json())).toContain(BODY_TOO_LARGE_CODE);
  });

  test('a chunked body over maxSize is a 413 too', async () => {
    const server = await buildServer({
      middlewares: { bodyLimit: { enable: true, maxSize: 1024 } },
    });

    const response = await postChunked({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    expect(JSON.stringify(await response.json())).toContain(BODY_TOO_LARGE_CODE);
  });

  test('a body within maxSize reaches the handler intact, chunked or not', async () => {
    const server = await buildServer({
      middlewares: { bodyLimit: { enable: true, maxSize: 4096 } },
    });

    const declared = await post({ server, path: '/echo', body: LARGE_BODY });
    const chunked = await postChunked({ server, path: '/echo', body: LARGE_BODY });

    expect(await declared.json()).toEqual({ length: LARGE_BODY.length });
    expect(await chunked.json()).toEqual({ length: LARGE_BODY.length });
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
          onError: context => context.json({ custom: true }, HTTP.ResultCodes.RS_4.ContentTooLarge),
        },
      },
    });

    const response = await post({ server, path: '/echo', body: LARGE_BODY });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    expect(await response.json()).toEqual({ custom: true });
  });

  test('a maxSize that is not a non-negative number is refused at boot, naming the key', async () => {
    const refusal = await buildServer({
      middlewares: { bodyLimit: { enable: true, maxSize: Number('ten') } },
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

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
  server.post('/echo', async context =>
    context.json({ length: (await context.req.text()).length }),
  );

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
    test(`set in ${lateHook}(), the boot is refused instead of running unlimited`, async () => {
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

    expect(String(await toRefusal(application.initialize()))).toContain(
      'configs.middlewares.bodyLimit',
    );
  });

  test('a disabled limit assigned late installs nothing either way, so the boot goes on', async () => {
    const refusal = await toRefusal(
      bootApplication({
        lateHook: 'staticConfigure',
        lateMiddlewares: { bodyLimit: { enable: false, maxSize: 1024 } },
      }),
    );

    expect(refusal).toBeUndefined();
  });

  test('without the default stack, nothing was installed, so nothing is compared', async () => {
    const application = new LateBodyLimitApplication({
      scope: LateBodyLimitApplication.name,
      config: { path: { base: '/', isStrict: true } },
    });
    application.lateHook = 'staticConfigure';
    application.lateMiddlewares = { bodyLimit: { enable: true, maxSize: 1024 } };

    expect(await toRefusal(application.initialize())).toBeUndefined();
  });
});
