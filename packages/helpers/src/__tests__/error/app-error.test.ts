import { describe, expect, test } from 'bun:test';
import { HTTP } from '@/common/constants';
import { ApplicationError, getError, isApplicationError, MessageCode } from '@/modules/error';

describe('getError', () => {
  test('defaults the statusCode to 400', () => {
    const error = getError({ message: 'bad input' });

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('bad input');
    expect(error.statusCode).toBe(400);
    // An error raised without a code is NOT code-less: it carries the default, so a client always
    // has something to map. See message-code.test.ts.
    expect(error.messageCode).toBe(MessageCode.DEFAULT);
    expect(error.extra).toBeUndefined();
  });

  test('honours an explicit statusCode and messageCode', () => {
    const error = getError({
      statusCode: HTTP.ResultCodes.RS_4.NotFound,
      messageCode: 'app.user.not_found',
      message: 'User not found',
    });

    expect(error.statusCode).toBe(404);
    expect(error.messageCode).toBe('app.user.not_found');
  });

  test('collects unknown keys into `extra`', () => {
    const error = getError({ message: 'failed', userId: 7, tags: ['a'] });

    expect(error.extra).toEqual({ userId: 7, tags: ['a'] });
  });

  test('an explicit `extra` key is itself collected, not merged (pinned behavior)', () => {
    const error = getError({ message: 'failed', extra: { reason: 'x' } });

    expect(error.extra).toEqual({ extra: { reason: 'x' } });
  });

  test('`name` is stripped from extra and does not rename the error (pinned behavior)', () => {
    const error = getError({ name: 'ValidationError', message: 'failed' });

    expect(error.extra).toBeUndefined();
    expect(error.name).toBe('Error');
  });

  test('carries a stack trace', () => {
    expect(typeof getError({ message: 'x' }).stack).toBe('string');
  });

  test('the static factory matches the function form', () => {
    const error = ApplicationError.getError({ message: 'static', statusCode: 500 });

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.statusCode).toBe(500);
  });
});

describe('isApplicationError', () => {
  test('recognizes an error by shape, not class identity', () => {
    expect(isApplicationError(getError({ message: 'x' }))).toBe(true);

    const foreignError = new Error('from another package copy');
    (foreignError as Error & { statusCode?: number }).statusCode = 404;
    expect(isApplicationError(foreignError)).toBe(true);
  });

  test('rejects a plain Error, a non-Error object of the right shape, and non-objects', () => {
    expect(isApplicationError(new Error('raw'))).toBe(false);
    expect(isApplicationError({ statusCode: 400, message: 'not an Error' })).toBe(false);
    expect(isApplicationError(null)).toBe(false);
    expect(isApplicationError(undefined)).toBe(false);
    expect(isApplicationError('boom')).toBe(false);
  });

  test('rejects an Error whose statusCode is not a number', () => {
    const error = new Error('bad shape');
    (error as Error & { statusCode?: unknown }).statusCode = '400';

    expect(isApplicationError(error)).toBe(false);
  });

  test('narrows to ApplicationError for the caller', () => {
    const error: unknown = getError({ message: 'narrow', statusCode: 503 });

    if (!isApplicationError(error)) {
      expect.unreachable();
    }

    expect(error.statusCode).toBe(503);
  });
});
