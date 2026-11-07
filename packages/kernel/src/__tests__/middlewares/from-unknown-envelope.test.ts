import { BaseAppErrorMiddleware, notFoundHandler } from '@/base/middlewares';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';
import { ApplicationError, getError } from '@venizia/ignis-helpers/core';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, test } from 'bun:test';

/**
 * `ApplicationError.fromUnknown` through the real error middleware: a value that carries a valid HTTP status keeps it and its
 * message; anything else is answered as an UNEXPECTED error, a generic message to the client in production, the real one in the
 * log only. A driver or engine error carries SQL, paths and hosts: wrapping it must never put them in a response.
 */

const SQL_MESSAGE =
  'relation "orders" does not exist - SELECT * FROM orders WHERE id = $1 on db-7.internal:5432';

class RecordingLogger implements ILogger {
  readonly text: Array<string> = [];

  private record(message: string, args: Array<AnyType>): void {
    this.text.push([message, ...args.map(String)].join(' '));
  }

  debug(message: string, ...args: Array<AnyType>): void {
    this.record(message, args);
  }

  info(message: string, ...args: Array<AnyType>): void {
    this.record(message, args);
  }

  warn(message: string, ...args: Array<AnyType>): void {
    this.record(message, args);
  }

  error(message: string, ...args: Array<AnyType>): void {
    this.record(message, args);
  }

  emerg(message: string, ...args: Array<AnyType>): void {
    this.record(message, args);
  }

  log(_level: TLogLevel, message: string, ...args: Array<AnyType>): void {
    this.record(message, args);
  }

  for(_methodName: string): ILogger {
    return this;
  }
}

const answer = async (opts: { thrown: unknown; nodeEnv: 'production' | 'development' }) => {
  const logger = new RecordingLogger();
  const middleware = new BaseAppErrorMiddleware({ logger });
  const application = new Hono();

  application.use('*', requestId({ generator: () => 'req-wrap' }));
  application.get('/x', () => {
    throw ApplicationError.fromUnknown({ error: opts.thrown });
  });
  application.onError(middleware.value());
  application.notFound(notFoundHandler({ logger }));

  const response = await application.request(new Request('http://ignis.internal/x'), undefined, {
    NODE_ENV: opts.nodeEnv,
  });
  const json = await response.json();
  const body = json as Record<string, AnyType>;

  return {
    status: response.status,
    body,
    rendered: JSON.stringify(body),
    logged: logger.text.join('\n'),
  };
};

describe('a wrapped value with no usable HTTP status is answered as unexpected', () => {
  test.each([
    ['an Error', new TypeError(SQL_MESSAGE)],
    ['a plain object with a message', { message: SQL_MESSAGE }],
    [
      'an Error whose statusCode is not an HTTP error status',
      Object.assign(new Error(SQL_MESSAGE), { statusCode: 200 }),
    ],
    [
      'an Error whose only status is a 5xx status',
      Object.assign(new Error(SQL_MESSAGE), { status: 502 }),
    ],
  ])('%s: generic 500 in production, the real message only in the log', async (_name, thrown) => {
    const result = await answer({ thrown, nodeEnv: 'production' });

    expect(result.status).toBe(500);
    expect(result.body.message).toBe('Internal Server Error');
    expect(result.rendered).not.toContain('SELECT');
    expect(result.rendered).not.toContain('db-7.internal');
    expect(result.logged).toContain('db-7.internal');
  });

  test('a string or a number thrown is a generic 500, and its text is not in the response', async () => {
    const result = await answer({ thrown: 'password=hunter2 refused', nodeEnv: 'production' });

    expect(result.status).toBe(500);
    expect(result.rendered).not.toContain('hunter2');
  });

  test('outside production the message is shown, as for any unexpected error', async () => {
    const result = await answer({ thrown: new TypeError(SQL_MESSAGE), nodeEnv: 'development' });

    expect(result.status).toBe(500);
    expect(result.body.message).toContain('relation "orders" does not exist');
  });

  test('with no environment at all it fails closed: generic', async () => {
    const logger = new RecordingLogger();
    const application = new Hono();

    application.get('/x', () => {
      throw ApplicationError.fromUnknown({ error: new TypeError(SQL_MESSAGE) });
    });
    application.onError(new BaseAppErrorMiddleware({ logger }).value());

    const response = await application.request(new Request('http://ignis.internal/x'));
    const json = await response.json();
    const body = json as Record<string, AnyType>;

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('SELECT');
  });
});

describe('a wrapped value that carries a valid HTTP status keeps it and its message', () => {
  test.each([
    [
      'a 409 statusCode',
      { statusCode: 409, message: 'Order already paid' },
      409,
      'Order already paid',
    ],
    [
      'a 503 statusCode',
      Object.assign(new Error('Upstream is down'), { statusCode: 503 }),
      503,
      'Upstream is down',
    ],
    [
      'a 404 status (an HTTPException or a client error)',
      Object.assign(new Error('No such order'), { status: 404 }),
      404,
      'No such order',
    ],
  ])('%s', async (_name, thrown, status, message) => {
    const result = await answer({ thrown, nodeEnv: 'production' });

    expect(result.status).toBe(status);
    expect(result.body.message).toBe(message);
  });

  test('an ApplicationError is returned as it is, and keeps its own answer', async () => {
    const own = getError({ statusCode: 422, message: 'Quantity too high' });
    const result = await answer({ thrown: own, nodeEnv: 'production' });

    expect(ApplicationError.fromUnknown({ error: own })).toBe(own);
    expect(result.status).toBe(422);
    expect(result.body.message).toBe('Quantity too high');
  });
});
