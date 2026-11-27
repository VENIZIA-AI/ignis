import { describe, expect, test } from 'bun:test';
import { ZodErrorHandler } from '@/base/middlewares/app-error/zod.handler';

const format = (issues: unknown) =>
  ZodErrorHandler.formatZodError({
    isProduction: false,
    requestId: 'r',
    url: 'http://app.example/x',
    path: '/x',
    error: new Error(JSON.stringify(issues)),
  }).response;

describe('a Zod error message', () => {
  test('keeps the entries that are issues', () => {
    const response = format([null, 7, { path: ['a'], message: 'bad', code: 'c' }]);

    expect(response.message).toBe('bad');
    expect(response.details.cause).toHaveLength(1);
  });

  test('keeps an issue whose params or code have another type', () => {
    const response = format([{ path: ['a'], message: 'bad', code: 'too_small', params: 'x' }]);
    const oddCode = format([{ path: ['a'], message: 'odd', code: 7 }]);

    expect(response.message).toBe('bad');
    expect(response.normalized.code).toBe('too_small');
    expect(oddCode.message).toBe('odd');
    expect(oddCode.details.cause).toEqual([expect.objectContaining({ code: undefined })]);
    expect(typeof oddCode.normalized.code).toBe('string');
  });
});
