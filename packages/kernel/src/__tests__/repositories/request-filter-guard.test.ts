import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import {
  RequestFilterGuard,
  type IRequestFilterJudge,
} from '@/base/repositories/common/request-filter-guard';

/** A filter that comes from a request cannot name a hidden field in its where, order or include scopes. */

const HIDDEN = new Set(['secret', 'deletedAt', 'meta.pin']);

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

const judgeOf = (opts: {
  hidden: ReadonlySet<string>;
  relations?: Record<string, IRequestFilterJudge>;
}): IRequestFilterJudge => ({
  isHidden: ({ key }) => RequestFilterGuard.isHiddenByName({ key, hidden: opts.hidden }),
  refuse: ({ key, tableName }) => RequestFilterGuard.columnNotFound({ scope: tableName, key }),
  relation: ({ relation }) =>
    opts.relations && Object.hasOwn(opts.relations, relation)
      ? opts.relations[relation]
      : undefined,
});

const assertFilter = (filter: unknown, hidden: ReadonlySet<string> = HIDDEN) =>
  RequestFilterGuard.assertFilter({
    filter: filter as never,
    judge: judgeOf({ hidden }),
    tableName: 'Probe',
  });

describe('isHiddenByName', () => {
  test.each([
    ['the name itself', 'secret', true],
    ['a dotted path under a hidden name', 'secret.path', true],
    ['a hidden nested name', 'meta.pin', true],
    ['a path under a hidden nested name', 'meta.pin.x', true],
    ['the parent of a hidden nested name', 'meta', true],
    ['a sibling of a hidden nested name', 'meta.other', false],
    ['a name that only shares a prefix', 'secrets', false],
    ['an unrelated name', 'name', false],
  ])('%s', (_name, key, expected) => {
    expect(RequestFilterGuard.isHiddenByName({ key, hidden: HIDDEN })).toBe(expected);
  });
});

describe('where', () => {
  test('a hidden field is refused with a 400', () => {
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
    ['a dotted path', { 'secret.path': 1 }],
    ['a hidden nested field', { 'meta.pin': 1 }],
    ['the parent of a hidden nested field', { meta: 1 }],
  ])('refuses %s', (_name, where) => {
    expect(refusal(() => assertFilter({ where })).statusCode).toBe(400);
  });

  test('passes a filter that names no hidden field', () => {
    expect(() =>
      assertFilter({
        where: {
          name: 'a',
          and: [{ or: [{ id: 1 }, { status: 'x' }] }],
          secrets: 1,
          'meta.other': 1,
        },
      }),
    ).not.toThrow();
  });

  test('a non-object where and an empty one are not a filter on anything', () => {
    for (const where of [undefined, null, 'x', 5, [], {}]) {
      expect(() => assertFilter({ where })).not.toThrow();
    }
  });

  test('the key is echoed escaped, on one line', () => {
    const error = refusal(() => assertFilter({ where: { 'secret.\nFORGED': 1 } }));

    expect(error.message).not.toContain('\n');
  });

  test('a model that hides nothing holds no filter to anything', () => {
    expect(() => assertFilter({ where: { secret: 1 } }, new Set())).not.toThrow();
  });

  test('the judge decides how a key is read', () => {
    const judge: IRequestFilterJudge = {
      isHidden: ({ key }) => key.split(/[.[\]]+/).filter(Boolean)[0] === 'secret',
      refuse: ({ kind, key, tableName }) => new Error(`${kind}|${tableName}|${key}`),
    };

    for (const key of ['[secret].path', '.secret.path', '[secret]path']) {
      expect(() =>
        RequestFilterGuard.assertFilter({ filter: { where: { [key]: 1 } }, judge, tableName: 'T' }),
      ).toThrow(`where|T|${key}`);
    }
  });
});

describe('order', () => {
  test.each([
    ['a string', 'secret'],
    ['a string with a direction', 'secret DESC'],
    ['a list', ['name ASC', 'deletedAt DESC']],
    ['lower case and extra spaces', ['  secret   desc']],
    ['a dotted path', ['secret.path ASC']],
    ['a hidden nested field', ['meta.pin ASC']],
  ])('refuses %s', (_name, order) => {
    expect(refusal(() => assertFilter({ order })).statusCode).toBe(400);
  });

  test('passes an order on visible fields, and ignores what is not a string entry', () => {
    expect(() => assertFilter({ order: ['name ASC', 'createdAt DESC'] })).not.toThrow();
    expect(() => assertFilter({ order: [{ secret: 'asc' }, 5] })).not.toThrow();
  });

  test('the refusal says it came from the order', () => {
    const judge: IRequestFilterJudge = {
      isHidden: () => true,
      refuse: ({ kind }) => new Error(kind),
    };

    expect(() =>
      RequestFilterGuard.assertFilter({ filter: { order: 'a ASC' }, judge, tableName: 'T' }),
    ).toThrow('order');
  });
});

describe('include scopes', () => {
  const author = judgeOf({ hidden: new Set(['email']) });
  const comments = judgeOf({
    hidden: new Set(['internalNote']),
    relations: { author },
  });
  const judge = judgeOf({ hidden: HIDDEN, relations: { comments } });
  const run = (filter: unknown) =>
    RequestFilterGuard.assertFilter({ filter: filter as never, judge, tableName: 'Probe' });

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

  test('the refusal names the related model', () => {
    const error = refusal(() =>
      run({ include: [{ relation: 'comments', scope: { where: { internalNote: 'x' } } }] }),
    );

    expect(error.message).toBe('[comments] Column NOT FOUND | key: "internalNote"');
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
    expect(() =>
      run({ include: [{ relation: 'toString', scope: { where: { secret: 1 } } }] }),
    ).not.toThrow();
  });

  test('a judge with no relations cannot judge a relation, and the where still holds', () => {
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
