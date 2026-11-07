import type { AnyType } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { RepositoryErrorCodes, ScopeOperations, type TScopeOperation } from '@venizia/ignis-kernel';
import { beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

/**
 * An ordinary update that sets `deletedAt` on a soft-deletable repository is checked by the access scope as a DELETE;
 * one that sets it to `null` as an UPDATE, as a restore is. The cases run against both engines
 * (`pglite-soft-delete-update.test.ts`, `libsql-soft-delete-update.test.ts`).
 */
export interface ISoftDeleteUpdateRow {
  id: number;
  merchantId: string;
  name: string;
  isDeleted: boolean;
}

export interface ISoftDeleteUpdateContext {
  /** A soft-deletable repository of the table. */
  soft: AnyType;
  /** A plain CRUD repository of the same table and model. */
  plain: AnyType;
  /** An SQL expression the engine accepts as a `deleted_at` value. */
  now: AnyType;
  /** Every row, read with the raw client, past every scope. */
  rawRows: () => Promise<ISoftDeleteUpdateRow[]>;
  /** Seeds: 1 `a` and 3 `c` of m1, 2 `b` of m2, 4 `d` of m1 soft deleted. */
  reset: () => Promise<void>;
}

const ME = 'm1';
/** The database name of the `deletedAt` column. */
const COLUMN_NAME = 'deleted_at';
const MINE = { merchantId: ME };

/** May update its own rows, may not delete any. */
const UPDATE_ONLY = ({ operation }: { operation: TScopeOperation }) => {
  return operation === ScopeOperations.DELETE ? null : MINE;
};

/** May read, create, update and delete its own rows. */
const FULL = () => MINE;

/** May update the rows of m1 and m2, delete only those of m1. */
const WIDE_UPDATE = ({ operation }: { operation: TScopeOperation }) => {
  return operation === ScopeOperations.UPDATE ? { merchantId: { inq: [ME, 'm2'] } } : MINE;
};

const SEEDED: ISoftDeleteUpdateRow[] = [
  { id: 1, merchantId: ME, name: 'a', isDeleted: false },
  { id: 2, merchantId: 'm2', name: 'b', isDeleted: false },
  { id: 3, merchantId: ME, name: 'c', isDeleted: false },
  { id: 4, merchantId: ME, name: 'd', isDeleted: true },
];

const failure = async (task: () => Promise<unknown>): Promise<unknown> => {
  try {
    await task();
  } catch (error) {
    return error;
  }

  return undefined;
};

export class SoftDeleteUpdateCases {
  private static calls: TScopeOperation[] = [];
  private static resolver: (context: { operation: TScopeOperation }) => AnyType = FULL;

  /** The model's `access.resolve`: records the operation, then answers with the role under test. */
  static resolve(context: { operation: TScopeOperation }): AnyType {
    SoftDeleteUpdateCases.calls.push(context.operation);

    return SoftDeleteUpdateCases.resolver(context);
  }

  static define(context: () => ISoftDeleteUpdateContext): void {
    const cases = SoftDeleteUpdateCases;
    let ctx: ISoftDeleteUpdateContext;

    const expectUnchanged = async () => {
      const rows = await ctx.rawRows();

      expect(rows).toEqual(SEEDED);
    };

    const expectDeleted = async (ids: number[]) => {
      const rows = await ctx.rawRows();

      expect(rows.filter((row) => row.isDeleted).map((row) => row.id)).toEqual(ids);
    };

    const actAs = (resolver: typeof cases.resolver) => {
      cases.resolver = resolver;
      cases.calls = [];
    };

    const expectChecked = (operation: TScopeOperation) => {
      const other =
        operation === ScopeOperations.DELETE ? ScopeOperations.UPDATE : ScopeOperations.DELETE;

      expect(cases.calls).toContain(operation);
      expect(cases.calls).not.toContain(other);
    };

    beforeEach(async () => {
      ctx = context();
      await ctx.reset();
      actAs(FULL);
    });

    describe('a role that may update but not delete', () => {
      beforeEach(() => actAs(UPDATE_ONLY));

      test('updateById setting deletedAt is checked as a delete and changes nothing', async () => {
        const rs = await ctx.soft.updateById({ id: 1, data: { deletedAt: new Date() } });

        expect(rs.count).toBe(0);
        expectChecked(ScopeOperations.DELETE);
        await expectUnchanged();
      });

      test('updateBy over many rows setting deletedAt changes nothing', async () => {
        const rs = await ctx.soft.updateBy({
          where: { merchantId: ME },
          data: { deletedAt: new Date(), name: 'gone' },
        });

        expect(rs.count).toBe(0);
        expectChecked(ScopeOperations.DELETE);
        await expectUnchanged();
      });

      test('updateEach setting deletedAt changes nothing', async () => {
        const rs = await ctx.soft.updateEach({
          rows: [{ id: 1, data: { deletedAt: new Date() } }],
        });

        expect(rs.count).toBe(0);
        expectChecked(ScopeOperations.DELETE);
        await expectUnchanged();
      });

      test('an upsert whose update branch sets deletedAt is refused with the write-denied 403', async () => {
        const error = await failure(() =>
          ctx.soft.upsert({ data: { id: 1, merchantId: ME, name: 'a', deletedAt: new Date() } }),
        );

        expect(isApplicationError(error)).toBe(true);
        expect(isApplicationError(error) ? error.statusCode : undefined).toBe(403);
        expect(isApplicationError(error) ? error.normalized.code : undefined).toBe(
          RepositoryErrorCodes.SCOPE_WRITE_DENIED,
        );
        expect(isApplicationError(error) ? error.message : '').toContain('[delete]');
        expect(cases.calls).toContain(ScopeOperations.DELETE);
        expect(cases.calls).not.toContain(ScopeOperations.UPDATE);
        await expectUnchanged();
      });

      test('an upsert that names deletedAt only through update is refused too', async () => {
        const error = await failure(() =>
          ctx.soft.upsert({
            data: { id: 1, merchantId: ME, name: 'a', deletedAt: new Date() },
            update: ['deletedAt'],
          }),
        );

        expect(isApplicationError(error) ? error.statusCode : undefined).toBe(403);
        await expectUnchanged();
      });

      test('the column name is checked as a delete too, and writes nothing', async () => {
        const error = await failure(() =>
          ctx.soft.updateById({ id: 1, data: { [COLUMN_NAME]: new Date() } }),
        );

        expect(error).toBeDefined();
        expectChecked(ScopeOperations.DELETE);
        await expectUnchanged();
      });

      test('a path on the column is checked as a delete too, and writes nothing', async () => {
        const error = await failure(() =>
          ctx.soft.updateById({ id: 1, data: { 'deletedAt.at': '2026-01-01' } }),
        );

        expect(error).toBeDefined();
        expectChecked(ScopeOperations.DELETE);
        await expectUnchanged();
      });

      test('a deletedAt inherited by the data object is checked as a delete', async () => {
        const data = Object.create({ deletedAt: new Date() });
        const rs = await ctx.soft.updateById({ id: 1, data });

        expect(rs.count).toBe(0);
        expectChecked(ScopeOperations.DELETE);
        await expectUnchanged();
      });

      test('an SQL expression is checked as a delete, a NULL expression included', async () => {
        for (const deletedAt of [ctx.now, sql`NULL`]) {
          actAs(UPDATE_ONLY);

          const rs = await ctx.soft.updateById({ id: 1, data: { deletedAt } });

          expect(rs.count).toBe(0);
          expectChecked(ScopeOperations.DELETE);
        }

        await expectUnchanged();
      });

      test('false, 0 and an empty string are checked as a delete', async () => {
        for (const deletedAt of [false, 0, '']) {
          actAs(UPDATE_ONLY);

          await failure(() => ctx.soft.updateById({ id: 1, data: { deletedAt } }));

          expectChecked(ScopeOperations.DELETE);
        }

        await expectUnchanged();
      });

      test('null beside a set value is checked as a delete', async () => {
        const error = await failure(() =>
          ctx.soft.updateById({ id: 1, data: { deletedAt: null, [COLUMN_NAME]: new Date() } }),
        );

        expect(error).toBeDefined();
        expectChecked(ScopeOperations.DELETE);
        await expectUnchanged();
      });

      test('positive control: the same role updates other columns through every entry point', async () => {
        const byId = await ctx.soft.updateById({ id: 1, data: { name: 'a2' } });
        const by = await ctx.soft.updateBy({ where: { id: 3 }, data: { name: 'c2' } });
        const each = await ctx.soft.updateEach({ rows: [{ id: 1, data: { name: 'a3' } }] });
        const upserted = await ctx.soft.upsert({ data: { id: 3, merchantId: ME, name: 'c3' } });

        expect([byId.count, by.count, each.count, upserted.count]).toEqual([1, 1, 1, 1]);
        expectChecked(ScopeOperations.UPDATE);

        const rows = await ctx.rawRows();
        expect(rows.map((row) => row.name)).toEqual(['a3', 'b', 'c3', 'd']);
        await expectDeleted([4]);
      });

      test('a deletedAt left undefined is not a write: the update is checked as an update', async () => {
        const rs = await ctx.soft.updateById({ id: 1, data: { name: 'a2', deletedAt: undefined } });

        expect(rs.count).toBe(1);
        expectChecked(ScopeOperations.UPDATE);
        await expectDeleted([4]);
      });

      test('null restores and is checked as an update, as restoreById is', async () => {
        const rs = await ctx.soft.updateById({
          id: 4,
          data: { deletedAt: null },
          options: { shouldSkipDefaultFilter: true },
        });

        expect(rs.count).toBe(1);
        expectChecked(ScopeOperations.UPDATE);
        await expectDeleted([]);
      });
    });

    describe('a role that may delete', () => {
      test('soft deletes through updateById, updateBy, updateEach and upsert', async () => {
        await ctx.soft.updateById({ id: 1, data: { deletedAt: new Date() } });
        await ctx.soft.updateBy({ where: { id: 3 }, data: { deletedAt: ctx.now } });

        expectChecked(ScopeOperations.DELETE);
        await expectDeleted([1, 3, 4]);

        await ctx.reset();
        actAs(FULL);

        await ctx.soft.updateEach({ rows: [{ id: 1, data: { deletedAt: new Date() } }] });
        await ctx.soft.upsert({
          data: { id: 3, merchantId: ME, name: 'c', deletedAt: new Date() },
        });

        expect(cases.calls).toContain(ScopeOperations.DELETE);
        await expectDeleted([1, 3, 4]);
      });

      test('a deletedAt inherited by the data object is written', async () => {
        const rs = await ctx.soft.updateById({
          id: 1,
          data: Object.create({ deletedAt: new Date() }),
        });

        expect(rs.count).toBe(1);
        await expectDeleted([1, 4]);
      });
    });

    describe('the written row and the selected rows are held to the DELETE scope', () => {
      beforeEach(() => actAs(WIDE_UPDATE));

      test('updateBy setting deletedAt reaches only the rows the DELETE scope allows', async () => {
        await ctx.soft.updateBy({
          where: { name: { inq: ['a', 'b', 'c'] } },
          data: { deletedAt: new Date() },
        });

        expectChecked(ScopeOperations.DELETE);
        await expectDeleted([1, 3, 4]);
      });

      test('positive control: an update of another column reaches the rows of both merchants', async () => {
        await ctx.soft.updateBy({ where: { name: { inq: ['a', 'b', 'c'] } }, data: { name: 'x' } });

        const rows = await ctx.rawRows();
        expect(rows.map((row) => row.name)).toEqual(['x', 'x', 'x', 'd']);
      });

      test('a written scope column outside the DELETE scope is refused by the write guard', async () => {
        const error = await failure(() =>
          ctx.soft.updateById({ id: 2, data: { merchantId: 'm2', deletedAt: new Date() } }),
        );

        expect(isApplicationError(error) ? error.normalized.code : undefined).toBe(
          RepositoryErrorCodes.SCOPE_WRITE_DENIED,
        );
        expect(isApplicationError(error) ? error.message : '').toContain('[delete]');
        await expectUnchanged();
      });
    });

    describe('a repository without soft delete', () => {
      test('setting deletedAt stays an update', async () => {
        actAs(UPDATE_ONLY);

        const rs = await ctx.plain.updateById({ id: 1, data: { deletedAt: new Date() } });

        expect(rs.count).toBe(1);
        expectChecked(ScopeOperations.UPDATE);
        await expectDeleted([1, 4]);
      });
    });
  }
}
