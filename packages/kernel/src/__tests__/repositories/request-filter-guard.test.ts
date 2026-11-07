import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { RequestFilterGuard } from '@/base/repositories/common/request-filter-guard';

/** A filter that comes from a request cannot name a hidden field in its where, order or include scopes. */

const HIDDEN = new Set(['secret', 'deletedAt']);

const refusal = (task: () => void) => {
  try {
    task();
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected a refusal');
};

const assertFilter = (filter: unknown, hidden: ReadonlySet<string> = HIDDEN) =>
  RequestFilterGuard.assertFilter({ scope: 'Probe', filter: filter as never, hidden });

describe('where', () => {
  test('a hidden field is refused, as an unknown column is, with a 400', () => {
    const error = refusal(() => assertFilter({ where: { secret: 'x' } }));

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('[Probe] Column NOT FOUND | key: "secret"');
  });

  test.each([
    ['an equality', { secret: 'x' }],
    ['null', { deletedAt: null }],
    ['an operator object', { secret: { neq: 'x' } }],
    ['an and', { and: [{ name: 'a' }, { secret: 'x' }] }],
    ['an or', { or: [{ secret: 'x' }, {}] }],
    ['a nested and and or', { and: [{ or: [{ and: [{ deletedAt: null }] }] }] }],
    ['an and next to other keys', { name: 'a', and: [{ secret: 1 }] }],
    ['a JSON path', { 'secret.path': 1 }],
    ['a JSON arrow path', { 'secret->>path': 1 }],
    ['an indexed path', { 'secret[0]': 1 }],
    ['a padded key', { ' secret': 1 }],
  ])('refuses %s', (_name, where) => {
    expect(refusal(() => assertFilter({ where })).statusCode).toBe(400);
  });

  test('passes a filter that names no hidden field', () => {
    expect(() =>
      assertFilter({
        where: { name: 'a', and: [{ or: [{ id: 1 }, { status: 'x' }] }], secrets: 1 },
      }),
    ).not.toThrow();
  });

  test('a non-object where and an empty one are not a filter on anything', () => {
    for (const where of [undefined, null, 'x', 5, [], {}]) {
      expect(() => assertFilter({ where })).not.toThrow();
    }
  });

  test('the key is echoed escaped, on one line', () => {
    const error = refusal(() => assertFilter({ where: { 'secret\nFORGED': 1 } }));

    expect(error.message).not.toContain('\n');
  });

  test('a model that hides nothing holds no filter to anything', () => {
    expect(() => assertFilter({ where: { secret: 1 } }, new Set())).not.toThrow();
  });
});

describe('order', () => {
  test.each([
    ['a string', 'secret'],
    ['a string with a direction', 'secret DESC'],
    ['a list', ['name ASC', 'deletedAt DESC']],
    ['lower case and extra spaces', ['  secret   desc']],
    ['a JSON path', ['secret.path ASC']],
  ])('refuses %s', (_name, order) => {
    expect(refusal(() => assertFilter({ order })).statusCode).toBe(400);
  });

  test('passes an order on visible fields, and ignores what is not a string entry', () => {
    expect(() => assertFilter({ order: ['name ASC', 'createdAt DESC'] })).not.toThrow();
    expect(() => assertFilter({ order: [{ secret: 'asc' }, 5] })).not.toThrow();
  });
});

describe('include scopes', () => {
  const relationHidden: Record<string, ReadonlySet<string>> = {
    comments: new Set(['internalNote']),
    'comments.author': new Set(['email']),
  };
  const resolveRelation = ({ relation }: { relation: string }) => relationHidden[relation];
  const run = (filter: unknown) =>
    RequestFilterGuard.assertFilter({
      scope: 'Probe',
      filter: filter as never,
      hidden: HIDDEN,
      resolveRelation,
    });

  test("a scope's where and order are judged by the hidden fields of the related model", () => {
    expect(
      refusal(() =>
        run({ include: [{ relation: 'comments', scope: { where: { internalNote: 'x' } } }] }),
      ).statusCode,
    ).toBe(400);
    expect(
      refusal(() =>
        run({ include: [{ relation: 'comments', scope: { order: ['internalNote ASC'] } }] }),
      ).statusCode,
    ).toBe(400);
  });

  test("the parent's hidden fields do not apply to the child, and the child's do not apply to the parent", () => {
    expect(() =>
      run({ include: [{ relation: 'comments', scope: { where: { secret: 'x' } } }] }),
    ).not.toThrow();
    expect(refusal(() => run({ where: { secret: 1 } })).statusCode).toBe(400);
    expect(() => run({ where: { internalNote: 1 } })).not.toThrow();
  });

  test('a nested include is judged by its own model', () => {
    const nested = (where: unknown) => ({
      include: [
        {
          relation: 'comments',
          scope: { include: [{ relation: 'author', scope: { where } }] },
        },
      ],
    });

    expect(refusal(() => run(nested({ email: 'a@b' }))).statusCode).toBe(400);
    expect(() => run(nested({ name: 'a' }))).not.toThrow();
  });

  test('a string include, an include without a scope and an unknown relation are not refused here', () => {
    expect(() => run({ include: ['comments', { relation: 'comments' }] })).not.toThrow();
    expect(() =>
      run({ include: [{ relation: 'nope', scope: { where: { secret: 1 } } }] }),
    ).not.toThrow();
  });

  test('a filter with no resolver cannot judge a relation, and the where still holds', () => {
    expect(() =>
      assertFilter({ include: [{ relation: 'comments', scope: { where: { internalNote: 1 } } }] }),
    ).not.toThrow();
    expect(refusal(() => assertFilter({ where: { secret: 1 } })).statusCode).toBe(400);
  });
});

describe('fields are not a filter', () => {
  test('a fields list naming a hidden field is not refused here: the read drops it', () => {
    expect(() => assertFilter({ fields: ['secret'] })).not.toThrow();
  });
});
