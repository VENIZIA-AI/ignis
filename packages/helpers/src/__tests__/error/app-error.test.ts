import { describe, expect, test } from 'bun:test';
import { HTTP } from '@/common/constants';
import type { TErrorDefinition, TRegisterErrors } from '@/modules/error';
import {
  ApplicationError,
  ErrorScopes,
  getError,
  isApplicationError,
  MessageCode,
} from '@/modules/error';

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

  test('an unknown key rides into `extra`', () => {
    const error = getError({ message: 'failed', userId: 7, tags: ['a'] });

    expect(error.extra).toEqual({ userId: 7, tags: ['a'] });
  });

  test('an explicit `extra` merges with the swept keys, and wins on a clash', () => {
    const error = getError({ message: 'failed', userId: 7, extra: { userId: 9, trace: 'z' } });

    expect(error.extra).toEqual({ userId: 9, trace: 'z' });
  });

  test('carries a stack trace', () => {
    expect(typeof getError({ message: 'x' }).stack).toBe('string');
  });

  /**
   * A key the input does not declare - context or typo, the framework cannot tell them apart -
   * lands in `extra` and the real field keeps its default. Pinned because it is a deliberate
   * trade: the index signature that carries context is the same one that swallows a misspelling.
   */
  test('a misspelled field lands in extra and the real field keeps its default', () => {
    const error = getError({ message: 'x', statuscode: 503 });

    expect(error.statusCode).toBe(400);
    expect(error.extra).toEqual({ statuscode: 503 });
  });

  test('the static factory matches the function form', () => {
    const error = ApplicationError.getError({ message: 'static', statusCode: 500 });

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.statusCode).toBe(500);
  });
});

// --------------------------------------------------------------------------------
// Error catalog - the `{ error: Def }` form, ported from BANA.
// --------------------------------------------------------------------------------
const CategoryErrors = {
  CREATE_DUPLICATE_NAME: {
    key: 'server.commerce.category.create.duplicate_name',
    statusCode: HTTP.ResultCodes.RS_4.Conflict,
    category: ErrorScopes.VALIDATION,
    message: 'A category named "%{name}" already exists.',
    description: 'Create rejected because a sibling category already has the same name.',
  },
} as const satisfies Record<string, TErrorDefinition>;

describe('getError - by definition', () => {
  test("takes the definition's key as messageCode and its statusCode", () => {
    const error = getError({ error: CategoryErrors.CREATE_DUPLICATE_NAME });

    expect(error.messageCode).toBe('server.commerce.category.create.duplicate_name');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('A category named "%{name}" already exists.');
  });

  test('an explicit message overrides the definition default', () => {
    const error = getError({
      error: CategoryErrors.CREATE_DUPLICATE_NAME,
      message: 'Overridden',
    });

    expect(error.message).toBe('Overridden');
    // The code still identifies the catalogued error - only the human text changed.
    expect(error.messageCode).toBe('server.commerce.category.create.duplicate_name');
  });

  test('an explicit statusCode overrides the definition default', () => {
    const error = getError({ error: CategoryErrors.CREATE_DUPLICATE_NAME, statusCode: 410 });

    expect(error.statusCode).toBe(410);
  });

  test("the definition's own messageArgs are used when the call site passes none", () => {
    const Defaulted = {
      RATE_LIMITED: {
        key: 'server.core.rate_limit.exceeded',
        statusCode: HTTP.ResultCodes.RS_4.TooManyRequests,
        message: 'Try again in %{seconds}s.',
        messageArgs: { seconds: 60 },
      },
    } as const satisfies Record<string, TErrorDefinition>;

    expect(getError({ error: Defaulted.RATE_LIMITED }).normalized.args).toEqual({ seconds: 60 });
  });
});

describe('TRegisterErrors', () => {
  test('yields the union of catalogued keys as literal types', () => {
    type Registered = TRegisterErrors<typeof CategoryErrors>;

    // If `key` widened to `string`, this assignment fails to compile - which is the whole point:
    // the registry needs literals, so MessageCode.build (returns `string`) cannot be used here.
    const registered: Registered = { 'server.commerce.category.create.duplicate_name': true };

    expect(registered['server.commerce.category.create.duplicate_name']).toBe(true);
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
