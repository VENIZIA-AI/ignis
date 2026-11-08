import { RejectionHelper } from '@venizia/dev-configs/testing';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { RepositoryErrorCodes, ScopeOperations } from '@venizia/ignis-kernel';
import type { TScopeOperation } from '@venizia/ignis-kernel';
import { describe, expect, spyOn, test } from 'bun:test';

/** `deletedAt` on a real engine. Seed: 1 `A` and 3 `C` are merchant `m1`'s, 2 `B` is `m2`'s; all open and alive. */
export interface ISoftDeleteDataRow {
  id: number;
  merchantId: string;
  code: string;
  status: string;
  isDeleted: boolean;
}

export interface ISoftDeleteDataContext {
  items: AnyType;
  /** The same table, through a repository that does not soft delete. */
  plain: AnyType;
  /** The soft-deletable repository of a model with no scope and no default filter. */
  open: AnyType;
  codeKey: AnyType;
  /** The query executor every repository of the engine shares, to count the statements a call runs. */
  executor: AnyType;
  /** Every row, read with the raw client: what is really stored, past every scope. */
  rawRows: () => Promise<ISoftDeleteDataRow[]>;
  reset: () => Promise<void>;
  setResolver: (resolver: (context: { operation: TScopeOperation }) => AnyType) => void;
}

const ME = 'm1';
const OTHER = 'm2';
const MINE = { merchantId: ME };

const DELETED_AT_COLUMN = 'deleted_at';

const MESSAGE = 'deletedAt changes only through deleteById/deleteBy and restoreById/restoreBy';

const DELETED_AT_DATA: ReadonlyArray<{ title: string; data: () => Record<string, unknown> }> = [
  { title: 'a date under the property name', data: () => ({ deletedAt: new Date() }) },
  { title: 'null under the property name', data: () => ({ deletedAt: null }) },
];

const codeOf = (error: unknown): unknown => {
  return isApplicationError(error) ? error.normalized.code : undefined;
};

const statusOf = (error: unknown): unknown => {
  return isApplicationError(error) ? error.statusCode : undefined;
};

const messageOf = (error: unknown): string => {
  return error instanceof Error ? error.message : '';
};

export const defineSoftDeleteDataCases = (context: () => ISoftDeleteDataContext): void => {
  const setup = async (): Promise<ISoftDeleteDataContext> => {
    const ctx = context();
    await ctx.reset();
    ctx.setResolver(() => MINE);

    return ctx;
  };

  const rowOf = async (opts: { ctx: ISoftDeleteDataContext; code: string }) => {
    const rows = await opts.ctx.rawRows();

    return rows.find((row) => row.code === opts.code);
  };

  const expectRow = async (opts: {
    ctx: ISoftDeleteDataContext;
    code: string;
    row: Partial<ISoftDeleteDataRow>;
  }) => {
    const row = await rowOf(opts);

    expect(row).toMatchObject(opts.row);
  };

  const deletedCountOf = async (opts: { ctx: ISoftDeleteDataContext }) => {
    const rows = await opts.ctx.rawRows();

    return rows.filter((row) => row.isDeleted).length;
  };

  const expectBadRequest = async (opts: {
    ctx: ISoftDeleteDataContext;
    task: () => Promise<unknown>;
  }) => {
    const before = await opts.ctx.rawRows();

    const error = await RejectionHelper.rejectionOf({ task: opts.task() });

    expect(statusOf(error)).toBe(400);

    const after = await opts.ctx.rawRows();

    expect(after).toEqual(before);

    return error;
  };

  const expectRefused = async (opts: {
    ctx: ISoftDeleteDataContext;
    task: () => Promise<unknown>;
    message?: string;
  }) => {
    const error = await expectBadRequest(opts);

    expect(messageOf(error)).toContain(opts.message ?? MESSAGE);
  };

  describe('an ordinary update or upsert refuses deletedAt', () => {
    for (const { title, data } of DELETED_AT_DATA) {
      test(`updateById refuses ${title}`, async () => {
        const ctx = await setup();

        await expectRefused({ ctx, task: () => ctx.items.updateById({ id: 1, data: data() }) });
      });

      test(`updateBy refuses ${title}`, async () => {
        const ctx = await setup();

        await expectRefused({
          ctx,
          task: () => ctx.items.updateBy({ where: MINE, data: data() }),
        });
      });

      test(`updateEach refuses ${title} in any row, and updates no row`, async () => {
        const ctx = await setup();

        await expectRefused({
          ctx,
          task: () =>
            ctx.items.updateEach({
              rows: [
                { id: 1, data: { status: 'closed' } },
                { id: 3, data: data() },
              ],
            }),
        });
      });

      test(`upsert refuses ${title}`, async () => {
        const ctx = await setup();

        await expectRefused({
          ctx,
          task: () =>
            ctx.items.upsert({
              data: { merchantId: ME, code: 'A', ...data() },
              on: ctx.codeKey,
            }),
        });
      });
    }

    test('the column name is no way round it: an update answers 400, an upsert ignores the key', async () => {
      const ctx = await setup();
      const data = { [DELETED_AT_COLUMN]: new Date() };

      await expectBadRequest({ ctx, task: () => ctx.items.updateById({ id: 1, data }) });
      await expectBadRequest({ ctx, task: () => ctx.items.updateBy({ where: MINE, data }) });
      await expectBadRequest({
        ctx,
        task: () => ctx.items.updateEach({ rows: [{ id: 1, data }] }),
      });

      await ctx.items.upsert({ data: { merchantId: ME, code: 'A', ...data }, on: ctx.codeKey });

      await expectRow({ ctx, code: 'A', row: { isDeleted: false } });
    });

    test('an update without deletedAt still works', async () => {
      const ctx = await setup();

      const rs = await ctx.items.updateById({ id: 1, data: { status: 'closed' } });

      expect(rs.count).toBe(1);
      await expectRow({ ctx, code: 'A', row: { status: 'closed', isDeleted: false } });
    });

    test('a repository that does not soft delete still writes deletedAt', async () => {
      const ctx = await setup();

      const rs = await ctx.plain.updateById({ id: 1, data: { deletedAt: new Date() } });

      expect(rs.count).toBe(1);
      await expectRow({ ctx, code: 'A', row: { isDeleted: true } });
    });
  });

  describe('the whole table is where: {} with options.force', () => {
    test('updateBy, deleteBy and restoreBy refuse an empty where without force, and change nothing', async () => {
      const ctx = await setup();
      const before = await ctx.rawRows();

      for (const task of [
        () => ctx.open.updateBy({ where: {}, data: { status: 'closed' } }),
        () => ctx.open.deleteBy({ where: {} }),
        () => ctx.open.restoreBy({ where: {} }),
      ]) {
        const error = await RejectionHelper.rejectionOf({ task: task() });

        expect(messageOf(error)).toContain('Empty where condition');
      }

      const after = await ctx.rawRows();

      expect(after).toEqual(before);
    });

    test('with force they reach every row of the table', async () => {
      const ctx = await setup();

      const updated = await ctx.open.updateBy({
        where: {},
        data: { status: 'closed' },
        options: { force: true },
      });

      expect(updated.count).toBe(3);

      const deleted = await ctx.open.deleteBy({ where: {}, options: { force: true } });

      expect(deleted.count).toBe(3);

      const deletedRows = await deletedCountOf({ ctx });

      expect(deletedRows).toBe(3);

      const restored = await ctx.open.restoreBy({ where: {}, options: { force: true } });

      expect(restored.count).toBe(3);

      const remainingRows = await deletedCountOf({ ctx });

      expect(remainingRows).toBe(0);
    });
  });

  describe('a soft delete writes extra columns in the same statement', () => {
    test('deleteById writes status and deletedAt in one UPDATE', async () => {
      const ctx = await setup();
      const update = spyOn(ctx.executor, 'update');

      const rs = await ctx.items.deleteById({ id: 1, data: { status: 'closed' } });

      expect(rs.count).toBe(1);
      expect(update).toHaveBeenCalledTimes(1);
      update.mockRestore();
      await expectRow({ ctx, code: 'A', row: { status: 'closed', isDeleted: true } });
      await expectRow({ ctx, code: 'C', row: { status: 'open', isDeleted: false } });
    });

    test('deleteBy writes the data on every matched row and no other', async () => {
      const ctx = await setup();

      const all = await ctx.items.deleteBy({ where: { code: 'A' }, data: { status: 'closed' } });

      expect(all.count).toBe(1);

      const by = await ctx.items.deleteBy({ where: { code: 'C' }, data: { status: 'archived' } });

      expect(by.count).toBe(1);
      const rows = await ctx.rawRows();

      expect(rows).toEqual([
        { id: 1, merchantId: ME, code: 'A', status: 'closed', isDeleted: true },
        { id: 2, merchantId: OTHER, code: 'B', status: 'open', isDeleted: false },
        { id: 3, merchantId: ME, code: 'C', status: 'archived', isDeleted: true },
      ]);
    });

    test('a soft delete without data is what it was', async () => {
      const ctx = await setup();

      const rs = await ctx.items.deleteById({ id: 1 });

      expect(rs.count).toBe(1);
      await expectRow({ ctx, code: 'A', row: { status: 'open', isDeleted: true } });
    });

    test('restoreById and restoreBy still clear deletedAt', async () => {
      const ctx = await setup();

      await ctx.items.deleteBy({ where: MINE, data: { status: 'closed' } });
      const deleted = await deletedCountOf({ ctx });

      expect(deleted).toBe(2);

      const byId = await ctx.items.restoreById({ id: 1 });
      const all = await ctx.items.restoreBy({ where: { code: 'C' } });

      expect(byId.count).toBe(1);
      expect(all.count).toBe(1);
      const remaining = await deletedCountOf({ ctx });

      expect(remaining).toBe(0);

      await ctx.items.deleteById({ id: 1 });

      const by = await ctx.items.restoreBy({ where: { code: 'A' } });

      expect(by.count).toBe(1);
      await expectRow({ ctx, code: 'A', row: { isDeleted: false } });
    });
  });

  describe('the extra data is held to the DELETE scope', () => {
    const expectDenied = async (opts: {
      ctx: ISoftDeleteDataContext;
      task: () => Promise<unknown>;
    }) => {
      const before = await opts.ctx.rawRows();

      const error = await RejectionHelper.rejectionOf({ task: opts.task() });

      expect(codeOf(error)).toBe(RepositoryErrorCodes.SCOPE_WRITE_DENIED);
      expect(statusOf(error)).toBe(403);
      const after = await opts.ctx.rawRows();

      expect(after).toEqual(before);
    };

    test('a merchantId outside the scope is refused with 403 by both soft deletes', async () => {
      const ctx = await setup();

      await expectDenied({
        ctx,
        task: () => ctx.items.deleteById({ id: 1, data: { merchantId: OTHER } }),
      });
      await expectDenied({
        ctx,
        task: () => ctx.items.deleteBy({ where: MINE, data: { merchantId: OTHER } }),
      });
    });

    test('a row outside the scope is not touched', async () => {
      const ctx = await setup();

      const rs = await ctx.items.deleteById({ id: 2, data: { status: 'closed' } });

      expect(rs.count).toBe(0);
      await expectRow({ ctx, code: 'B', row: { status: 'open', isDeleted: false } });
    });

    test('the data is checked against what DELETE may write, not what UPDATE may', async () => {
      const ctx = await setup();

      ctx.setResolver(({ operation }) =>
        operation === ScopeOperations.DELETE ? { merchantId: ME, status: 'open' } : MINE,
      );

      await expectDenied({
        ctx,
        task: () => ctx.items.deleteById({ id: 1, data: { status: 'closed' } }),
      });

      const rs = await ctx.items.updateById({ id: 1, data: { status: 'closed' } });

      expect(rs.count).toBe(1);
    });

    test('a soft delete is resolved as DELETE', async () => {
      const ctx = await setup();
      const seen: Array<TScopeOperation> = [];

      ctx.setResolver(({ operation }) => {
        seen.push(operation);

        return MINE;
      });

      await ctx.items.deleteById({ id: 1, data: { status: 'closed' } });

      expect(seen).toContain(ScopeOperations.DELETE);
      expect(seen).not.toContain(ScopeOperations.UPDATE);
    });
  });

  describe('a soft delete refuses data it cannot write', () => {
    for (const { title, data } of DELETED_AT_DATA) {
      test(`deleteById and deleteBy refuse ${title}`, async () => {
        const ctx = await setup();

        await expectRefused({
          ctx,
          task: () => ctx.items.deleteById({ id: 1, data: data() }),
        });
        await expectRefused({
          ctx,
          task: () => ctx.items.deleteBy({ where: MINE, data: data() }),
        });
      });
    }

    test('the column name is no way round it for a soft delete either', async () => {
      const ctx = await setup();
      const data = { [DELETED_AT_COLUMN]: new Date() };

      await expectBadRequest({ ctx, task: () => ctx.items.deleteById({ id: 1, data }) });
      await expectBadRequest({ ctx, task: () => ctx.items.deleteBy({ where: MINE, data }) });
    });

    test('data that moves the id is refused, so a soft delete cannot change the key', async () => {
      const ctx = await setup();
      const message = 'data of a soft delete cannot change the id';

      await expectRefused({
        ctx,
        message,
        task: () => ctx.items.deleteById({ id: 1, data: { id: 99 } }),
      });
      await expectRefused({
        ctx,
        message,
        task: () => ctx.items.deleteBy({ where: MINE, data: { id: 99 } }),
      });
    });

    test('a hard delete refuses data and deletes nothing', async () => {
      const ctx = await setup();
      const message =
        'data is written by a soft delete; it cannot be combined with shouldHardDelete';

      await expectRefused({
        ctx,
        message,
        task: () =>
          ctx.items.deleteById({
            id: 1,
            data: { status: 'closed' },
            options: { shouldHardDelete: true },
          }),
      });
      await expectRefused({
        ctx,
        message,
        task: () =>
          ctx.items.deleteBy({
            where: MINE,
            data: { status: 'closed' },
            options: { shouldHardDelete: true },
          }),
      });
    });

    test('a hard delete without data still removes the row', async () => {
      const ctx = await setup();

      const rs = await ctx.items.deleteById({ id: 1, options: { shouldHardDelete: true } });

      expect(rs.count).toBe(1);
      const rows = await ctx.rawRows();

      expect(rows).toHaveLength(2);
    });
  });
};
