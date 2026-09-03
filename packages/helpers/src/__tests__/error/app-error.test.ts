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
    // An error raised without a code is NOT code-less: it carries the default, so a client always has something to map. See message-code.test.ts.
    expect(error.normalized.code).toBe(MessageCode.DEFAULT);
    expect(error.extra).toBeUndefined();
  });

  test('honours an explicit statusCode and messageCode', () => {
    const error = getError({
      statusCode: HTTP.ResultCodes.RS_4.NotFound,
      messageCode: 'app.user.not_found',
      message: 'User not found',
    });

    expect(error.statusCode).toBe(404);
    expect(error.normalized.code).toBe('app.user.not_found');
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

  /** An undeclared key - context or typo, indistinguishable - lands in `extra` and the real field keeps its default; the index signature that carries context also swallows a misspelling. */
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

  test('stores an explicit logLevel', () => {
    const error = getError({ message: 'expected', statusCode: 404, logLevel: 'warn' });

    expect(error.logLevel).toBe('warn');
  });

  test('logLevel is undefined when unset, and never rides into extra', () => {
    const error = getError({ message: 'x' });

    expect(error.logLevel).toBeUndefined();
    expect(error.extra).toBeUndefined();
  });
});

// --- Error catalog: the `{ error: Def }` form ---
const CategoryErrors = {
  CREATE_DUPLICATE_NAME: {
    message: {
      text: 'A category named "%{name}" already exists.',
      code: 'server.commerce.category.create.duplicate_name',
    },
    statusCode: HTTP.ResultCodes.RS_4.Conflict,
    category: ErrorScopes.VALIDATION,
    description: 'Create rejected because a sibling category already has the same name.',
  },
} as const satisfies Record<string, TErrorDefinition>;

describe('getError - by definition', () => {
  test("takes the definition's code, text and statusCode", () => {
    const error = getError({ error: CategoryErrors.CREATE_DUPLICATE_NAME });

    expect(error.normalized.code).toBe('server.commerce.category.create.duplicate_name');
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
    expect(error.normalized.code).toBe('server.commerce.category.create.duplicate_name');
  });

  test('an explicit statusCode overrides the definition default', () => {
    const error = getError({ error: CategoryErrors.CREATE_DUPLICATE_NAME, statusCode: 410 });

    expect(error.statusCode).toBe(410);
  });

  test("the definition's own messageArgs are used when the call site passes none", () => {
    const Defaulted = {
      RATE_LIMITED: {
        message: {
          text: 'Try again in %{seconds}s.',
          code: 'server.core.rate_limit.exceeded',
          args: { seconds: 60 },
        },
        statusCode: HTTP.ResultCodes.RS_4.TooManyRequests,
      },
    } as const satisfies Record<string, TErrorDefinition>;

    expect(getError({ error: Defaulted.RATE_LIMITED }).normalized.args).toEqual({ seconds: 60 });
  });
});

describe('TRegisterErrors', () => {
  test('yields the union of catalogued keys as literal types', () => {
    type Registered = TRegisterErrors<typeof CategoryErrors>;

    // If `key` widened to `string` this assignment fails to compile - which is the whole point: the registry needs literals, so MessageCode.build (returns `string`) cannot be used here.
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

/** Pins the removal itself - nothing else asserts these fields are gone, so a regression re-adding either would pass the whole suite. */
describe('the legacy duplicates stay removed', () => {
  test('no flat messageCode field on the instance', () => {
    const error = getError({ message: 'x', messageCode: 'a.b' });

    expect('messageCode' in error).toBe(false);
    expect(error.normalized.code).toBe('a.b');
  });

  test('extra never mirrors messageArgs', () => {
    const error = getError({ message: 'x', messageArgs: { a: 1 } });

    expect(error.extra).toBeUndefined();
    expect(error.normalized.args).toEqual({ a: 1 });
  });
});

/** `error` is the catalogued form's discriminant, so `{ message, error }` must not compile - a natural way to write "wrap this" that would otherwise vanish. */
/** A malformed `error` must never throw from inside the constructor - that would mask the original failure mid-catch. */
describe('a malformed `error` degrades, never throws', () => {
  test('`{ message, error }` is refused at compile time', () => {
    // The directive IS the assertion - tsc fails the build if this shape ever compiles again.
    // @ts-expect-error `error` is not valid on the free-form branch - use `cause`
    const error = getError({ message: 'wrapper', error: new Error('root') });

    expect(error.message).toBe('wrapper');
  });

  test.each([
    ['a string', 'boom'],
    ['a number', 42],
    ['an empty object', {}],
    ['null', null],
  ])('a definition that is %s does not throw', (_label, value) => {
    const error = getError({ message: 'wrapper', error: value } as never);

    expect(error.message).toBe('wrapper');
    expect(error.normalized.code).toBe(MessageCode.DEFAULT);
  });
});

describe('MessageCode guards hostile input instead of throwing', () => {
  test.each([[123], [null], [undefined], [{}], [['a', 'b']]])('isValid(%p) is false', value => {
    expect(MessageCode.isValid(value)).toBe(false);
  });

  test.each([[123], [['a']], [{}]])('resolve(%p) falls back to the default', value => {
    expect(MessageCode.resolve(value as never)).toBe(MessageCode.DEFAULT);
  });
});
