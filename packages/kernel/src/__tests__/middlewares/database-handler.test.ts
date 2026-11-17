import { describe, expect, test } from 'bun:test';
import { DatabaseErrorHandler } from '@/base/middlewares/app-error/database.handler';

/** An ORM-style wrapper chain: `levels` plain errors around the driver error. */
const wrapped = (opts: { driver: Record<string, unknown>; levels: number }) => {
  let current: Error = Object.assign(new Error('driver'), opts.driver);

  for (let i = 0; i < opts.levels; i += 1) {
    current = new Error(`wrapper ${i + 1}`, { cause: current });
  }

  return current;
};

const UNIQUE = {
  code: '23505',
  detail: 'Key (email)=(a@b.com) already exists.',
  table: 'users',
  constraint: 'users_email_key',
};

describe('DatabaseErrorHandler.isDatabaseClientError - a Postgres error inside a wrapped error', () => {
  test.each([0, 1, 2, 3])(
    'a unique violation %d level(s) deep is a client error with its context',
    (levels) => {
      const result = DatabaseErrorHandler.isDatabaseClientError({
        error: wrapped({ driver: UNIQUE, levels }),
        isProduction: false,
      });

      expect(result.isClientError).toBe(true);
      expect(result.message).toContain('Unique constraint violation');
      expect(result.message).toContain('Detail: Key (email)=(a@b.com) already exists.');
      expect(result.message).toContain('Table: users');
      expect(result.message).toContain('Constraint: users_email_key');
    },
  );

  test('production: the same deep error gives the base message only', () => {
    const result = DatabaseErrorHandler.isDatabaseClientError({
      error: wrapped({ driver: UNIQUE, levels: 3 }),
      isProduction: true,
    });

    expect(result).toEqual({ isClientError: true, message: 'Unique constraint violation' });
  });

  test('an outer non-SQLSTATE code does not hide the Postgres error below it', () => {
    const error = Object.assign(
      new Error('wrapper', { cause: Object.assign(new Error('d'), UNIQUE) }),
      {
        code: 'ECONNRESET',
      },
    );

    expect(
      DatabaseErrorHandler.isDatabaseClientError({ error, isProduction: true }).isClientError,
    ).toBe(true);
  });

  test('a Postgres error 11 levels deep is not found (stays a non-client error)', () => {
    const result = DatabaseErrorHandler.isDatabaseClientError({
      error: wrapped({ driver: UNIQUE, levels: 11 }),
      isProduction: false,
    });

    expect(result).toEqual({ isClientError: false });
  });

  test('a cyclic cause chain does not hang and is not a client error', () => {
    const a: Error & { cause?: unknown } = new Error('a');
    const b = new Error('b', { cause: a });
    a.cause = b;

    expect(DatabaseErrorHandler.isDatabaseClientError({ error: a, isProduction: false })).toEqual({
      isClientError: false,
    });
  });

  test('a class 42 error stays a non-client error', () => {
    const result = DatabaseErrorHandler.isDatabaseClientError({
      error: wrapped({ driver: { code: '42P01' }, levels: 2 }),
      isProduction: false,
    });

    expect(result.isClientError).toBe(false);
  });
});

describe('DatabaseErrorHandler.isRetryableDatabaseError - a Postgres error inside a wrapped error', () => {
  test.each([0, 1, 3])('a deadlock %d level(s) deep is retryable', (levels) => {
    expect(
      DatabaseErrorHandler.isRetryableDatabaseError({
        error: wrapped({ driver: { code: '40P01' }, levels }),
      }),
    ).toBe(true);
  });

  test('a serialization failure behind a non-SQLSTATE outer code is retryable', () => {
    const error = Object.assign(new Error('w', { cause: { code: '40001' } }), {
      code: 'ECONNRESET',
    });

    expect(DatabaseErrorHandler.isRetryableDatabaseError({ error })).toBe(true);
  });

  test('a unique violation is not retryable', () => {
    expect(
      DatabaseErrorHandler.isRetryableDatabaseError({
        error: wrapped({ driver: UNIQUE, levels: 2 }),
      }),
    ).toBe(false);
  });
});
