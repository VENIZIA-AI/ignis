import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';
import { getError, HTTP, MessageCode } from '@venizia/ignis-helpers';
import { Logger } from '@venizia/ignis-helpers/winston';
import { AppErrorMiddleware, RequestSpyMiddleware } from '@/base/middlewares';

// Real Logger instance (a private constructor forces the factory) with output silenced - the handler logs the thrown error via `.log(level, ...)` and its env diagnostics via `.error`, neither wanted on the console.
const logger = Logger.get('app-error-middleware-test');
logger.error = () => undefined;
logger.log = () => undefined;

/** Reads a Hono Response body as a loosely-typed JSON object (Response.json() is `unknown`). */
const readJson = async (res: Response): Promise<Record<string, any>> => {
  return (await res.json()) as Record<string, any>;
};

/** Mounts a Hono app whose single route runs `thrower()` (which always throws). */
const mount = (opts: { rootKey?: string; thrower: () => void }) => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set(RequestSpyMiddleware.REQUEST_ID_KEY, 'req-test');
    await next();
  });
  app.get('/x', () => {
    opts.thrower();
    return new Response('unreachable');
  });
  app.onError(new AppErrorMiddleware({ logger, rootKey: opts.rootKey }).value());
  return app;
};

/** Builds a thrower that parses `input` with `schema` and throws the resulting ZodError. */
const zodThrower = (schema: z.ZodType, input: unknown) => () => {
  const r = schema.safeParse(input);
  if (r.success) {
    throw new Error('expected validation to fail');
  }
  throw r.error;
};

describe('formatZodError — code/message pass-through from Zod', () => {
  test('custom params.code → code + message come from that issue', async () => {
    const schema = z.object({
      quantity: z.number().refine(n => Number.isInteger(n * 10000), {
        message: 'Must not exceed 4 decimal places',
        params: { code: 'numeric.decimal.too_many_places' },
      }),
    });
    const res = await mount({ thrower: zodThrower(schema, { quantity: 1.23456 }) }).request('/x');
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.normalized.code).toBe('numeric.decimal.too_many_places');
    expect(body.message).toBe('Must not exceed 4 decimal places');
    expect(Array.isArray(body.details.cause)).toBe(true);
  });

  test('first issue WITH a custom code wins, even if a no-code issue precedes it', async () => {
    const schema = z.object({
      vendorId: z.string(), // issues[0]: invalid_type, no custom code
      quantity: z.number().refine(n => Number.isInteger(n * 10000), {
        message: 'Must not exceed 4 decimal places',
        params: { code: 'numeric.decimal.too_many_places' },
      }), // issues[1]: custom code
    });
    const res = await mount({ thrower: zodThrower(schema, { quantity: 1.23456 }) }).request('/x');
    const body = await readJson(res);
    expect(body.normalized.code).toBe('numeric.decimal.too_many_places');
    expect(body.message).toBe('Must not exceed 4 decimal places');
  });

  test('no custom code → falls back to the first issue raw Zod code + its message', async () => {
    const res = await mount({
      thrower: zodThrower(z.object({ vendorId: z.string() }), {}),
    }).request('/x');
    const body = await readJson(res);
    expect(body.normalized.code).toBe('invalid_type');
    expect(typeof body.message).toBe('string');
    expect(body.message).not.toBe('ValidationError');
    expect(Array.isArray(body.details.cause)).toBe(true);
    expect(body.details.cause).toHaveLength(1);
  });

  test('multiple built-in issues → code = the FIRST issue raw code', async () => {
    // a: missing → invalid_type (issues[0]); b: too short → too_small (issues[1])
    const schema = z.object({ a: z.string(), b: z.string().min(5) });
    const res = await mount({ thrower: zodThrower(schema, { b: 'x' }) }).request('/x');
    const body = await readJson(res);
    expect(body.normalized.code).toBe('invalid_type');
    expect(body.details.cause).toHaveLength(2);
  });

  test('malformed (non-JSON) ZodError → default code, message "ValidationError"', async () => {
    const res = await mount({
      thrower: () => {
        const e = new Error('totally not json');
        e.name = 'ZodError';
        throw e;
      },
    }).request('/x');
    const body = await readJson(res);
    expect(body.message).toBe('ValidationError');
    expect(body.normalized.code).toBe(MessageCode.DEFAULT);
  });

  test('non-Zod (domain getError) response is unchanged', async () => {
    const res = await mount({
      thrower: () => {
        throw getError({ message: 'Nope', messageCode: 'domain.nope', statusCode: 400 });
      },
    }).request('/x');
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.message).toBe('Nope');
    expect(body.normalized.code).toBe('domain.nope');
    expect(body.statusCode).toBe(400);
  });

  // Item B only — drop if rootKey support is not wanted.
  test('rootKey wraps the validation response when configured', async () => {
    const schema = z.object({
      quantity: z.number().refine(() => false, { message: 'bad', params: { code: 'x.y' } }),
    });
    const res = await mount({
      rootKey: 'error',
      thrower: zodThrower(schema, { quantity: 1 }),
    }).request('/x');
    const body = await readJson(res);
    expect(body.error.normalized.code).toBe('x.y');
    expect(body.error.message).toBe('bad');
  });
});

describe('isDatabaseClientError — DB constraint errors map to HTTP 400', () => {
  /** Builds a thrower for a fake node-postgres style error. */
  const dbThrower = (opts: {
    code?: string;
    cause?: Record<string, unknown>;
    message?: string;
  }) => {
    return () => {
      const e = new Error(opts.message ?? 'database error') as Error & {
        code?: string;
        cause?: unknown;
      };
      if (opts.code) {
        e.code = opts.code;
      }
      if (opts.cause) {
        e.cause = opts.cause;
      }
      throw e;
    };
  };

  test('listed code (23505 unique_violation) → 400 with its specific message', async () => {
    const res = await mount({ thrower: dbThrower({ code: '23505' }) }).request('/x');
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.message).toContain('Unique constraint violation');
  });

  test('newly added code (22007 invalid_datetime_format) → 400 with its specific message', async () => {
    const res = await mount({ thrower: dbThrower({ code: '22007' }) }).request('/x');
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.message).toContain('Invalid date/time format');
  });

  test('unlisted code in client class 23 → 400 with the fallback message', async () => {
    const res = await mount({ thrower: dbThrower({ code: '23999' }) }).request('/x');
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.message).toContain('Invalid database request');
  });

  test('unlisted code in client class 22 → 400 with the fallback message', async () => {
    const res = await mount({ thrower: dbThrower({ code: '22999' }) }).request('/x');
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.message).toContain('Invalid database request');
  });

  test('programming error (class 42 undefined_column) is NOT a client error → stays 500', async () => {
    const res = await mount({
      thrower: dbThrower({ code: '42703', message: 'column "x" does not exist' }),
    }).request('/x', undefined, { NODE_ENV: 'development' });
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.message).toBe('column "x" does not exist');
  });

  test('non-prod: error.cause.code (driver-wrapped) is detected with detail/table/constraint', async () => {
    const res = await mount({
      thrower: dbThrower({
        cause: {
          code: '23505',
          detail: 'Key (email)=(a@b.com) already exists.',
          table: 'users',
          constraint: 'users_email_key',
        },
      }),
    }).request('/x', undefined, { NODE_ENV: 'development' });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.message).toContain('Unique constraint violation');
    expect(body.message).toContain('Detail:');
    expect(body.message).toContain('Table: users');
    expect(body.message).toContain('Constraint: users_email_key');
  });

  test('error without a SQLSTATE code is NOT a client error → stays 500', async () => {
    const res = await mount({ thrower: dbThrower({ message: 'connection terminated' }) }).request(
      '/x',
      undefined,
      { NODE_ENV: 'development' },
    );
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.message).toBe('connection terminated');
  });

  test('production: client DB error returns only the base message (no detail/table/constraint)', async () => {
    const res = await mount({
      thrower: dbThrower({
        cause: {
          code: '23505',
          detail: 'Key (email)=(a@b.com) already exists.',
          table: 'users',
          constraint: 'users_email_key',
        },
      }),
    }).request('/x', undefined, { NODE_ENV: 'production' });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.message).toBe('Unique constraint violation');
    expect(body.message).not.toContain('Detail:');
    expect(body.message).not.toContain('a@b.com');
    expect(body.message).not.toContain('users');
    expect(body.details.stack).toBeUndefined();
    expect(body.details.cause).toBeUndefined();
  });

  test('production: unexpected DB error (class 42) returns a generic message, not raw SQL', async () => {
    const res = await mount({
      thrower: dbThrower({ code: '42P01', message: 'relation "users" does not exist' }),
    }).request('/x', undefined, { NODE_ENV: 'production' });
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.message).toBe('Internal Server Error');
    expect(body.message).not.toContain('users');
  });

  test('production: connection error message (host/port) is not leaked', async () => {
    const res = await mount({
      thrower: dbThrower({ message: 'connect ECONNREFUSED 10.0.0.5:5432' }),
    }).request('/x', undefined, { NODE_ENV: 'production' });
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.message).toBe('Internal Server Error');
    expect(body.message).not.toContain('10.0.0.5');
  });

  test('production: intentional domain error keeps its authored message', async () => {
    const res = await mount({
      thrower: () => {
        throw getError({
          message: 'Email already in use',
          messageCode: 'user.email.taken',
          statusCode: 409,
        });
      },
    }).request('/x', undefined, { NODE_ENV: 'production' });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.message).toBe('Email already in use');
    expect(body.normalized.code).toBe('user.email.taken');
  });

  test('non-string error code (e.g. gRPC numeric code) does not crash the handler', async () => {
    const res = await mount({
      thrower: () => {
        const e = new Error('grpc failure') as Error & { code?: unknown };
        e.code = 5;
        throw e;
      },
    }).request('/x', undefined, { NODE_ENV: 'development' });
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.message).toBe('grpc failure');
  });

  test('class 44 with_check_option_violation (44000) → 400 (updatable-view data error)', async () => {
    const res = await mount({ thrower: dbThrower({ code: '44000' }) }).request('/x');
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.message).toContain('check option');
  });

  test('class 22 JSON code (22032 invalid_json_text) → 400 with its specific message', async () => {
    const res = await mount({ thrower: dbThrower({ code: '22032' }) }).request('/x');
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.message).toContain('Invalid JSON');
  });

  test('serialization_failure (40001) → 409 Conflict with a retryable messageCode, no raw leak', async () => {
    const res = await mount({
      thrower: dbThrower({
        code: '40001',
        message: 'could not serialize access due to concurrent update',
      }),
    }).request('/x');
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.normalized.code).toBe('database.conflict');
    expect(body.message).toContain('retry');
    expect(body.message).not.toContain('serialize');
  });

  test('deadlock_detected (40P01) → 409 Conflict (retryable)', async () => {
    const res = await mount({ thrower: dbThrower({ code: '40P01' }) }).request('/x');
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.normalized.code).toBe('database.conflict');
  });

  test('production: retryable conflict still returns the safe generic message', async () => {
    const res = await mount({
      thrower: dbThrower({ code: '40001', message: 'could not serialize access' }),
    }).request('/x', undefined, { NODE_ENV: 'production' });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.message).toContain('retry');
    expect(body.message).not.toContain('serialize');
  });

  test('non-retryable class-40 code (40002) is not treated as retryable → stays 500', async () => {
    const res = await mount({ thrower: dbThrower({ code: '40002', message: 'x' }) }).request('/x');
    expect(res.status).toBe(500);
  });
});

describe('AppErrorMiddleware - every response carries a normalized code', () => {
  test('a RAW throw (no ApplicationError) still gets the default code, never an absent field', async () => {
    const res = await mount({
      thrower: () => {
        // A library or a bug throwing a plain Error - the client must still get a mappable code.
        throw new TypeError('cannot read properties of undefined');
      },
    }).request('/x', undefined, { NODE_ENV: 'production' });

    const body = await readJson(res);

    expect(body.normalized.code).toBe(MessageCode.DEFAULT);
    expect(body.normalized.code).toBe('core.system_error');
  });

  test('an error raised through getError WITHOUT a code also carries the default', async () => {
    const res = await mount({
      thrower: () => {
        throw getError({ message: 'domain failure', statusCode: 409 });
      },
    }).request('/x');

    const body = await readJson(res);

    expect(res.status).toBe(409);
    expect(body.normalized.code).toBe(MessageCode.DEFAULT);
  });

  test('an explicit code is passed through untouched', async () => {
    const res = await mount({
      thrower: () => {
        throw getError({ message: 'nope', messageCode: 'core.repository.operation_not_allowed' });
      },
    }).request('/x');

    const body = await readJson(res);

    expect(body.normalized.code).toBe('core.repository.operation_not_allowed');
  });

  test('a retryable DB conflict keeps its own retry code, not the default', async () => {
    const res = await mount({
      thrower: () => {
        const error = new Error('deadlock') as Error & { code?: string };
        error.code = '40P01';
        throw error;
      },
    }).request('/x', undefined, { NODE_ENV: 'production' });

    const body = await readJson(res);

    expect(res.status).toBe(HTTP.ResultCodes.RS_4.Conflict);
    expect(body.normalized.code).toBe('database.conflict');
  });
});

/** Which NODE_ENV values may see an unsanitized error. Fail-closed: the leak is opt-in by an explicit development name, so a typo, an unknown environment or an unset variable stay safe. */
describe('AppErrorMiddleware — the NODE_ENV leak boundary', () => {
  /** A unique-violation carrying the row data, the table and the constraint - all of it internal. */
  const leakyDatabaseThrower = () => {
    const error = new Error('database error') as Error & { cause?: unknown };
    error.cause = {
      code: '23505',
      detail: 'Key (email)=(a@b.com) already exists.',
      table: 'users',
      constraint: 'users_email_key',
    };
    throw error;
  };

  const requestUnder = async (nodeEnv: string) => {
    const res = await mount({ thrower: leakyDatabaseThrower }).request('/x', undefined, {
      NODE_ENV: nodeEnv,
    });
    return readJson(res);
  };

  // `dev` is the abbreviation deployments actually write; it means `development`.
  const DEVELOPMENT_ENVS = ['local', 'debug', 'development', 'dev', 'sit'];

  // Real users reach alpha/beta/uat/staging, so they are production as far as leaking goes.
  const PRODUCTION_ENVS = ['production', 'alpha', 'beta', 'uat', 'staging', 'a-typo', 'test'];

  for (const nodeEnv of DEVELOPMENT_ENVS) {
    test(`${nodeEnv}: an engineer sees the row data, the table and the constraint`, async () => {
      const body = await requestUnder(nodeEnv);

      expect(body.message).toContain('Detail:');
      expect(body.message).toContain('a@b.com');
      expect(body.message).toContain('Table: users');
      expect(body.message).toContain('Constraint: users_email_key');
    });
  }

  for (const nodeEnv of PRODUCTION_ENVS) {
    test(`${nodeEnv}: the response carries the base message and NOTHING internal`, async () => {
      const body = await requestUnder(nodeEnv);

      expect(body.message).toBe('Unique constraint violation');
      expect(body.message).not.toContain('a@b.com');
      expect(body.message).not.toContain('users');
      expect(body.details.stack).toBeUndefined();
      expect(body.details.cause).toBeUndefined();
    });
  }

  test('the env name is matched case-insensitively (DEV, Development)', async () => {
    for (const nodeEnv of ['DEV', 'Development', 'LOCAL']) {
      const body = await requestUnder(nodeEnv);
      expect(body.message).toContain('a@b.com');
    }
  });

  test('NODE_ENV unset entirely: fail closed, sanitized like production', async () => {
    const original = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    try {
      // No context env either - the handler has nothing at all to go on.
      const res = await mount({ thrower: leakyDatabaseThrower }).request('/x', undefined, {});
      const body = await readJson(res);

      expect(body.message).toBe('Unique constraint violation');
      expect(body.message).not.toContain('a@b.com');
    } finally {
      // Assigning an undefined `original` back would write the STRING "undefined" and quietly poison every later test in this process.
      if (original === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = original;
      }
    }
  });
});

/** `normalized` must never become a second way to leak what the handler scrubbed out of `message`. */
describe('AppErrorMiddleware - normalized cannot leak past sanitization', () => {
  const buildApp = (handler: () => never) => {
    const app = new Hono();
    app.onError(
      new AppErrorMiddleware({
        logger: { error: () => {}, log: () => {} } as unknown as Logger,
      }).value(),
    );
    app.get('/', handler);

    return app;
  };

  test('an unexpected raw error in production leaks nothing through normalized', async () => {
    process.env.NODE_ENV = 'production';
    const app = buildApp(() => {
      throw new Error('connection to db-prod-1.internal:5432 refused');
    });

    const body = (await (await app.request('/')).json()) as {
      message: string;
      normalized: { text: string; code: string; args: Record<string, unknown> };
    };

    expect(body.message).not.toContain('db-prod-1.internal');
    expect(body.normalized.text).not.toContain('db-prod-1.internal');
    expect(body.normalized.text).toBe(body.message);
    expect(body.normalized.code).toBe(MessageCode.DEFAULT);
  });

  test('an intentional error keeps the text its transform produced', async () => {
    process.env.NODE_ENV = 'production';
    const app = buildApp(() => {
      throw getError({
        message: 'Only %{available} left.',
        messageCode: 'server.core.stock.low',
        statusCode: 409,
        messageArgs: { available: 2 },
        transform: snapshot => ({
          code: snapshot.message.code,
          args: snapshot.message.args,
          text: 'Chỉ còn 2 vé.',
        }),
      });
    });

    const res = await app.request('/');
    const body = (await res.json()) as {
      message: string;
      normalized: { text: string; args: Record<string, unknown> };
    };

    expect(res.status).toBe(409);
    // The raw text stays on `message`; the client-facing text is the transform's.
    expect(body.message).toBe('Only %{available} left.');
    expect(body.normalized.text).toBe('Chỉ còn 2 vé.');
    expect(body.normalized.args).toEqual({ available: 2 });
  });
});

/** `normalized` is the field clients are told to read, so EVERY branch must emit it - including the early-returning `formatZodError` validation branch clients hit most often. */
describe('AppErrorMiddleware - every branch emits normalized', () => {
  const readNormalized = async (app: Hono, path = '/') => {
    const body = (await (await app.request(path)).json()) as {
      message: string;
      normalized?: { text: string; code: string; args: Record<string, unknown> };
    };

    return body;
  };

  const buildApp = (thrower: () => void) => {
    const app = new Hono();
    app.onError(
      new AppErrorMiddleware({
        logger: { error: () => {}, log: () => {} } as unknown as Logger,
      }).value(),
    );
    app.get('/', () => {
      thrower();
      return new Response('unreachable');
    });

    return app;
  };

  test('a validation error carries normalized', async () => {
    const app = buildApp(() => {
      z.object({ email: z.string().email() }).parse({ email: 'nope' });
    });

    const body = await readNormalized(app);

    expect(body.normalized).toBeDefined();
    expect(body.normalized?.text).toBe(body.message);
    expect(body.normalized?.code).toBe('invalid_format');
    expect(body.normalized?.args).toEqual({});
  });

  test('an unparseable ZodError still carries normalized', async () => {
    const app = buildApp(() => {
      const error = new Error('not json at all');
      error.name = 'ZodError';
      throw error;
    });

    const body = await readNormalized(app);

    expect(body.normalized).toBeDefined();
    expect(body.normalized?.code).toBe(MessageCode.DEFAULT);
  });
});

/** A throw site sets `logLevel` via `getError`; the handler logs at that level, defaulting to `error` when it is absent or malformed. */
describe('AppErrorMiddleware - the thrown error picks its own log level', () => {
  /** A logger that records the level of every `.log(level, ...)` call. */
  const spyLogger = () => {
    const levels: Array<string> = [];
    const recordingLogger = {
      error: () => {},
      log: (level: string) => {
        levels.push(level);
      },
    } as unknown as Logger;

    return { recordingLogger, levels };
  };

  const runWith = async (thrower: () => void) => {
    const { recordingLogger, levels } = spyLogger();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set(RequestSpyMiddleware.REQUEST_ID_KEY, 'req-level');
      await next();
    });
    app.onError(new AppErrorMiddleware({ logger: recordingLogger }).value());
    app.get('/', () => {
      thrower();
      return new Response('unreachable');
    });

    await app.request('/', undefined, { NODE_ENV: 'development' });
    return levels;
  };

  test('an explicit logLevel is honoured', async () => {
    const levels = await runWith(() => {
      throw getError({ message: 'expected', statusCode: 404, logLevel: 'warn' });
    });

    expect(levels).toEqual(['warn']);
  });

  test('an error without a logLevel logs at error', async () => {
    const levels = await runWith(() => {
      throw getError({ message: 'boom', statusCode: 500 });
    });

    expect(levels).toEqual(['error']);
  });

  test('a plain (non-ApplicationError) throw logs at error', async () => {
    const levels = await runWith(() => {
      throw new TypeError('unexpected');
    });

    expect(levels).toEqual(['error']);
  });

  test('a malformed logLevel falls back to error, never crashing the handler', async () => {
    const levels = await runWith(() => {
      const error = new Error('bad level') as Error & { statusCode?: number; logLevel?: unknown };
      error.statusCode = 400;
      error.logLevel = 'screaming';
      throw error;
    });

    expect(levels).toEqual(['error']);
  });
});

/** The thrown error is logged as a bounded summary - a driver failure's SQL, params and stack must not flood the log line, while its root reason still reaches it. */
describe('AppErrorMiddleware - the logged error is summarized, not dumped raw', () => {
  /** Records the interpolated args of every `.log(level, message, ...args)` call. */
  const captureLog = () => {
    const calls: Array<Array<unknown>> = [];
    const capturingLogger = {
      error: () => {},
      log: (_level: string, _message: string, ...args: Array<unknown>) => {
        calls.push(args);
      },
    } as unknown as Logger;

    return { capturingLogger, calls };
  };

  test('a drizzle-style error logs its reason but not the query, params or stack', async () => {
    const { capturingLogger, calls } = captureLog();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set(RequestSpyMiddleware.REQUEST_ID_KEY, 'req-sum');
      await next();
    });
    app.onError(new AppErrorMiddleware({ logger: capturingLogger }).value());
    app.get('/', () => {
      const sql = 'UPDATE "sale"."SaleOrder" SET total = 1 WHERE id = $1';
      const cause = Object.assign(
        new Error('cannot update table "SaleOrder" because it does not have a replica identity'),
        { code: '55000' },
      );
      throw Object.assign(new Error(`Failed query: ${sql}`), {
        query: sql,
        params: ['abc'],
        cause,
      });
    });

    await app.request('/', undefined, { NODE_ENV: 'development' });

    // The formatted block is the last positional arg of the REQUEST ERROR log call.
    const block = calls[0]?.[calls[0].length - 1] as string;

    expect(typeof block).toBe('string');
    // The reason, its code and the driver's hint surface...
    expect(block).toContain('cause: cannot update table "SaleOrder"');
    expect(block).toContain('replica identity');
    expect(block).toContain('code 55000');
    // ...but the query/params noise that flooded the log does not.
    expect(block).not.toContain('params:');
    expect(block).not.toContain('abc');
  });

  test('the header carries the resolved statusCode, and the block the messageCode', async () => {
    const { capturingLogger, calls } = captureLog();
    const app = new Hono();
    app.onError(new AppErrorMiddleware({ logger: capturingLogger }).value());
    app.get('/', () => {
      throw getError({
        message: 'Order not found',
        statusCode: 404,
        messageCode: 'server.sale.order.not_found',
        orderId: 'ord-991',
      });
    });

    await app.request('/', undefined, { NODE_ENV: 'development' });

    // args are [requestId, statusCode, method, url, block].
    const statusCode = calls[0]?.[1];
    const block = calls[0]?.[calls[0].length - 1] as string;

    expect(statusCode).toBe(404);
    expect(block).toContain('code: server.sale.order.not_found');
    expect(block).toContain("orderId: 'ord-991'");
    // An intentional error carries no frames - they would be framework plumbing.
    expect(block).not.toContain('stack:');
  });

  test('an UNEXPECTED failure keeps its frames, so a bug is locatable', async () => {
    const { capturingLogger, calls } = captureLog();
    const app = new Hono();
    app.onError(new AppErrorMiddleware({ logger: capturingLogger }).value());
    app.get('/', () => {
      throw new TypeError('cannot read properties of undefined');
    });

    await app.request('/', undefined, { NODE_ENV: 'development' });

    const block = calls[0]?.[calls[0].length - 1] as string;

    expect(block).toContain('name: TypeError');
    expect(block).toContain('stack:');
    expect(block).toContain(' at ');
  });
});
