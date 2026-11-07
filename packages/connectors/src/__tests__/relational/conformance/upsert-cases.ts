import type { AnyType } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { RepositoryErrorCodes, ScopeOperations } from '@venizia/ignis-kernel';
import type { TScopeOperation } from '@venizia/ignis-kernel';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { describe, expect, spyOn, test } from 'bun:test';

/**
 * `upsert` against a real engine; the cases are shared by `pglite-upsert.test.ts` and `libsql-upsert.test.ts`. The
 * table, in both engines:
 *
 * - `id` primary key; `code` a unique index over all rows (`codeKey`); (`merchant_id`, `slug`) a PARTIAL unique index
 *   over the live rows only (`slugKey`, `WHERE deleted_at IS NULL`); `value` a plain index;
 * - `status` defaults to `'NEW'`; `secret` is hidden by the model; `deleted_at` is the soft delete the default filter
 *   reads; `created_at` has a default, `modified_at` a default and an `$onUpdate` that counts.
 *
 * The seed: 1 `A` mine, 2 `B` another merchant's, 3 `C` mine but soft deleted, 4 `S` shared (no merchant).
 */
export interface IUpsertRow {
  id: number;
  merchantId: string | null;
  code: string;
  slug: string | null;
  name: string | null;
  value: string | null;
  secret: string | null;
  status: string;
  createdAt: string | null;
  modifiedAt: string | null;
  isDeleted: boolean;
}

export interface IUpsertContext {
  /** The scoped model in write mode `reject`: the default filter hides soft-deleted rows, `secret` is hidden. */
  items: AnyType;
  /** The same table and scope, write mode `assign`. */
  assignItems: AnyType;
  codeKey: AnyType;
  slugKey: AnyType;
  /** A key of another table whose columns are named exactly as this one's. */
  foreignKey: AnyType;
  /** The query executor every repository of the engine shares, to prove a refusal runs no SQL. */
  executor: AnyType;
  /** Every row, read with the raw client: what is really stored, past every scope. */
  rawRows: () => Promise<IUpsertRow[]>;
  reset: () => Promise<void>;
  setResolver: (resolver: (context: { operation: TScopeOperation }) => AnyType) => void;
}

const ME = 'm1';
const MINE = { merchantId: ME };

const codeOf = (error: unknown): unknown => {
  return isApplicationError(error) ? error.normalized.code : undefined;
};

const statusOf = (error: unknown): unknown => {
  return isApplicationError(error) ? error.statusCode : undefined;
};

export const defineUpsertCases = (context: () => IUpsertContext): void => {
  const setup = async (): Promise<IUpsertContext> => {
    const ctx = context();
    await ctx.reset();
    ctx.setResolver(() => MINE);

    return ctx;
  };

  const rowOf = async (opts: { ctx: IUpsertContext; code: string }) => {
    const rows = await opts.ctx.rawRows();

    return rows.find((row) => row.code === opts.code);
  };

  /** The call is refused with the write-denied 403 and the table is byte for byte what it was. */
  const expectDenied = async (opts: { ctx: IUpsertContext; task: () => Promise<unknown> }) => {
    const before = await opts.ctx.rawRows();

    const error = await RejectionHelper.rejectionOf({ task: opts.task() });

    expect(codeOf(error)).toBe(RepositoryErrorCodes.SCOPE_WRITE_DENIED);
    expect(statusOf(error)).toBe(403);

    const after = await opts.ctx.rawRows();

    expect(after).toEqual(before);
  };

  describe('upsert - the two branches', () => {
    test('inserts a new row with the column defaults, writes the hidden field and does not return it', async () => {
      const ctx = await setup();

      const rs = await ctx.items.upsert({
        data: { merchantId: ME, code: 'N', name: 'n', value: 'x', secret: 'top' },
        on: ctx.codeKey,
      });

      expect(rs.count).toBe(1);
      expect(rs.data).toMatchObject({ id: 5, merchantId: ME, code: 'N', status: 'NEW' });
      expect(rs.data).not.toHaveProperty('secret');

      const stored = await rowOf({ ctx, code: 'N' });
      const rows = await ctx.rawRows();

      expect(stored).toMatchObject({
        secret: 'top',
        status: 'NEW',
        createdAt: 'created',
        modifiedAt: 'created',
      });
      expect(rows).toHaveLength(5);
    });

    test('updates the row that holds the key: modifiedAt moves, createdAt and unsent columns stay', async () => {
      const ctx = await setup();

      const rs = await ctx.items.upsert({
        data: { merchantId: ME, code: 'A', value: 'new', secret: 'rotated', createdAt: 'forged' },
        on: ctx.codeKey,
      });

      expect(rs.count).toBe(1);
      expect(rs.data).toMatchObject({ id: 1, code: 'A', name: 'a', value: 'new', status: 'OLD' });
      expect(rs.data).not.toHaveProperty('secret');

      const stored = await rowOf({ ctx, code: 'A' });
      const rows = await ctx.rawRows();

      expect(stored).toMatchObject({ id: 1, value: 'new', secret: 'rotated', createdAt: 'seed' });
      expect(stored?.modifiedAt).toMatch(/^updated-\d+$/);
      expect(rows).toHaveLength(4);
    });

    test('`update` limits the columns the update branch writes', async () => {
      const ctx = await setup();

      const rs = await ctx.items.upsert({
        data: { merchantId: ME, code: 'A', name: 'renamed', value: 'new' },
        on: ctx.codeKey,
        update: ['value'],
      });

      expect(rs.data).toMatchObject({ id: 1, name: 'a', value: 'new' });
    });

    test('without `on` the primary key is the key', async () => {
      const ctx = await setup();

      const rs = await ctx.items.upsert({
        data: { id: 1, merchantId: ME, code: 'A', value: 'by-id' },
      });

      expect(rs.data).toMatchObject({ id: 1, value: 'by-id' });
    });

    test('`shouldReturn: false` returns the count of the row written', async () => {
      const ctx = await setup();

      const written = await ctx.items.upsert({
        data: { merchantId: ME, code: 'A', value: 'quiet' },
        on: ctx.codeKey,
        options: { shouldReturn: false },
      });

      expect(written).toEqual({ count: 1, data: null });
    });

    test('eight concurrent upserts of one key leave exactly one row', async () => {
      const ctx = await setup();
      const calls = Array.from({ length: 8 }, (_, index) =>
        ctx.items.upsert({
          data: { merchantId: ME, code: 'N', value: `v${index}` },
          on: ctx.codeKey,
        }),
      );

      const results = await Promise.all(calls);
      const rows = await ctx.rawRows();
      const written = rows.filter((row) => row.code === 'N');

      expect(results.every((rs) => rs.count === 1)).toBe(true);
      expect(written).toHaveLength(1);
      expect(rows).toHaveLength(5);
    });
  });

  describe('upsert - a partial unique index', () => {
    test('a soft-deleted twin is not a conflict: a new row is inserted', async () => {
      const ctx = await setup();

      const rs = await ctx.items.upsert({
        data: { merchantId: ME, slug: 'c', code: 'C2', value: 'reborn' },
        on: ctx.slugKey,
      });
      const rows = await ctx.rawRows();

      expect(rs.data).toMatchObject({ id: 5, slug: 'c', value: 'reborn' });
      expect(rows.filter((row) => row.slug === 'c')).toHaveLength(2);
      expect(rows.find((row) => row.id === 3)).toMatchObject({ value: 'v3', isDeleted: true });
    });

    test('a live row holding the key is updated', async () => {
      const ctx = await setup();

      const rs = await ctx.items.upsert({
        data: { merchantId: ME, slug: 'a', code: 'A', value: 'by-slug' },
        on: ctx.slugKey,
      });
      const rows = await ctx.rawRows();

      expect(rs.data).toMatchObject({ id: 1, value: 'by-slug' });
      expect(rows).toHaveLength(4);
    });

    test('mode `assign` stamps the scope column, so the caller never names it', async () => {
      const ctx = await setup();

      const rs = await ctx.assignItems.upsert({
        data: { slug: 'a', code: 'A', value: 'assigned' },
        on: ctx.slugKey,
      });
      const fresh = await ctx.assignItems.upsert({
        data: { slug: 'n', code: 'N', value: 'fresh' },
        on: ctx.slugKey,
      });

      expect(rs.data).toMatchObject({ id: 1, merchantId: ME, value: 'assigned' });
      expect(fresh.data).toMatchObject({ merchantId: ME, slug: 'n', value: 'fresh' });
    });
  });

  describe('upsert - the access scope', () => {
    test('a new row outside the scope is refused in mode `reject`, and nothing is written', async () => {
      const ctx = await setup();

      await expectDenied({
        ctx,
        task: () =>
          ctx.items.upsert({
            data: { merchantId: 'm2', code: 'N', value: 'x' },
            on: ctx.codeKey,
            // The update branch writes no scope column, so only the CREATE guard can refuse the new row.
            update: ['value'],
          }),
      });
      await expectDenied({
        ctx,
        task: () => ctx.items.upsert({ data: { code: 'N', value: 'x' }, on: ctx.codeKey }),
      });
    });

    test('a new row outside the scope is refused in mode `assign` too, and nothing is written', async () => {
      const ctx = await setup();

      await expectDenied({
        ctx,
        task: () =>
          ctx.assignItems.upsert({
            data: { merchantId: 'm2', code: 'N', value: 'x' },
            on: ctx.codeKey,
            // The update branch writes no scope column, so only the CREATE guard can refuse the new row.
            update: ['value'],
          }),
      });
    });

    test("another merchant's row holding the key is left as it is and the call is refused", async () => {
      const ctx = await setup();

      await expectDenied({
        ctx,
        task: () =>
          ctx.items.upsert({
            data: { merchantId: ME, code: 'B', value: 'stolen', secret: 'stolen' },
            on: ctx.codeKey,
          }),
      });
      await expectDenied({
        ctx,
        task: () =>
          ctx.items.upsert({
            data: { merchantId: ME, code: 'B', value: 'stolen' },
            on: ctx.codeKey,
            options: { shouldReturn: false },
          }),
      });
    });

    test('the update branch is held to the UPDATE scope: it cannot move my row where only a create may go', async () => {
      const ctx = await setup();
      const operations: Array<unknown> = [];

      ctx.setResolver(({ operation }) => {
        operations.push(operation);

        return operation === ScopeOperations.CREATE
          ? { merchantId: { inq: [ME, 'm2'] } }
          : { merchantId: ME };
      });

      await expectDenied({
        ctx,
        task: () =>
          ctx.items.upsert({
            data: { merchantId: 'm2', code: 'A', value: 'moved' },
            on: ctx.codeKey,
          }),
      });
      expect(operations).toEqual([ScopeOperations.CREATE, ScopeOperations.UPDATE]);
    });

    test('a row hidden by the default filter (soft deleted) is not updated, even with shouldSkipDefaultFilter', async () => {
      const ctx = await setup();

      await expectDenied({
        ctx,
        task: () =>
          ctx.items.upsert({
            data: { merchantId: ME, code: 'C', value: 'revived' },
            on: ctx.codeKey,
          }),
      });
      await expectDenied({
        ctx,
        task: () =>
          ctx.items.upsert({
            data: { merchantId: ME, code: 'C', value: 'revived' },
            on: ctx.codeKey,
            options: { shouldSkipDefaultFilter: true },
          }),
      });
    });

    test('a shared row the caller may read is not updated without `write.sharedRows`', async () => {
      const ctx = await setup();

      ctx.setResolver(() => ({ or: [{ merchantId: ME }, { merchantId: null }] }));

      await expectDenied({
        ctx,
        task: () =>
          ctx.items.upsert({
            data: { merchantId: ME, code: 'S', value: 'taken' },
            on: ctx.codeKey,
          }),
      });
    });
  });

  describe('upsert - refused before any guard or SQL', () => {
    const refusals: Array<{
      label: string;
      opts: (ctx: IUpsertContext) => AnyType;
      message: RegExp;
      status: number;
    }> = [
      {
        label: 'a null in a key column',
        opts: (ctx) => ({ data: { merchantId: ME, slug: null, code: 'N' }, on: ctx.slugKey }),
        message: /the key 'upsert_\w+_merchant_slug' needs a value in every column \| column: slug/,
        status: 400,
      },
      {
        label: 'a key of another table',
        opts: (ctx) => ({ data: { merchantId: ME, code: 'A', value: 'x' }, on: ctx.foreignKey }),
        message: /'on' is a key of another table/,
        status: 400,
      },
      {
        label: 'an update column of the key',
        opts: (ctx) => ({
          data: { merchantId: ME, code: 'A', value: 'x' },
          on: ctx.codeKey,
          update: ['code'],
        }),
        message: /'update' names a column of the key 'upsert_\w+_code'/,
        status: 400,
      },
      {
        label: 'an update column that is a creation audit column',
        opts: (ctx) => ({
          data: { merchantId: ME, code: 'A', createdAt: 'x' },
          on: ctx.codeKey,
          update: ['createdAt'],
        }),
        message: /'update' names a creation audit column \| key: 'createdAt'/,
        status: 400,
      },
      {
        label: 'an update column the data does not set',
        opts: (ctx) => ({
          data: { merchantId: ME, code: 'A' },
          on: ctx.codeKey,
          update: ['value'],
        }),
        message: /'update' names a column the data does not set \| key: 'value'/,
        status: 400,
      },
      {
        label: 'an update column that is no column, echoed safely',
        opts: (ctx) => ({
          data: { merchantId: ME, code: 'A' },
          on: ctx.codeKey,
          update: ['nope"; DROP TABLE x;--\n'],
        }),
        message: /'update' names no column of the table \| key: 'nope"; DROP TABLE x;--\\u000a'/,
        status: 400,
      },
      {
        label: 'nothing left to update',
        opts: (ctx) => ({ data: { code: 'A' }, on: ctx.codeKey }),
        message: /nothing to update on a conflict/,
        status: 400,
      },
    ];

    for (const refusal of refusals) {
      test(refusal.label, async () => {
        const ctx = await setup();
        const before = await ctx.rawRows();
        const operations: Array<unknown> = [];
        const insert = spyOn(ctx.executor, 'insert');

        ctx.setResolver(({ operation }) => {
          operations.push(operation);

          return MINE;
        });

        try {
          const error = await RejectionHelper.rejectionOf({
            task: ctx.items.upsert(refusal.opts(ctx)),
          });

          expect(error instanceof Error ? error.message : String(error)).toMatch(refusal.message);
          expect(statusOf(error)).toBe(refusal.status);
          expect(insert).not.toHaveBeenCalled();
        } finally {
          insert.mockRestore();
        }

        expect(operations).toEqual([]);
        const after = await ctx.rawRows();

        expect(after).toEqual(before);
      });
    }

    test('an absent key column is refused once the guard has run, and nothing is written', async () => {
      const ctx = await setup();
      const before = await ctx.rawRows();
      const insert = spyOn(ctx.executor, 'insert');

      try {
        const error = await RejectionHelper.rejectionOf({
          task: ctx.items.upsert({
            data: { merchantId: ME, code: 'N', value: 'x' },
            on: ctx.slugKey,
          }),
        });

        expect(error instanceof Error ? error.message : String(error)).toMatch(
          /needs a value in every column \| column: slug/,
        );
        expect(statusOf(error)).toBe(400);
        expect(insert).not.toHaveBeenCalled();
      } finally {
        insert.mockRestore();
      }

      const after = await ctx.rawRows();

      expect(after).toEqual(before);
    });

    test('mode `assign` fills an absent scope key column before the null check', async () => {
      const ctx = await setup();

      const rs = await ctx.assignItems.upsert({
        data: { slug: 'n', code: 'N', value: 'x' },
        on: ctx.slugKey,
      });

      expect(rs.data).toMatchObject({ merchantId: ME, slug: 'n' });
    });
  });
};
