import { BaseAppErrorMiddleware } from '@/base/middlewares';
import { getError } from '@venizia/ignis-helpers/core';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, test } from 'bun:test';

/** A typed application error wins over the Postgres error in its `cause`; a Postgres error that is not wrapped in one still maps. */

const UNIQUE = Object.assign(new Error('duplicate key value violates unique constraint'), {
  code: '23505',
});

const answer = async (opts: { thrown: unknown }) => {
  const application = new Hono();

  application.use('*', requestId({ generator: () => 'req-typed' }));
  application.get('/x', () => {
    throw opts.thrown;
  });
  application.onError(new BaseAppErrorMiddleware().value());

  const response = await application.request(new Request('http://ignis.internal/x'), undefined, {
    NODE_ENV: 'production',
  });

  const text = await response.text();

  return {
    status: response.status,
    body: JSON.parse(text) as { message: string; normalized: { code: string } },
  };
};

describe('a typed application error and a Postgres error', () => {
  test('a typed 409 with a unique violation as its cause keeps its status, code and message', async () => {
    const result = await answer({
      thrown: getError({
        message: 'Email already registered',
        statusCode: 409,
        messageCode: 'app.user.email_taken',
        cause: UNIQUE,
      }),
    });

    expect(result.status).toBe(409);
    expect(result.body.message).toBe('Email already registered');
    expect(result.body.normalized.code).toBe('app.user.email_taken');
  });

  test('a typed error with a deadlock as its cause is not turned into the retryable 409', async () => {
    const result = await answer({
      thrown: getError({
        message: 'Order is locked',
        statusCode: 423,
        cause: Object.assign(new Error('deadlock detected'), { code: '40P01' }),
      }),
    });

    expect(result.status).toBe(423);
    expect(result.body.message).toBe('Order is locked');
  });

  test('the other order: a Postgres error that wraps a typed error is still the Postgres answer', async () => {
    const result = await answer({
      thrown: Object.assign(
        new Error('query failed', {
          cause: getError({ message: 'Email already registered', statusCode: 409 }),
        }),
        { code: '23505' },
      ),
    });

    expect(result.status).toBe(400);
    expect(result.body.message).toBe('Unique constraint violation');
  });

  test('a driver error that merely carries a statusCode (http-errors) is still the Postgres answer', async () => {
    const result = await answer({
      thrown: Object.assign(new Error('users_email_key'), UNIQUE, { statusCode: 500 }),
    });

    expect(result.status).toBe(400);
    expect(result.body.message).toBe('Unique constraint violation');
  });

  test('a bare unique violation, and one inside an ORM wrapper, are still a 400', async () => {
    for (const thrown of [UNIQUE, new Error('Failed query', { cause: UNIQUE })]) {
      const result = await answer({ thrown });

      expect(result.status).toBe(400);
      expect(result.body.message).toBe('Unique constraint violation');
    }
  });
});
