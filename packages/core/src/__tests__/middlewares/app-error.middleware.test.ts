import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';
import { getError, Logger } from '@venizia/ignis-helpers';
import { appErrorHandler, RequestSpyMiddleware } from '@/base/middlewares';

// Real Logger instance (private constructor forces the factory) with `error` silenced -
// the handler only needs a working `.error`, not real transport output.
const logger = Logger.get('app-error-middleware-test');
logger.error = () => undefined;

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
  app.onError(appErrorHandler({ logger, rootKey: opts.rootKey }));
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

describe('formatZodError — messageCode/message pass-through from Zod', () => {
  test('custom params.code → messageCode + message come from that issue', async () => {
    const schema = z.object({
      quantity: z.number().refine(n => Number.isInteger(n * 10000), {
        message: 'Must not exceed 4 decimal places',
        params: { code: 'numeric.decimal.too_many_places' },
      }),
    });
    const res = await mount({ thrower: zodThrower(schema, { quantity: 1.23456 }) }).request('/x');
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.messageCode).toBe('numeric.decimal.too_many_places');
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
    expect(body.messageCode).toBe('numeric.decimal.too_many_places');
    expect(body.message).toBe('Must not exceed 4 decimal places');
  });

  test('no custom code → falls back to the first issue raw Zod code + its message', async () => {
    const res = await mount({
      thrower: zodThrower(z.object({ vendorId: z.string() }), {}),
    }).request('/x');
    const body = await readJson(res);
    expect(body.messageCode).toBe('invalid_type');
    expect(typeof body.message).toBe('string');
    expect(body.message).not.toBe('ValidationError');
    expect(Array.isArray(body.details.cause)).toBe(true);
    expect(body.details.cause).toHaveLength(1);
  });

  test('multiple built-in issues → messageCode = the FIRST issue raw code', async () => {
    // a: missing → invalid_type (issues[0]); b: too short → too_small (issues[1])
    const schema = z.object({ a: z.string(), b: z.string().min(5) });
    const res = await mount({ thrower: zodThrower(schema, { b: 'x' }) }).request('/x');
    const body = await readJson(res);
    expect(body.messageCode).toBe('invalid_type');
    expect(body.details.cause).toHaveLength(2);
  });

  test('malformed (non-JSON) ZodError → messageCode omitted, message "ValidationError"', async () => {
    const res = await mount({
      thrower: () => {
        const e = new Error('totally not json');
        e.name = 'ZodError';
        throw e;
      },
    }).request('/x');
    const body = await readJson(res);
    expect(body.message).toBe('ValidationError');
    expect(body.messageCode).toBeUndefined();
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
    expect(body.messageCode).toBe('domain.nope');
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
    expect(body.error.messageCode).toBe('x.y');
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
    }).request('/x');
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
    expect(body.messageCode).toBe('user.email.taken');
  });

  test('non-string error code (e.g. gRPC numeric code) does not crash the handler', async () => {
    const res = await mount({
      thrower: () => {
        const e = new Error('grpc failure') as Error & { code?: unknown };
        e.code = 5;
        throw e;
      },
    }).request('/x');
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
    expect(body.messageCode).toBe('database.conflict');
    expect(body.message).toContain('retry');
    expect(body.message).not.toContain('serialize');
  });

  test('deadlock_detected (40P01) → 409 Conflict (retryable)', async () => {
    const res = await mount({ thrower: dbThrower({ code: '40P01' }) }).request('/x');
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.messageCode).toBe('database.conflict');
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
