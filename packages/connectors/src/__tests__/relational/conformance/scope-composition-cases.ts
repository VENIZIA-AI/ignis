import { ScopeFilters } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';

/**
 * The access scope is a condition the caller can only NARROW. These cases run against both engines
 * (`pglite-scope-composition.test.ts`, `libsql-scope-composition.test.ts`): every scope shape against every caller `where`
 * on the same columns, for read, count, findOne, update and delete, plus an include and a `through` child.
 */

interface IRow {
  merchantId: string | null;
  region: string;
  name: string;
}

export const ROWS: IRow[] = [
  { merchantId: 'm1', region: 'east', name: 'p1' },
  { merchantId: 'm1', region: 'west', name: 'p2' },
  { merchantId: 'm2', region: 'east', name: 'p3' },
  { merchantId: 'm2', region: 'west', name: 'p4' },
  { merchantId: null, region: 'east', name: 'p5' },
];

interface IScopeCase {
  label: string;
  scope: AnyType;
  /** Rows the scope lets the caller READ. */
  reads: (row: IRow) => boolean;
  /** Rows an update or a delete may reach: the shared (null) rows need `write.sharedRows`, which is off here. */
  writes: (row: IRow) => boolean;
}

export const SCOPES: IScopeCase[] = [
  {
    label: 'a bare scalar',
    scope: { merchantId: 'm1' },
    reads: (row) => row.merchantId === 'm1',
    writes: (row) => row.merchantId === 'm1',
  },
  {
    label: 'an inq operator',
    scope: { merchantId: { inq: ['m1'] } },
    reads: (row) => row.merchantId === 'm1',
    writes: (row) => row.merchantId === 'm1',
  },
  {
    label: 'a top-level or with a null branch',
    scope: { or: [{ merchantId: { inq: ['m1'] } }, { merchantId: null }] },
    reads: (row) => row.merchantId === 'm1' || row.merchantId === null,
    writes: (row) => row.merchantId === 'm1',
  },
  {
    label: 'a null inside an inq list (matches nothing, as in SQL)',
    scope: { merchantId: { inq: [null] } },
    reads: () => false,
    writes: () => false,
  },
  {
    label: 'a null beside a value inside an inq list',
    scope: { merchantId: { inq: ['m1', null] } },
    reads: (row) => row.merchantId === 'm1',
    writes: (row) => row.merchantId === 'm1',
  },
  {
    label: 'eq null',
    scope: { merchantId: { eq: null } },
    reads: (row) => row.merchantId === null,
    writes: () => false,
  },
  {
    label: 'a bare null',
    scope: { merchantId: null },
    reads: (row) => row.merchantId === null,
    writes: () => false,
  },
  {
    label: 'a top-level and',
    scope: { and: [{ merchantId: 'm1' }, { region: 'east' }] },
    reads: (row) => row.merchantId === 'm1' && row.region === 'east',
    writes: (row) => row.merchantId === 'm1' && row.region === 'east',
  },
];

interface IAttackCase {
  label: string;
  where: AnyType;
  matches: (row: IRow) => boolean;
}

export const ATTACKS: IAttackCase[] = [
  { label: 'no where', where: {}, matches: () => true },
  {
    label: 'a scalar on the scope column',
    where: { merchantId: 'm2' },
    matches: (r) => r.merchantId === 'm2',
  },
  {
    label: 'a scalar on the scope column, naming the scope value',
    where: { merchantId: 'm1' },
    matches: (r) => r.merchantId === 'm1',
  },
  {
    label: 'an inq on the scope column',
    where: { merchantId: { inq: ['m2'] } },
    matches: (r) => r.merchantId === 'm2',
  },
  {
    label: 'null on the scope column',
    where: { merchantId: null },
    matches: (r) => r.merchantId === null,
  },
  {
    label: 'a top-level or',
    where: { or: [{ merchantId: 'm2' }, { merchantId: null }] },
    matches: (r) => r.merchantId === 'm2' || r.merchantId === null,
  },
  {
    label: 'a top-level and',
    where: { and: [{ merchantId: 'm2' }] },
    matches: (r) => r.merchantId === 'm2',
  },
  {
    label: 'a scalar on the other scope column',
    where: { region: 'west' },
    matches: (r) => r.region === 'west',
  },
  {
    label: 'an or beside a scalar',
    where: { or: [{ merchantId: 'm2' }], region: 'east' },
    matches: (r) => r.merchantId === 'm2' && r.region === 'east',
  },
];

export interface IScopeCompositionContext {
  products: AnyType;
  notes: AnyType;
  variants: AnyType;
  setProductScope: (scope: AnyType) => void;
  setNoteScope: (scope: AnyType) => void;
  /** Truncates and seeds `ROWS` into the product table, then two notes per product (merchant of the parent). */
  reset: () => Promise<void>;
  /** The product names still in the table, in id order. */
  productNames: () => Promise<string[]>;
  /** The product names whose name is `renamed`. */
  renamedNames: () => Promise<string[]>;
}

const names = (rows: AnyType[]): string[] => rows.map((row) => row.name).sort();

const expectedNames = (opts: { allowed: (row: IRow) => boolean; attack: IAttackCase }) => {
  return ROWS.filter((row) => opts.allowed(row) && opts.attack.matches(row))
    .map((row) => row.name)
    .sort();
};

export const defineScopeCompositionCases = (context: () => IScopeCompositionContext): void => {
  for (const scopeCase of SCOPES) {
    describe(`scope: ${scopeCase.label}`, () => {
      for (const attack of ATTACKS) {
        describe(`caller where: ${attack.label}`, () => {
          test('find and count return only rows inside the scope that the caller also asked for', async () => {
            const ctx = context();
            await ctx.reset();
            ctx.setProductScope(scopeCase.scope);

            const expected = expectedNames({ allowed: scopeCase.reads, attack });
            const found = await ctx.products.find({ filter: { where: attack.where } });
            const counted = await ctx.products.count({ where: attack.where });

            expect(names(found)).toEqual(expected);
            expect(counted.count).toBe(expected.length);
          });

          test('findOne never returns a row outside the scope', async () => {
            const ctx = context();
            await ctx.reset();
            ctx.setProductScope(scopeCase.scope);

            const expected = expectedNames({ allowed: scopeCase.reads, attack });
            const one = await ctx.products.findOne({ filter: { where: attack.where } });

            expect(one === null ? 0 : 1).toBe(expected.length === 0 ? 0 : 1);

            if (one !== null) {
              expect(expected).toContain(one.name);
            }
          });

          test('updateBy changes only rows the scope lets the caller write', async () => {
            const ctx = context();
            await ctx.reset();
            ctx.setProductScope(scopeCase.scope);

            const expected = expectedNames({ allowed: scopeCase.writes, attack });
            const result = await ctx.products.updateBy({
              where: attack.where,
              data: { name: 'renamed' },
              options: { shouldReturn: false },
            });

            expect(result.count).toBe(expected.length);
            const result2 = await ctx.renamedNames();
            expect(result2).toHaveLength(expected.length);
            const result3 = await ctx.productNames();
            expect(result3.filter((name) => name !== 'renamed')).toEqual(
              ROWS.map((row) => row.name)
                .filter((name) => !expected.includes(name))
                .sort(),
            );
          });

          test('deleteBy removes only rows the scope lets the caller write', async () => {
            const ctx = context();
            await ctx.reset();
            ctx.setProductScope(scopeCase.scope);

            const expected = expectedNames({ allowed: scopeCase.writes, attack });
            const result = await ctx.products.deleteBy({
              where: attack.where,
              options: { shouldReturn: false },
            });

            expect(result.count).toBe(expected.length);
            const result4 = await ctx.productNames();
            expect(result4.sort()).toEqual(
              ROWS.map((row) => row.name)
                .filter((name) => !expected.includes(name))
                .sort(),
            );
          });
        });
      }
    });
  }

  describe('an included relation with a bare-scalar scope', () => {
    test("include scope.where on the scope column cannot reach another merchant's children", async () => {
      const ctx = context();
      await ctx.reset();
      ctx.setProductScope(ScopeFilters.UNRESTRICTED);
      ctx.setNoteScope({ merchantId: 'm1' });

      const plain = await ctx.products.find({
        filter: { include: [{ relation: 'notes' }] },
      });
      const attacked = await ctx.products.find({
        filter: { include: [{ relation: 'notes', scope: { where: { merchantId: 'm2' } } }] },
      });
      const merchants = (rows: AnyType[]) => [
        ...new Set(
          rows.flatMap((row) => (row.notes ?? []).map((note: AnyType) => note.merchantId)),
        ),
      ];

      expect(merchants(plain)).toEqual(['m1']);
      expect(merchants(attacked)).toEqual([]);
    });
  });

  describe('a through child', () => {
    test("a caller where on the foreign key cannot reach another merchant's parent", async () => {
      const ctx = context();
      await ctx.reset();
      ctx.setProductScope({ merchantId: 'm1' });

      const mine = await ctx.variants.find({ filter: {} });
      const foreignParent = await ctx.variants.find({
        filter: { where: { productId: { inq: [3, 4] } } },
      });

      expect(names(mine)).toEqual(['v1', 'v2', 'v3', 'v4']);
      expect(foreignParent).toEqual([]);
    });
  });
};
