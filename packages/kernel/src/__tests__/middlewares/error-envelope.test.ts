import { BaseAppErrorMiddleware, notFoundHandler } from '@/base/middlewares';
import { z } from '@hono/zod-openapi';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';
import { getError, MessageCode } from '@venizia/ignis-helpers/core';
import { Hono } from 'hono';
// The middleware reads the id from the context; both hosts put it there with this exact middleware,
// and importing it here is also what brings `requestId` into hono's `ContextVariableMap`.
import { requestId } from 'hono/request-id';
import { describe, expect, test } from 'bun:test';

const REQUEST_ID = 'req-kernel-envelope';
const REQUEST_URL = 'http://ignis.internal/orders/x';
const REQUEST_PATH = '/orders/x';
const ORDER_NOT_FOUND_CODE = 'server.sale.order.not_found';

/** The METHOD the middleware called, kept apart from the level it asked for: `logger.error(...)` and `logger.log('error', ...)` are different decisions and one of the assertions below turns on which was taken. */
type TLoggerSink = 'debug' | 'info' | 'warn' | 'error' | 'emerg' | 'log';

interface ILoggedLine {
  sink: TLoggerSink;
  level?: TLogLevel;
  message: string;
  args: Array<AnyType>;
}

/** Records instead of printing: several assertions below are about WHICH sink the middleware chose, which a silenced logger cannot answer. */
class RecordingLogger implements ILogger {
  readonly lines: Array<ILoggedLine> = [];

  private record(opts: ILoggedLine) {
    this.lines.push(opts);
  }

  debug(message: string, ...args: Array<AnyType>): void {
    this.record({ sink: 'debug', message, args });
  }

  info(message: string, ...args: Array<AnyType>): void {
    this.record({ sink: 'info', message, args });
  }

  warn(message: string, ...args: Array<AnyType>): void {
    this.record({ sink: 'warn', message, args });
  }

  error(message: string, ...args: Array<AnyType>): void {
    this.record({ sink: 'error', message, args });
  }

  emerg(message: string, ...args: Array<AnyType>): void {
    this.record({ sink: 'emerg', message, args });
  }

  log(level: TLogLevel, message: string, ...args: Array<AnyType>): void {
    this.record({ sink: 'log', level, message, args });
  }

  for(_methodName: string): ILogger {
    return this;
  }

  /** Every recorded line rendered as one string - what an operator would actually read. */
  rendered(): string {
    return this.lines.map(line => [line.message, ...line.args.map(String)].join(' ')).join('\n');
  }

  linesFrom(opts: { sink: TLoggerSink }): Array<ILoggedLine> {
    return this.lines.filter(line => line.sink === opts.sink);
  }
}

interface IProbedResponse {
  status: number;
  contentType: string | null;
  body: Record<string, AnyType>;
  logger: RecordingLogger;
}

/** Drives a real Hono app through the kernel middleware - the same path a host takes, with only the throw and the env binding varied. */
const probe = async (opts: {
  thrower: () => void;
  env?: Record<string, unknown>;
  middleware?: BaseAppErrorMiddleware;
  logger?: RecordingLogger;
  rootKey?: string;
  path?: string;
}): Promise<IProbedResponse> => {
  const logger = opts.logger ?? new RecordingLogger();
  const middleware =
    opts.middleware ?? new BaseAppErrorMiddleware({ logger, rootKey: opts.rootKey });

  const application = new Hono();
  application.use('*', requestId({ generator: () => REQUEST_ID }));
  application.get(REQUEST_PATH, () => {
    opts.thrower();
    return new Response('unreachable');
  });
  application.onError(middleware.value());
  application.notFound(notFoundHandler({ logger }));

  const url = `http://ignis.internal${opts.path ?? REQUEST_PATH}`;
  const response = await application.request(new Request(url), undefined, opts.env);

  return {
    status: response.status,
    contentType: response.headers.get(HTTP.Headers.CONTENT_TYPE),
    body: (await response.json()) as Record<string, AnyType>,
    logger,
  };
};

const throwIntentional = () => {
  throw getError({
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
    message: 'Order not found',
    messageCode: ORDER_NOT_FOUND_CODE,
    orderId: 'ord-991',
  });
};

const throwUnexpected = () => {
  throw new TypeError('relation "orders" does not exist - SELECT * FROM orders WHERE id = $1');
};

const throwZod = () => {
  const schema = z.object({
    quantity: z.number().refine(n => Number.isInteger(n * 10000), {
      message: 'Must not exceed 4 decimal places',
      params: { code: 'numeric.decimal.too_many_places' },
    }),
  });

  const parsed = schema.safeParse({ quantity: 1.23456 });
  if (parsed.success) {
    throw getError({ message: 'expected the schema to reject this input' });
  }

  throw parsed.error;
};

/**
 * The envelope is KERNEL-owned, and both hosts render it from this one class. `core-worker`'s
 * `error-shape-parity.test.ts` compares the two hosts against EACH OTHER, so a change made here
 * moves both sides at once and passes parity untouched. These are the one-sided pins parity cannot
 * be: the exact body a client parses, asserted whole.
 */
describe('the error envelope - the exact body every IGNIS host returns', () => {
  test('an intentional ApplicationError keeps its status, message and code', async () => {
    const { status, contentType, body } = await probe({ thrower: throwIntentional });

    expect(status).toBe(HTTP.ResultCodes.RS_4.NotFound);
    expect(contentType).toContain(HTTP.HeaderValues.APPLICATION_JSON);
    expect(body).toEqual({
      message: 'Order not found',
      statusCode: HTTP.ResultCodes.RS_4.NotFound,
      normalized: { text: 'Order not found', code: ORDER_NOT_FOUND_CODE, args: {} },
      requestId: REQUEST_ID,
      extra: { orderId: 'ord-991' },
      details: { url: REQUEST_URL, path: REQUEST_PATH },
    });
  });

  test('an unexpected throw is 500, and neither its message nor its stack reaches the client', async () => {
    const { status, body } = await probe({ thrower: throwUnexpected });

    expect(status).toBe(HTTP.ResultCodes.RS_5.InternalServerError);
    expect(body).toEqual({
      message: 'Internal Server Error',
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      normalized: {
        text: 'Internal Server Error',
        code: MessageCode.DEFAULT,
        args: {},
      },
      requestId: REQUEST_ID,
      details: { url: REQUEST_URL, path: REQUEST_PATH },
    });
    expect(JSON.stringify(body)).not.toContain('SELECT');
    expect(JSON.stringify(body)).not.toContain('does not exist');
  });

  test('a ZodError builds its own 422 envelope, and keeps per-field feedback even sanitized', async () => {
    const { status, body } = await probe({ thrower: throwZod });

    expect(status).toBe(HTTP.ResultCodes.RS_4.UnprocessableEntity);
    expect(body).toEqual({
      message: 'Must not exceed 4 decimal places',
      statusCode: HTTP.ResultCodes.RS_4.UnprocessableEntity,
      normalized: {
        text: 'Must not exceed 4 decimal places',
        code: 'numeric.decimal.too_many_places',
        args: {},
      },
      requestId: REQUEST_ID,
      details: {
        url: REQUEST_URL,
        path: REQUEST_PATH,
        // Deliberate: `cause` carries the field-level issues a form needs to render, and survives
        // sanitization because it is the client's own input echoed back, never server internals.
        cause: [
          {
            path: 'quantity',
            message: 'Must not exceed 4 decimal places',
            code: 'custom',
          },
        ],
      },
    });
  });

  test('an unrouted path answers JSON, never Hono text/plain - a UI calls response.json() on it', async () => {
    const { status, contentType, body } = await probe({
      thrower: throwIntentional,
      path: '/orders/nothing-here',
    });

    expect(status).toBe(HTTP.ResultCodes.RS_4.NotFound);
    expect(contentType).toContain(HTTP.HeaderValues.APPLICATION_JSON);
    expect(body).toEqual({
      message: 'URL NOT FOUND',
      statusCode: HTTP.ResultCodes.RS_4.NotFound,
      requestId: REQUEST_ID,
      path: '/orders/nothing-here',
      url: 'http://ignis.internal/orders/nothing-here',
    });
  });

  test('rootKey wraps the whole envelope and changes nothing inside it', async () => {
    const unwrapped = await probe({ thrower: throwIntentional });
    const wrapped = await probe({ thrower: throwIntentional, rootKey: 'error' });

    expect(Object.keys(wrapped.body)).toEqual(['error']);
    expect(wrapped.body.error).toEqual(unwrapped.body);
  });
});

/**
 * The two host reads - the ambient environment name and the error formatter - are the ONLY reason
 * this class could not be browser-pure, so both are seams. A regression that inlined either would
 * pass every shape assertion above while silently disabling `@venizia/ignis`'s subclass.
 */
describe('the environment read is a seam, and it fails closed', () => {
  test('the kernel default resolves no environment at all, and sanitizes because of it', async () => {
    const { body } = await probe({ thrower: throwUnexpected });

    expect(body.message).toBe('Internal Server Error');
    expect(body.details.stack).toBeUndefined();
    expect(body.details.cause).toBeUndefined();
  });

  test('a browser has no environment to be wrong about, so the absence is logged at debug', async () => {
    const { logger } = await probe({ thrower: throwUnexpected });

    expect(logger.linesFrom({ sink: 'debug' }).length).toBe(1);
    expect(logger.linesFrom({ sink: 'debug' })[0].message).toContain('No ambient environment');
    // `logger.error` is the sink the SERVER subclass uses for a misconfigured env. Shouting it on
    // every request in a browser buries the error the reader opened the console for. The thrown
    // error itself still reaches the log, through `logger.log(level, ...)` - a different call.
    expect(logger.linesFrom({ sink: 'error' }).length).toBe(0);
    expect(logger.linesFrom({ sink: 'log' }).map(line => line.level)).toEqual(['error']);
  });

  test('a host that HAS an ambient environment gets the misconfiguration line instead', async () => {
    const logger = new RecordingLogger();
    await probe({
      thrower: throwUnexpected,
      // The `environment` option PRESENT is what says "this host has one" - even when the read comes
      // back undefined. That is the whole distinction, and it is now one option rather than two hooks.
      middleware: new BaseAppErrorMiddleware({ logger, environment: () => undefined }),
      logger,
    });

    expect(logger.linesFrom({ sink: 'debug' }).length).toBe(0);
    expect(logger.linesFrom({ sink: 'error' }).length).toBe(1);
    expect(logger.rendered()).toContain('INVALID ENV IDENTIFIER');
  });

  test('the environment option is honoured - this is how the server restores NODE_ENV', async () => {
    const logger = new RecordingLogger();
    const { body } = await probe({
      thrower: throwUnexpected,
      middleware: new BaseAppErrorMiddleware({ logger, environment: () => 'development' }),
      logger,
    });

    expect(body.message).toContain('relation "orders" does not exist');
    expect(typeof body.details.stack).toBe('string');
  });

  test('the Hono env binding is read first, which is the only env channel a Worker has', async () => {
    const { body } = await probe({ thrower: throwUnexpected, env: { NODE_ENV: 'development' } });

    expect(body.message).toContain('relation "orders" does not exist');
    expect(typeof body.details.stack).toBe('string');
  });

  test('an unrecognized environment name is production, not development', async () => {
    const { body } = await probe({ thrower: throwUnexpected, env: { NODE_ENV: 'staging' } });

    expect(body.message).toBe('Internal Server Error');
    expect(body.details.stack).toBeUndefined();
  });

  test('the log scope comes from new.target, so a subclass logs under its own name', () => {
    class AppErrorMiddleware extends BaseAppErrorMiddleware {}

    expect(new BaseAppErrorMiddleware().scope).toBe(BaseAppErrorMiddleware.name);
    expect(new AppErrorMiddleware().scope).toBe(AppErrorMiddleware.name);
  });
});

/** This is the last-resort handler: anything it throws turns a handled failure into an unhandled one, and over the Worker channel that is silence rather than a 500. */
describe('the handler survives what a throw site can attach to an error', () => {
  const throwWithExtra = (extra: Record<string, unknown>) => () => {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.Conflict,
      message: 'unserializable extra',
      extra,
    });
  };

  /**
   * MEASURED, AND A KNOWN DEFECT rather than the intended behaviour. `extra` reaches the RESPONSE
   * raw, so a value `JSON.stringify` refuses makes `context.json` throw; Hono re-enters `onError`
   * with that TypeError, which classifies as unexpected. The client therefore gets a well-formed
   * sanitized 500 instead of the authored 409 - degraded, never a dead channel or a non-JSON body,
   * which is what these assertions exist to hold. The LOG fragment is unaffected: `renderValue`
   * already guards it.
   *
   * Fixing it means deciding what a non-serializable `extra` should become in the response, which
   * is a public-behaviour choice and not this test's to make. When it is made, this test fails.
   */
  const expectDegradedButWellFormed = (opts: { status: number; body: Record<string, AnyType> }) => {
    expect(opts.status).toBe(HTTP.ResultCodes.RS_5.InternalServerError);
    expect(opts.body.requestId).toBe(REQUEST_ID);
    expect(opts.body.statusCode).toBe(HTTP.ResultCodes.RS_5.InternalServerError);
    expect(typeof opts.body.normalized.code).toBe('string');
  };

  test('a cycle in `extra` renders as [Circular] in the log, never as a throw', async () => {
    const cyclic: Record<string, unknown> = { orderId: 'ord-991' };
    cyclic.self = cyclic;

    const { status, contentType, body, logger } = await probe({ thrower: throwWithExtra(cyclic) });

    expect(logger.rendered()).toContain('[Circular]');
    expect(logger.rendered()).not.toContain('[unrenderable]');
    expect(contentType).toContain(HTTP.HeaderValues.APPLICATION_JSON);
    expectDegradedButWellFormed({ status, body });
  });

  test('a BigInt in `extra` is rendered in the log, not collapsed to the unrenderable marker', async () => {
    const { status, contentType, body, logger } = await probe({
      thrower: throwWithExtra({ rows: 9007199254740993n }),
    });

    expect(logger.rendered()).toContain('9007199254740993');
    expect(logger.rendered()).not.toContain('[unrenderable]');
    expect(contentType).toContain(HTTP.HeaderValues.APPLICATION_JSON);
    expectDegradedButWellFormed({ status, body });
  });

  /** `extra` is whatever a throw site chose to attach, and in a Worker this fragment lands in the browser console. */
  test('a secret-shaped key in `extra` is redacted in the log', async () => {
    const { logger } = await probe({
      thrower: () => {
        throw getError({ message: 'leaky extra', extra: { apiKey: 'sk-live-must-not-appear' } });
      },
    });

    expect(logger.rendered()).toContain('[REDACTED]');
    expect(logger.rendered()).not.toContain('sk-live-must-not-appear');
  });
});

/** The default formatter is the browser-pure one; `@venizia/ignis` swaps in `ErrorPrettier`, which reaches `node:util`. */
describe('the log fragment the pure formatter builds', () => {
  class ExposedMiddleware extends BaseAppErrorMiddleware {
    format(opts: {
      error: unknown;
      messageCode?: string;
      extra?: Record<string, unknown>;
      includeStack?: boolean;
      maxStackFrames?: number;
    }): string {
      return this.formatError(opts);
    }
  }

  test('it names the error, its message and its code, one dash-prefixed line each', () => {
    const rendered = new ExposedMiddleware().format({
      error: new TypeError('boom'),
      messageCode: 'server.core.boom',
      includeStack: false,
    });

    expect(rendered.split('\n')).toEqual([
      '- name: TypeError',
      '- message: boom',
      '- code: server.core.boom',
    ]);
  });

  test('maxStackFrames caps the frames, so an intentional error does not dump its caller chain', () => {
    const error = new TypeError('boom');
    error.stack = ['TypeError: boom', '    at one', '    at two', '    at three'].join('\n');

    const rendered = new ExposedMiddleware().format({ error, maxStackFrames: 2 });
    const frames = rendered.split('\n').filter(line => line.trimStart().startsWith('at '));

    expect(frames).toEqual(['    at one', '    at two']);
  });

  test('a thrown non-Error still renders, because the handler must not care what was thrown', () => {
    const rendered = new ExposedMiddleware().format({ error: { code: 42 } });

    expect(rendered).toBe('- message: {"code":42}');
  });
});
