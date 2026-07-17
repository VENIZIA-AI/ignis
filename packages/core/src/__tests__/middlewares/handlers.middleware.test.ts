import {
  AppErrorMiddleware,
  emojiFavicon,
  notFoundHandler,
  RequestSpyMiddleware,
} from '@/base/middlewares';
import { getError, HTTP, Logger } from '@venizia/ignis-helpers';
import { Hono } from 'hono';
import { afterEach, describe, expect, test } from 'bun:test';

const logger = Logger.get('handlers-middleware-test');
logger.error = () => undefined;
logger.info = () => undefined;

const readJson = async (response: Response): Promise<Record<string, any>> => {
  return (await response.json()) as Record<string, any>;
};

describe('notFoundHandler', () => {
  test('unmatched route returns a 404 envelope carrying the request id', async () => {
    const application = new Hono();
    application.use('*', async (context, next) => {
      context.set(RequestSpyMiddleware.REQUEST_ID_KEY, 'req-404');
      await next();
    });
    application.notFound(notFoundHandler({ logger }));

    const response = await application.request('/nowhere');
    expect(response.status).toBe(HTTP.ResultCodes.RS_4.NotFound);

    const body = await readJson(response);
    expect(body.message).toBe('URL NOT FOUND');
    expect(body.statusCode).toBe(HTTP.ResultCodes.RS_4.NotFound);
    expect(body.requestId).toBe('req-404');
    expect(body.path).toBe('/nowhere');
  });
});

describe('emojiFavicon', () => {
  test('/favicon.ico is served as an SVG carrying the configured icon', async () => {
    const application = new Hono();
    application.use(emojiFavicon({ icon: '🔥' }));
    application.get('/favicon.ico', context => context.text('should not be reached'));

    const response = await application.request('/favicon.ico');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(await response.text()).toContain('🔥');
  });

  test('every other path falls through to the next handler', async () => {
    const application = new Hono();
    application.use(emojiFavicon({ icon: '🔥' }));
    application.get('/ping', context => context.text('pong'));

    const response = await application.request('/ping');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pong');
  });
});

describe('AppErrorMiddleware - internal detail must never leak outside a development env', () => {
  const RAW_MESSAGE =
    'connect ECONNREFUSED 10.0.0.7:5432 - select "password" from "users" where "id" = $1';

  const mountRaw = () => {
    const application = new Hono();
    application.use('*', async (context, next) => {
      context.set(RequestSpyMiddleware.REQUEST_ID_KEY, 'req-leak');
      await next();
    });
    application.get('/x', () => {
      // A raw driver failure carries no statusCode - exactly the error the handler must sanitize.
      throw new Error(RAW_MESSAGE);
    });
    application.onError(new AppErrorMiddleware({ logger }).value());
    return application;
  };

  const readBody = async (opts: { env?: Record<string, string> }) => {
    const response = await mountRaw().request('/x', undefined, opts.env);
    return { response, body: await readJson(response) };
  };

  test.each(['production', 'PRODUCTION', 'staging', 'uat', 'beta', 'weird-custom-env'])(
    'env "%s" is NOT a development env: raw message, stack and cause are all withheld',
    async (env: string) => {
      const { response, body } = await readBody({ env: { NODE_ENV: env } });

      expect(response.status).toBe(HTTP.ResultCodes.RS_5.InternalServerError);
      expect(body.message).toBe('Internal Server Error');
      expect(body.message).not.toContain('ECONNREFUSED');
      expect(body.message).not.toContain('password');
      expect(body.details.stack).toBeUndefined();
      expect(body.details.cause).toBeUndefined();
    },
  );

  test('an UNSET environment fails closed (treated as production), it does not leak', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    try {
      const { response, body } = await readBody({});

      expect(response.status).toBe(HTTP.ResultCodes.RS_5.InternalServerError);
      expect(body.message).toBe('Internal Server Error');
      expect(body.details.stack).toBeUndefined();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      }
    }
  });

  test.each(['development', 'local', 'debug', 'sit'])(
    'env "%s" IS a development env: the raw message and stack are surfaced for debugging',
    async (env: string) => {
      const { body } = await readBody({ env: { NODE_ENV: env } });

      expect(body.message).toBe(RAW_MESSAGE);
      expect(body.details.stack).toBeDefined();
    },
  );
});

describe('AppErrorMiddleware - intentional ApplicationError identity', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    }
  });

  const mount = (opts: { thrower: () => void; rootKey?: string }) => {
    const application = new Hono();
    application.use('*', async (context, next) => {
      context.set(RequestSpyMiddleware.REQUEST_ID_KEY, 'req-app-error');
      await next();
    });
    application.get('/x', () => {
      opts.thrower();
      return new Response('unreachable');
    });
    application.onError(new AppErrorMiddleware({ logger, rootKey: opts.rootKey }).value());
    return application;
  };

  test('statusCode, messageCode, message and extra all survive to the response', async () => {
    const application = mount({
      thrower: () => {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.NotFound,
          messageCode: 'user.not-found',
          message: 'User not found',
          extra: { userId: 42 },
        });
      },
    });

    const response = await application.request('/x');
    expect(response.status).toBe(HTTP.ResultCodes.RS_4.NotFound);

    const body = await readJson(response);
    expect(body.statusCode).toBe(HTTP.ResultCodes.RS_4.NotFound);
    expect(body.normalized.code).toBe('user.not-found');
    expect(body.message).toBe('User not found');
    expect(body.extra).toEqual({ userId: 42 });
    expect(body.requestId).toBe('req-app-error');
  });

  test('production keeps the authored identity but drops stack and cause', async () => {
    process.env.NODE_ENV = 'production';

    const application = mount({
      thrower: () => {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.Forbidden,
          messageCode: 'auth.forbidden',
          message: 'Forbidden',
        });
      },
    });

    const response = await application.request('/x');
    expect(response.status).toBe(HTTP.ResultCodes.RS_4.Forbidden);

    const body = await readJson(response);
    expect(body.normalized.code).toBe('auth.forbidden');
    expect(body.message).toBe('Forbidden');
    expect(body.details.stack).toBeUndefined();
    expect(body.details.cause).toBeUndefined();
  });

  test('rootKey (as BANA configures it) wraps the whole envelope', async () => {
    const application = mount({
      rootKey: 'error',
      thrower: () => {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          messageCode: 'bad.request',
          message: 'Bad request',
        });
      },
    });

    const response = await application.request('/x');
    const body = await readJson(response);

    expect(body.error.normalized.code).toBe('bad.request');
    expect(body.error.statusCode).toBe(HTTP.ResultCodes.RS_4.BadRequest);
  });
});
