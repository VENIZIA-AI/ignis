import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import {
  RequestFilterGuard,
  RequestFilterParts,
  type IRequestFilterJudge,
  type IRequestFilterShape,
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

/**
 * A filter that names a hidden field gets the first refusal the query would meet if the hidden name were missing: the judge
 * gives the order the query reads the parts in and the errors it throws on its own.
 */
describe('the first refusal in the order the query reads the filter', () => {
  const missing = new Set(['nope', 'zzz']);

  const queryRefusal: IRequestFilterJudge['queryRefusal'] = ({ part, value, tableName }) => {
    if (part === RequestFilterParts.INCLUDE) {
      const relation =
        typeof value === 'object' && value !== null && 'relation' in value
          ? value.relation
          : undefined;

      return relation === 'comments' ? undefined : new Error(`relation|${String(relation)}`);
    }

    const key = part === RequestFilterParts.WHERE ? Object.keys(value)[0] : value.split(' ')[0];

    return missing.has(key ?? '') ? new Error(`${part}|${tableName}|${key}`) : undefined;
  };

  const comments = { ...judgeOf({ hidden: new Set(['internalNote']) }), queryRefusal };
  const judge: IRequestFilterJudge = {
    ...judgeOf({ hidden: HIDDEN, relations: { comments } }),
    queryRefusal,
  };
  const run = (filter: IRequestFilterShape, of: IRequestFilterJudge = judge) =>
    RequestFilterGuard.assertFilter({ filter, judge: of, tableName: 'Probe' });

  test.each([
    [
      'a missing where key before the hidden one',
      { where: { nope: 1, secret: 1 } },
      'where|Probe|nope',
    ],
    [
      'a missing key in an or before the hidden one',
      { where: { or: [{ nope: 1 }], secret: 1 } },
      'where|Probe|nope',
    ],
    [
      'a missing order entry before the hidden one',
      { order: ['nope ASC', 'secret DESC'] },
      'order|Probe|nope',
    ],
    [
      'a missing where key before a hidden order entry',
      { where: { nope: 1 }, order: ['secret DESC'] },
      'where|Probe|nope',
    ],
    [
      'an unknown relation before a hidden key of a known one',
      {
        include: [
          { relation: 'x' },
          { relation: 'comments', scope: { where: { internalNote: 1 } } },
        ],
      },
      'relation|x',
    ],
    [
      'a missing key before the hidden one in an include scope',
      { include: [{ relation: 'comments', scope: { where: { zzz: 1, internalNote: 1 } } }] },
      'where|comments|zzz',
    ],
  ])('%s', (_name, filter, expected) => {
    expect(() => run(filter)).toThrow(expected);
  });

  test('the hidden key before a missing one is refused as hidden', () => {
    expect(refusal(() => run({ where: { secret: 1, nope: 1 } })).message).toBe(
      '[Probe] Column NOT FOUND | key: "secret"',
    );
  });

  test('the parts are read in the order the judge gives', () => {
    const orderFirst: IRequestFilterJudge = {
      ...judge,
      readOrder: () => [RequestFilterParts.ORDER, RequestFilterParts.WHERE],
    };

    expect(() => run({ where: { nope: 1 }, order: ['secret DESC'] }, orderFirst)).toThrow(
      'Column NOT FOUND | key: "secret"',
    );
    expect(() => run({ where: { secret: 1 }, order: ['nope DESC'] }, orderFirst)).toThrow(
      'order|Probe|nope',
    );
  });

  test('a refusal of the filter as a whole comes before every key', () => {
    const whole: IRequestFilterJudge = { ...judge, filterRefusal: () => new Error('whole') };

    expect(() => run({ where: { secret: 1 } }, whole)).toThrow('whole');
  });

  test('a judge that does not say what its query refuses has an unparseable order entry refused at once', () => {
    expect(() => assertFilter({ order: ['a b c'] })).toThrow('Too many tokens');
  });

  test('an order entry the query cannot parse is its refusal, before a later hidden entry', () => {
    expect(() => run({ order: ['a b c', 'secret DESC'] })).toThrow('Too many tokens');
  });

  test('a filter that names no hidden field is left to the query, whatever it refuses', () => {
    const whole: IRequestFilterJudge = { ...judge, filterRefusal: () => new Error('whole') };

    expect(() => run({ where: { nope: 1 }, order: ['zzz ASC', 'a b c'] })).not.toThrow();
    expect(() => run({ where: { name: 1 } }, whole)).not.toThrow();
  });
});

describe('fields are not a filter', () => {
  test('a fields list naming a hidden field is not refused here: the read drops it', () => {
    expect(() => assertFilter({ fields: ['secret'] })).not.toThrow();
  });
});
