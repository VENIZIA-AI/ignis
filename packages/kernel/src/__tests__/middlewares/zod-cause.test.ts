import { describe, expect, test } from 'bun:test';
import { ZodErrorHandler } from '@/base/middlewares/app-error/zod.handler';

/** In production a validation response carries the list of issues and nothing else about the error. */
const format = (opts: { message: string; isProduction: boolean }) => {
  const error = Object.assign(new Error(opts.message), {
    name: 'ZodError',
    secret: 'internal-detail',
  });

  return ZodErrorHandler.formatZodError({
    isProduction: opts.isProduction,
    requestId: 'req-1',
    url: 'http://ignis.test/x',
    path: '/x',
    error,
  });
};

const ISSUES = JSON.stringify([
  {
    code: 'invalid_type',
    expected: 'string',
    received: 'number',
    path: ['name'],
    message: 'Expected string',
  },
]);

describe('ZodErrorHandler - details.cause', () => {
  test('a parsable issue list is returned as path and message, in production too', () => {
    const { statusCode, response } = format({ message: ISSUES, isProduction: true });

    expect(statusCode).toBe(422);
    expect(response.details.cause).toEqual([
      {
        path: 'name',
        message: 'Expected string',
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
      },
    ]);
    expect(response.details.stack).toBeUndefined();
  });

  test('in production an unparsable message carries no cause, not the raw error', () => {
    const { response } = format({ message: 'not an issue list {', isProduction: true });

    expect(response.details.cause).toBeUndefined();
    expect(JSON.stringify(response)).not.toContain('internal-detail');
  });

  test('a message that parses to something other than a list carries no cause in production', () => {
    const { response } = format({ message: '{"password":"hunter2"}', isProduction: true });

    expect(response.details.cause).toBeUndefined();
    expect(JSON.stringify(response)).not.toContain('hunter2');
  });

  test('outside production the raw error stays for the developer', () => {
    const { response } = format({ message: 'not an issue list {', isProduction: false });

    expect(response.details.cause).toBeInstanceOf(Error);
  });
});
