import { describe, expect, test } from 'bun:test';
import { ApplicationError, getError, isApplicationError } from '@/modules/error';

const GENERIC_MESSAGE = 'An unknown value was thrown';

const UNEXPECTED_KEY = '@venizia/ignis-inversion:unexpected-error';

/** Whether the private marker the kernel middleware reads is on the error. */
const isUnexpected = (error: object): boolean => Symbol.for(UNEXPECTED_KEY) in error;

const wrap = (error: unknown): ApplicationError => ApplicationError.fromUnknown({ error });

/** True for a character that cannot break a log line: no C0, DEL, C1 control and no Unicode line terminator. */
const isPlainCharacter = (char: string): boolean => {
  const code = char.charCodeAt(0);

  return !(code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029);
};

const throwing = (): never => {
  // The point of the fixture is a value that blows up when touched, so it must be a raw throw.
  // eslint-disable-next-line venizia/no-new-error -- a foreign failure, not a framework error
  throw new Error('touched');
};

describe('ApplicationError.fromUnknown - an ApplicationError', () => {
  test('returns the very same instance', () => {
    const original = getError({ message: 'Already wrapped', statusCode: 409 });
    const wrapped = wrap(original);

    expect(wrapped).toBe(original);
    expect(wrapped.statusCode).toBe(409);
    expect(wrapped.cause).toBeUndefined();
  });

  test('returns an error from another copy of the class (same shape, not an instance)', () => {
    // What a second installed copy produces: an Error carrying statusCode and normalized.text.
    const foreign = Object.assign(new Error('From another copy'), {
      statusCode: 422,
      normalized: { text: 'From another copy', code: 'core.system_error', args: {} },
    });

    expect(isApplicationError(foreign)).toBe(true);
    expect(wrap(foreign)).toBe(foreign as unknown as ApplicationError);
  });

  test('a plain Error that only carries a statusCode is NOT one, so it is wrapped', () => {
    const foreign = Object.assign(new Error('Looks close'), { statusCode: 404 });
    const wrapped = wrap(foreign);

    expect(wrapped).not.toBe(foreign as unknown as ApplicationError);
    expect(wrapped).toBeInstanceOf(ApplicationError);
    expect(wrapped.statusCode).toBe(404);
    expect(wrapped.cause).toBe(foreign);
  });
});

describe('ApplicationError.fromUnknown - an Error', () => {
  test('keeps the message, defaults to 500 and keeps the original as cause', () => {
    const original = new TypeError('x is not a function');
    const wrapped = wrap(original);

    expect(wrapped).toBeInstanceOf(ApplicationError);
    expect(wrapped.message).toBe('x is not a function');
    expect(wrapped.normalized.text).toBe('x is not a function');
    expect(wrapped.statusCode).toBe(500);
    expect(wrapped.cause).toBe(original);
  });

  test('an Error with an empty message gets the generic message', () => {
    expect(wrap(new Error('')).message).toBe(GENERIC_MESSAGE);
    expect(wrap(new Error('   ')).message).toBe(GENERIC_MESSAGE);
  });

  test('an Error subclass carrying statusCode keeps it', () => {
    class HttpFailure extends Error {
      statusCode = 503;
    }

    expect(wrap(new HttpFailure('Upstream is down')).statusCode).toBe(503);
  });

  test('an Error carrying status (an HTTPException) keeps it', () => {
    const original = Object.assign(new Error('Not found'), { status: 404 });

    expect(wrap(original).statusCode).toBe(404);
  });

  test('statusCode wins over status when both are valid', () => {
    const original = Object.assign(new Error('Both'), { statusCode: 409, status: 503 });

    expect(wrap(original).statusCode).toBe(409);
  });

  test('an unusable statusCode falls through to a usable status', () => {
    const original = Object.assign(new Error('Both'), { statusCode: 200, status: 404 });

    expect(wrap(original).statusCode).toBe(404);
  });

  test('a 5xx status (not a statusCode) is an upstream status: it is not kept, and the error is unexpected', () => {
    const original = Object.assign(new Error('Bad gateway'), { status: 503 });
    const wrapped = wrap(original);

    expect(wrapped.statusCode).toBe(500);
    expect(isUnexpected(wrapped)).toBe(true);
  });
});

describe('ApplicationError.fromUnknown - the private unexpected marker', () => {
  test('a value with no usable status is marked, a value with one is not', () => {
    expect(isUnexpected(wrap(new Error('x')))).toBe(true);
    expect(isUnexpected(wrap({ message: 'x', statusCode: 200 }))).toBe(true);
    expect(isUnexpected(wrap({ message: 'x', statusCode: 409 }))).toBe(false);
    expect(isUnexpected(wrap({ message: 'x', status: 404 }))).toBe(false);
  });

  test('an ApplicationError returned as it is gets no marker', () => {
    const own = getError({ message: 'mine', statusCode: 500 });

    expect(wrap(own)).toBe(own);
    expect(isUnexpected(own)).toBe(false);
  });

  test('the marker does not enumerate, is not an own string key, and never reaches JSON', () => {
    const wrapped = wrap(new Error('x'));

    expect(Object.keys(wrapped)).not.toContain('unexpected');
    expect(
      Object.getOwnPropertySymbols(wrapped).some((symbol) => symbol.description === UNEXPECTED_KEY),
    ).toBe(true);
    expect(JSON.stringify(wrapped)).not.toContain('unexpected');
    expect(Object.entries(wrapped).flat().includes(true)).toBe(false);
  });
});

describe('ApplicationError.fromUnknown - the status code rules', () => {
  const statusOf = (value: unknown): number => wrap({ statusCode: value }).statusCode;

  test.each([400, 404, 418, 499, 500, 503, 599])('%p is kept', (value) => {
    expect(statusOf(value)).toBe(value);
  });

  test.each([
    ['below the range', 399],
    ['a success code', 200],
    ['zero', 0],
    ['negative', -500],
    ['above the range', 600],
    ['a fraction', 404.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a numeric string', '404'],
    ['a bigint', 404n],
    ['null', null],
    ['undefined', undefined],
    ['an object', { code: 404 }],
  ])('%s falls back to 500', (_label, value) => {
    expect(statusOf(value)).toBe(500);
  });

  test('a message and a status together on a plain object', () => {
    const original = { statusCode: 429, message: 'Slow down' };
    const wrapped = wrap(original);

    expect(wrapped.statusCode).toBe(429);
    expect(wrapped.message).toBe('Slow down');
    expect(wrapped.cause).toBe(original);
  });
});

describe('ApplicationError.fromUnknown - the message rules', () => {
  test('a string message on a plain object is used', () => {
    expect(wrap({ message: 'Plain object message' }).message).toBe('Plain object message');
  });

  test.each([
    ['a number', { message: 42 }],
    ['an object', { message: { text: 'nested' } }],
    ['an array', { message: ['a'] }],
    ['null', { message: null }],
    ['a function', { message: () => 'x' }],
    ['absent', {}],
  ])('a message that is %s gets the generic message', (_label, value) => {
    expect(wrap(value).message).toBe(GENERIC_MESSAGE);
  });

  test('never prints the value through String(): toString and toJSON are not called', () => {
    const original = {
      toString: throwing,
      toJSON: throwing,
      [Symbol.toPrimitive]: throwing,
    };
    const wrapped = wrap(original);

    expect(wrapped.message).toBe(GENERIC_MESSAGE);
    expect(wrapped.cause).toBe(original);
  });

  test('a control character in the message is escaped, so the message stays on one line', () => {
    const separators = String.fromCharCode(0x2028, 0x2029);
    const wrapped = wrap(
      new Error(`line one\nline two\r\u0000\u001b[31mred\u007f\u0085${separators}`),
    );

    expect(wrapped.message).toBe(
      'line one\\u000aline two\\u000d\\u0000\\u001b[31mred\\u007f\\u0085\\u2028\\u2029',
    );
    expect(Array.from(wrapped.message).every((char) => isPlainCharacter(char))).toBe(true);
  });

  test('ordinary punctuation is left as written', () => {
    expect(wrap(new Error('a, b: c | d')).message).toBe('a, b: c | d');
  });
});

describe('ApplicationError.fromUnknown - never throws, for any input', () => {
  const circular: Record<string, unknown> = { name: 'loop' };
  circular.self = circular;

  const revocable = Proxy.revocable({}, {});
  revocable.revoke();

  const trapThrows = new Proxy(
    {},
    {
      get: throwing,
      has: throwing,
      getPrototypeOf: throwing,
      ownKeys: throwing,
      getOwnPropertyDescriptor: throwing,
    },
  );

  const throwingGetters = {
    get message(): string {
      return throwing();
    },
    get statusCode(): number {
      return throwing();
    },
    get status(): number {
      return throwing();
    },
    get normalized(): unknown {
      return throwing();
    },
  };

  const throwingErrorGetters = Object.defineProperties(new Error('hidden'), {
    message: { get: throwing },
    statusCode: { get: throwing },
    normalized: { get: throwing },
  });

  const frozen = Object.freeze({ statusCode: 418, message: 'Frozen teapot' });
  const frozenError = Object.freeze(Object.assign(new Error('Frozen error'), { status: 502 }));

  const inputs: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'boom'],
    ['an empty string', ''],
    ['a number', 42],
    ['NaN', Number.NaN],
    ['a bigint', 9007199254740993n],
    ['true', true],
    ['a symbol', Symbol('thrown')],
    ['a registered symbol', Symbol.for('thrown')],
    ['a function', () => 1],
    ['an array', ['a', 'b']],
    ['a Date', new Date(0)],
    ['an object without a prototype', Object.create(null)],
    ['a circular structure', circular],
    ['a frozen object', frozen],
    ['a frozen Error', frozenError],
    ['an object with throwing getters', throwingGetters],
    ['an Error with throwing getters', throwingErrorGetters],
    ['a Proxy whose traps throw', trapThrows],
    ['a revoked Proxy', revocable.proxy],
    ['a Response-like object', { status: 404, statusText: 'Not Found' }],
  ];

  test.each(inputs)('%s', (_label, value) => {
    // Block body on purpose: the runner reads a function that RETURNS an Error as one that threw.
    expect(() => {
      wrap(value);
    }).not.toThrow();

    const wrapped = wrap(value);

    expect(wrapped).toBeInstanceOf(ApplicationError);
    expect(typeof wrapped.message).toBe('string');
    expect(wrapped.statusCode).toBeGreaterThanOrEqual(400);
    expect(wrapped.statusCode).toBeLessThanOrEqual(599);
  });

  test('keeps the original as cause for every value but undefined', () => {
    for (const [label, value] of inputs) {
      if (value === undefined) {
        continue;
      }

      const wrapped = wrap(value);

      expect([label, Object.is(wrapped.cause, value)]).toEqual([label, true]);
    }
  });

  test('a value that is not an Error has the generic message and a 500', () => {
    for (const value of [undefined, null, 'boom', 42, Symbol('x'), 9n, true, circular]) {
      const wrapped = wrap(value);

      expect(wrapped.message).toBe(GENERIC_MESSAGE);
      expect(wrapped.statusCode).toBe(500);
    }
  });

  test('a frozen object is read, never written', () => {
    expect(wrap(frozen).statusCode).toBe(418);
    expect(wrap(frozen).message).toBe('Frozen teapot');
    expect(wrap(frozenError).statusCode).toBe(500);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('a getter that throws on one field does not cost the others', () => {
    const original = {
      get message(): string {
        return throwing();
      },
      statusCode: 409,
    };
    const wrapped = wrap(original);

    expect(wrapped.statusCode).toBe(409);
    expect(wrapped.message).toBe(GENERIC_MESSAGE);
  });

  test('the wrapped error is itself a stable fixed point', () => {
    const once = wrap(new Error('Once'));

    expect(wrap(once)).toBe(once);
  });
});
