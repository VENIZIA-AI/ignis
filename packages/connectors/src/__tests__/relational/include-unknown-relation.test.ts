import { isApplicationError } from '@venizia/ignis-helpers/core';
import type { ApplicationError } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { SqliteQueryDialect } from '@/relational/sqlite/repositories/dialect/query-dialect';

/** An include names a declared relation or it is a 400 - an inherited name is not a relation, and the name is echoed the way column names are. */
const capture = (task: () => unknown): ApplicationError => {
  try {
    task();
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected an error');
};

describe.each([
  ['postgres', () => new PostgresQueryDialect()],
  ['sqlite', () => new SqliteQueryDialect()],
])('toInclude, %s - an unknown relation', (_engine, build) => {
  const dialect = build();
  const relations = { owner: { type: 'one' } } as never;

  test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])(
    'the inherited name %p is a not-found error, not an internal one',
    (name) => {
      const error = capture(() => dialect.toInclude({ include: [name] as never, relations }));

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Relation NOT FOUND');
    },
  );

  test('an unknown name in the object form is the same error', () => {
    const error = capture(() =>
      dialect.toInclude({ include: [{ relation: 'constructor' }] as never, relations }),
    );

    expect(error.statusCode).toBe(400);
  });

  test('the name is echoed escaped, on one line', () => {
    const error = capture(() =>
      dialect.toInclude({ include: ['bad\nFORGED name'] as never, relations }),
    );

    expect(error.message).not.toContain('\n');
    expect(error.message).toContain('bad\\u000aFORGED name');
  });
});
