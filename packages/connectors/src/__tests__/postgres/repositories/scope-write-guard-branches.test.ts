import { describe, expect, test } from 'bun:test';
import type { TWhere } from '@venizia/ignis-kernel';
import { ScopeOperations, ScopeWriteGuards } from '@venizia/ignis-kernel';
import { ScopeFilterDenial } from '@/relational/core/repositories/common/scope-filter';
import { ScopeWriteGuard } from '@/relational/core/repositories/common/scope-write-guard';

/** The branches a scope reads as, each column's values as a sorted list, or the reason it cannot be verified. */
const read = (where: TWhere) => {
  const extraction = ScopeWriteGuard.extractConstraints({ where });

  if (!extraction.isVerifiable) {
    return extraction.reason;
  }

  return extraction.branches.map((branch) => {
    return Object.fromEntries(
      [...branch].map(([column, allowed]) => [column, [...allowed].sort()]),
    );
  });
};

const narrow = (opts: { scopeWhere: TWhere; sharedRows?: boolean }) => {
  return ScopeWriteGuard.mutationWhere({
    settings: { resolve: () => opts.scopeWhere, write: { sharedRows: opts.sharedRows } },
    model: 'items',
    operation: ScopeOperations.DELETE,
    scopeWhere: opts.scopeWhere,
  });
};

/** An `or` of `count` two-column branches, none of which merge. */
const pairs = (opts: { prefix: string; count: number }) => ({
  or: Array.from({ length: opts.count }, (_, index) => ({
    [`${opts.prefix}1`]: `${index}`,
    [`${opts.prefix}2`]: `${index}`,
  })),
});

describe('ScopeWriteGuard.extractConstraints - branches', () => {
  test('a conjunction is one branch', () => {
    expect(read({ m: 'a', o: { inq: ['x', 'y'] } })).toEqual([{ m: ['a'], o: ['x', 'y'] }]);
  });

  test('an or over one column is one branch holding the union', () => {
    expect(read({ or: [{ m: { in: ['a', 'b'] } }, { m: null }] })).toEqual([
      { m: ['a', 'b', null] },
    ]);
    expect(read({ or: [{ m: 'a' }, { m: 'a' }] })).toEqual([{ m: ['a'] }]);
  });

  test('an or over different columns is one branch per alternative', () => {
    expect(read({ or: [{ m: { inq: ['a'] } }, { m: null, o: { inq: ['x'] } }] })).toEqual([
      { m: ['a'] },
      { m: [null], o: ['x'] },
    ]);
  });

  test('and multiplies its parts and intersects a shared column', () => {
    expect(
      read({
        and: [{ or: [{ m: 'a' }, { o: 'x' }] }, { or: [{ m: { inq: ['a', 'b'] } }, { p: '1' }] }],
      }),
    ).toEqual([
      { m: ['a'] },
      { m: ['a'], p: ['1'] },
      { o: ['x'], m: ['a', 'b'] },
      { o: ['x'], p: ['1'] },
    ]);
  });

  test('an empty intersection stays a branch, so the number of branches is the shape of the scope', () => {
    expect(read({ and: [{ or: [{ m: 'a' }, { o: 'x' }] }, { m: 'b' }] })).toEqual([
      { m: [] },
      { o: ['x'], m: ['b'] },
    ]);
  });

  test('a single branch keeps an empty set', () => {
    expect(read({ and: [{ m: 'a' }, { m: 'b' }] })).toEqual([{ m: [] }]);
    expect(read({ m: { in: [] } })).toEqual([{ m: [] }]);
  });

  test('32 branches are read; 33 are not, from an or or from and multiplying', () => {
    expect(read(pairs({ prefix: 'a', count: 32 }))).toHaveLength(32);
    expect(
      read({ and: [pairs({ prefix: 'a', count: 4 }), pairs({ prefix: 'b', count: 8 })] }),
    ).toHaveLength(32);
    expect(read(pairs({ prefix: 'a', count: 33 }))).toBe(
      'a scope of more than 32 branches cannot be checked on a write',
    );
    expect(
      read({ and: [pairs({ prefix: 'a', count: 3 }), pairs({ prefix: 'b', count: 11 })] }),
    ).toBe('a scope of more than 32 branches cannot be checked on a write');
  });

  test('an or of one column with more than 32 values is still one branch', () => {
    expect(
      read({ or: Array.from({ length: 40 }, (_, index) => ({ m: `${index}` })) }),
    ).toHaveLength(1);
  });

  test.each([
    ['a range inside a branch', { or: [{ m: 'a' }, { m: null, o: { gt: 'x' } }] }, /operator 'gt'/],
    ['a nested path inside a branch', { or: [{ m: 'a' }, { 'meta.o': 'x' }] }, /nested path/],
    [
      'two operators inside a branch',
      { or: [{ m: 'a' }, { o: { eq: 'x', neq: 'y' } }] },
      /2 operators/,
    ],
    ['an empty branch', { or: [{ m: 'a' }, {}] }, /no condition/],
    ['a branch that is no condition at all', { or: [{ m: 'a' }, { and: [] }] }, /no condition/],
  ])('%s cannot be verified', (_label, where, pattern) => {
    expect(read(where)).toMatch(pattern);
  });
});

describe('ScopeWriteGuard.mutationWhere - branches', () => {
  const TWO_LEVEL = { or: [{ m: { inq: ['a'] } }, { m: null, o: { inq: ['x'] } }] };

  test('without sharedRows a branch holding a null is removed whole', () => {
    expect(narrow({ scopeWhere: TWO_LEVEL })).toEqual({ or: [{ m: { inq: ['a'] } }] });
  });

  test('with sharedRows the scope is returned as it is', () => {
    expect(narrow({ scopeWhere: TWO_LEVEL, sharedRows: true })).toEqual(TWO_LEVEL);
  });

  test('a null among other values of a branch is removed and the branch stays', () => {
    expect(
      narrow({ scopeWhere: { or: [{ m: 'a' }, { m: { inq: ['b', null] }, o: 'x' }] } }),
    ).toEqual({
      or: [{ m: 'a' }, { m: { inq: ['b'] }, o: 'x' }],
    });
  });

  test('when every branch is removed the mutation matches no row', () => {
    expect(
      narrow({
        scopeWhere: {
          or: [
            { m: null, o: 'x' },
            { m: null, p: 'y' },
          ],
        },
      }),
    ).toEqual(ScopeFilterDenial.where());
  });

  test('a branch the guard cannot read is refused, with sharedRows too', () => {
    const scopeWhere = { or: [{ m: 'a' }, { o: { like: 'x%' } }] };

    expect(() => narrow({ scopeWhere })).toThrow(/operator 'like'/);
    expect(() => narrow({ scopeWhere, sharedRows: true })).toThrow(/operator 'like'/);
  });

  test('an or of 33 branches is refused', () => {
    expect(() => narrow({ scopeWhere: pairs({ prefix: 'a', count: 33 }) })).toThrow(
      /more than 32 branches/,
    );
  });
});

describe('ScopeWriteGuard.apply - an empty branch', () => {
  const assign = (opts: { scope: TWhere; row: Record<string, unknown> }) => {
    return ScopeWriteGuard.apply({
      settings: { resolve: () => opts.scope, write: { mode: ScopeWriteGuards.ASSIGN } },
      model: 'items',
      rows: [opts.row],
      operation: ScopeOperations.CREATE,
    });
  };

  test('a branch with an empty intersection drops out, so assign fills from the one left', () => {
    const scope = {
      and: [
        {
          or: [
            { m: 'a', o: 'x' },
            { m: 'b', o: 'y' },
          ],
        },
        { m: 'a' },
      ],
    };

    expect(assign({ scope, row: { name: 'n' } })).toEqual([{ name: 'n', m: 'a', o: 'x' }]);
  });

  test('two branches that both fit fill nothing', () => {
    const scope = {
      or: [
        { m: 'a', o: 'x' },
        { m: 'b', o: 'y' },
      ],
    };

    expect(() => assign({ scope, row: { name: 'n' } })).toThrow(/satisfies no branch/);
  });
});
