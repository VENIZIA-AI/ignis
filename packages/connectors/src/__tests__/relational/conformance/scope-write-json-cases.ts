import { RejectionUtility } from '@venizia/dev-configs/testing';
import { describe, expect, test } from 'bun:test';
import type { TScopeResolution } from './scope-resolution';

/**
 * The write side of an access scope on a JSON member (`{ 'meta.merchantId': 'm-a' }`), against a real engine. The cases run
 * on both (`pglite-scope-write-json.test.ts`, `libsql-scope-write-json.test.ts`): the guard decides from the payload, the
 * database decides which rows a read, an update or a delete reaches, and both must agree on every case. Deny first.
 */

export type TJsonScopeMode = 'assign' | 'reject' | 'shared';

export interface IJsonRow {
  meta: Record<string, unknown> | null;
  name: string;
}

export interface IJsonScopeContext {
  setScope(opts: { scope: TScopeResolution }): void;
  reset(): Promise<void>;
  /** Rows written straight to the table, no scope involved. */
  seed(opts: { rows: Array<IJsonRow> }): Promise<void>;
  /** Every row of the table, in id order. */
  rows(): Promise<Array<IJsonRow>>;
  names(opts: { mode: TJsonScopeMode }): Promise<Array<string>>;
  count(opts: { mode: TJsonScopeMode }): Promise<number>;
  create(opts: { mode: TJsonScopeMode; data: { name: string; meta?: unknown } }): Promise<unknown>;
  update(opts: {
    mode: TJsonScopeMode;
    where: Record<string, unknown>;
    data: Record<string, unknown>;
    force?: boolean;
  }): Promise<unknown>;
  remove(opts: {
    mode: TJsonScopeMode;
    where: Record<string, unknown>;
    force?: boolean;
  }): Promise<unknown>;
}

const A_ROWS: Array<IJsonRow> = [
  { meta: { merchantId: 'm-a', tag: 'one' }, name: 'a1' },
  { meta: { merchantId: 'm-a', tag: 'two' }, name: 'a2' },
  { meta: { merchantId: 'm-b', tag: 'one' }, name: 'b1' },
  { meta: { tag: 'no-owner' }, name: 'none' },
];

const SCOPE = { 'meta.merchantId': 'm-a' };

const rejected = (task: Promise<unknown>) => {
  return RejectionUtility.expectRejection({ task, message: /write refused by the access scope/ });
};

export const defineScopeWriteJsonCases = (opts: {
  engine: string;
  context: () => IJsonScopeContext;
}) => {
  const { engine, context } = opts;

  describe(`access on a JSON member, on ${engine}`, () => {
    const start = async (scope: TScopeResolution = SCOPE) => {
      const ctx = context();
      await ctx.reset();
      await ctx.seed({ rows: A_ROWS });
      ctx.setScope({ scope });

      return ctx;
    };

    describe('reads are scoped by the member, and unchanged', () => {
      test('find and count see only the rows of the member value', async () => {
        const ctx = await start();

        const names = await ctx.names({ mode: 'reject' });
        const total = await ctx.count({ mode: 'reject' });

        expect(names).toEqual(['a1', 'a2']);
        expect(total).toBe(2);
      });

      test('an in list and the bracket spelling read the same way', async () => {
        const inList = await start({ 'meta.merchantId': { inq: ['m-a', 'm-b'] } });
        const listed = await inList.names({ mode: 'reject' });

        expect(listed).toEqual(['a1', 'a2', 'b1']);

        const bracket = await start({ 'meta[merchantId]': 'm-b' });
        const bracketed = await bracket.names({ mode: 'reject' });

        expect(bracketed).toEqual(['b1']);
      });
    });

    describe('a create is held to the member', () => {
      test('a foreign value is refused and nothing is written', async () => {
        const ctx = await start();

        await rejected(
          ctx.create({ mode: 'reject', data: { name: 'x', meta: { merchantId: 'm-b' } } }),
        );

        const rows = await ctx.rows();
        expect(rows).toHaveLength(A_ROWS.length);
      });

      test.each([
        ['a column without the key', { name: 'x', meta: { tag: 't' } }],
        ['an absent column', { name: 'x' }],
        ['a null column', { name: 'x', meta: null }],
        ['a null key', { name: 'x', meta: { merchantId: null } }],
        ['a column that is an array', { name: 'x', meta: ['m-a'] }],
        ['a column that is a string', { name: 'x', meta: 'm-a' }],
      ])('%s is refused', async (_label, data) => {
        const ctx = await start();

        await rejected(ctx.create({ mode: 'reject', data }));

        const rows = await ctx.rows();
        expect(rows).toHaveLength(A_ROWS.length);
      });

      test('a value inside the scope is written, and the caller sees it', async () => {
        const ctx = await start();

        await ctx.create({
          mode: 'reject',
          data: { name: 'new', meta: { merchantId: 'm-a', tag: 'n' } },
        });

        const names = await ctx.names({ mode: 'reject' });
        expect(names).toEqual(['a1', 'a2', 'new']);
      });

      test('assign stamps the member into a column that lacks it, and into an absent column', async () => {
        const ctx = await start();

        await ctx.create({ mode: 'assign', data: { name: 'stamped', meta: { tag: 's' } } });
        await ctx.create({ mode: 'assign', data: { name: 'bare' } });

        const rows = await ctx.rows();
        const written = rows.filter((row) => row.name === 'stamped' || row.name === 'bare');

        expect(written).toEqual([
          { name: 'stamped', meta: { tag: 's', merchantId: 'm-a' } },
          { name: 'bare', meta: { merchantId: 'm-a' } },
        ]);
      });

      test('assign never overwrites a present key: a foreign value is refused', async () => {
        const ctx = await start();

        await rejected(
          ctx.create({ mode: 'assign', data: { name: 'x', meta: { merchantId: 'm-b' } } }),
        );
      });

      test('sharedRows lets a row with no member in, and nothing else', async () => {
        const ctx = await start({
          or: [{ 'meta.merchantId': 'm-a' }, { 'meta.merchantId': null }],
        });

        await ctx.create({ mode: 'shared', data: { name: 'unowned', meta: { tag: 'u' } } });
        await rejected(
          ctx.create({ mode: 'shared', data: { name: 'foreign', meta: { merchantId: 'm-b' } } }),
        );
      });
    });

    describe('an update is judged by every key that reaches the column', () => {
      test('moving the member to another merchant, by path, is refused in either spelling', async () => {
        const ctx = await start();

        for (const key of ['meta.merchantId', 'meta[merchantId]']) {
          await rejected(
            ctx.update({ mode: 'reject', where: { name: 'a1' }, data: { [key]: 'm-b' } }),
          );
        }

        const rows = await ctx.rows();
        expect(rows[0]?.meta).toEqual({ merchantId: 'm-a', tag: 'one' });
      });

      test('replacing the whole column without the member, or with a foreign one, is refused', async () => {
        const ctx = await start();

        await rejected(
          ctx.update({ mode: 'reject', where: { name: 'a1' }, data: { meta: { tag: 'x' } } }),
        );
        await rejected(
          ctx.update({
            mode: 'reject',
            where: { name: 'a1' },
            data: { meta: { merchantId: 'm-b' } },
          }),
        );
        await rejected(ctx.update({ mode: 'reject', where: { name: 'a1' }, data: { meta: null } }));

        const rows = await ctx.rows();
        expect(rows[0]?.meta).toEqual({ merchantId: 'm-a', tag: 'one' });
      });

      test('the whole column with a path of it, and a path under the member, are refused', async () => {
        const ctx = await start();

        await rejected(
          ctx.update({
            mode: 'reject',
            where: { name: 'a1' },
            data: { meta: { merchantId: 'm-a' }, 'meta.tag': 'x' },
          }),
        );
        await rejected(
          ctx.update({
            mode: 'reject',
            where: { name: 'a1' },
            data: { 'meta.merchantId.id': 'm-a' },
          }),
        );
      });

      test('another path of the column changes only that path, on the caller rows only', async () => {
        const ctx = await start();

        await ctx.update({
          mode: 'reject',
          where: { 'meta.tag': 'one' },
          data: { 'meta.tag': 'changed' },
        });

        const rows = await ctx.rows();
        expect(rows.map((row) => row.meta)).toEqual([
          { merchantId: 'm-a', tag: 'changed' },
          { merchantId: 'm-a', tag: 'two' },
          { merchantId: 'm-b', tag: 'one' },
          { tag: 'no-owner' },
        ]);
      });

      test('setting the member to its own value, by path or by the whole column, is allowed', async () => {
        const ctx = await start();

        await ctx.update({
          mode: 'reject',
          where: { name: 'a1' },
          data: { 'meta.merchantId': 'm-a' },
        });
        await ctx.update({
          mode: 'reject',
          where: { name: 'a2' },
          data: { meta: { merchantId: 'm-a', tag: 'whole' } },
        });

        const rows = await ctx.rows();
        expect(rows[0]?.meta).toEqual({ merchantId: 'm-a', tag: 'one' });
        expect(rows[1]?.meta).toEqual({ merchantId: 'm-a', tag: 'whole' });
      });

      test('an update reaches only the caller rows: the mutation where holds the member', async () => {
        const ctx = await start();

        await ctx.update({ mode: 'reject', where: {}, data: { name: 'renamed' }, force: true });

        const rows = await ctx.rows();
        expect(rows.map((row) => row.name)).toEqual(['renamed', 'renamed', 'b1', 'none']);
      });
    });

    describe('a delete reaches only the caller rows', () => {
      test('with force, the rows of the member go and the others stay', async () => {
        const ctx = await start();

        await ctx.remove({ mode: 'reject', where: {}, force: true });

        const rows = await ctx.rows();
        expect(rows.map((row) => row.name)).toEqual(['b1', 'none']);
      });

      test('a caller where that names another merchant row removes nothing', async () => {
        const ctx = await start();

        await ctx.remove({ mode: 'reject', where: { name: 'b1' } });

        const rows = await ctx.rows();
        expect(rows).toHaveLength(A_ROWS.length);
      });
    });

    describe('a numeric scope value', () => {
      test('reads the rows that hold the number, and a write the guard lets through is one the scope reads back', async () => {
        const ctx = context();
        await ctx.reset();
        await ctx.seed({
          rows: [
            { meta: { tenant: 7 }, name: 'seven' },
            { meta: { tenant: 8 }, name: 'eight' },
          ],
        });
        ctx.setScope({ scope: { 'meta.tenant': 7 } });

        const before = await ctx.names({ mode: 'reject' });

        await ctx.create({ mode: 'reject', data: { name: 'written', meta: { tenant: 7 } } });
        await rejected(ctx.create({ mode: 'reject', data: { name: 'x', meta: { tenant: 8 } } }));
        await rejected(ctx.create({ mode: 'reject', data: { name: 'x', meta: { tenant: '07' } } }));

        const after = await ctx.names({ mode: 'reject' });

        expect(before).toEqual(['seven']);
        expect(after).toEqual(['seven', 'written']);
      });
    });
  });
};
