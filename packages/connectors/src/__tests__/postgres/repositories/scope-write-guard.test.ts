import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { model, RepositoryErrorCodes, ScopeFilters } from '@venizia/ignis-kernel';
import { BaseRelationalEntity } from '@/relational/core/models';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { SoftDeletableRelationalRepository } from '@/relational/core/repositories/core/soft-deletable';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/relational/postgres/repositories/executor';

/**
 * The write side of `scopeFilter`, against a real PGlite: a create or an update payload that lands a
 * row outside the resolved scope is refused, and nothing is written when it is.
 */
const itemsTable = pgTable('write_guard_items', {
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id'),
  name: text('name'),
  deletedAt: timestamp('deleted_at'),
});

/** What `resolve()` returns right now: the test sets it per case. */
let scope: AnyType = { merchantId: 'm-a' };
const resolve = () => scope;

@model({ type: 'entity', settings: { scopeFilter: { resolve } } })
class RejectItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({ type: 'entity', settings: { scopeFilter: { resolve, writeGuard: 'assign' } } })
class AssignItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({ type: 'entity', settings: { scopeFilter: { resolve, sharedRows: true } } })
class SharedItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({ type: 'entity', settings: { scopeFilter: { resolve, columns: ['merchantId'] } } })
class DeclaredItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({
  type: 'entity',
  settings: { scopeFilter: { resolve }, defaultFilter: { where: { deletedAt: null } } },
})
class SoftItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

const refusal = async (task: Promise<unknown>) => {
  try {
    await task;
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the write to be refused');
};

describe('scopeFilter write guard', () => {
  const client = new PGlite();
  let driver: PGliteDriver<AnyType>;

  const build = (entityClass: AnyType, repositoryClass: AnyType = DefaultCRUDRepository) => {
    const dataSource = {
      getQueryDialect: () => new PostgresQueryDialect(),
      getQueryExecutor: () => new PostgresQueryExecutor(),
      getConnector: () => driver.createConnector({ schema: { itemsTable } }),
    } as AnyType;

    return new repositoryClass(dataSource, { entityClass }) as DefaultCRUDRepository<AnyType>;
  };

  const allRows = async () => {
    const result = await client.query<{
      merchantId: string | null;
      name: string;
      deletedAt: Date | null;
    }>(
      'SELECT merchant_id AS "merchantId", name, deleted_at AS "deletedAt" FROM write_guard_items ORDER BY id',
    );
    return result.rows;
  };

  const rows = async () => (await allRows()).map(({ merchantId, name }) => ({ merchantId, name }));

  beforeAll(async () => {
    await client.waitReady;
    driver = new PGliteDriver<AnyType>({ client });
    await client.exec(
      'CREATE TABLE write_guard_items (id serial primary key, merchant_id text, name text, deleted_at timestamp)',
    );
  });

  beforeEach(async () => {
    scope = { merchantId: 'm-a' };
    await client.exec('TRUNCATE write_guard_items RESTART IDENTITY');
  });

  afterAll(async () => {
    await driver.end();
  });

  describe('create and createAll', () => {
    test('a row inside the scope is written', async () => {
      await build(RejectItem).create({ data: { merchantId: 'm-a', name: 'one' } });

      expect(await rows()).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });

    test('a row outside the scope is refused with 403, the code, the model and the column - and no value', async () => {
      const error = await refusal(
        build(RejectItem).create({ data: { merchantId: 'm-secret-other', name: 'one' } }),
      );

      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('write_guard_items');
      expect(error.message).toContain('merchantId');
      expect(error.message).not.toContain('m-secret-other');
      expect(error.message).not.toContain('m-a');
      expect(error.normalized.code).toBe(RepositoryErrorCodes.SCOPE_WRITE_DENIED);
      expect(await rows()).toEqual([]);
    });

    test('a row without the scope column is refused', async () => {
      const error = await refusal(build(RejectItem).create({ data: { name: 'one' } }));

      expect(error.message).toContain('the scope column is missing');
      expect(await rows()).toEqual([]);
    });

    test('createAll: one bad row refuses the whole batch and nothing is written', async () => {
      const error = await refusal(
        build(RejectItem).createAll({
          data: [
            { merchantId: 'm-a', name: 'ok-1' },
            { merchantId: 'm-b', name: 'bad' },
            { merchantId: 'm-a', name: 'ok-2' },
          ],
        }),
      );

      expect(error.message).toContain('merchantId');
      expect(await rows()).toEqual([]);
    });

    test('createAll: every row inside the scope is written', async () => {
      await build(RejectItem).createAll({
        data: [
          { merchantId: 'm-a', name: 'ok-1' },
          { merchantId: 'm-a', name: 'ok-2' },
        ],
      });

      expect((await rows()).map((row) => row.name)).toEqual(['ok-1', 'ok-2']);
    });

    test('an inq scope allows each of its values and refuses others', async () => {
      scope = { merchantId: { inq: ['m-a', 'm-b'] } };
      await build(RejectItem).createAll({
        data: [
          { merchantId: 'm-a', name: 'a' },
          { merchantId: 'm-b', name: 'b' },
        ],
      });

      await refusal(build(RejectItem).create({ data: { merchantId: 'm-c', name: 'c' } }));
      expect((await rows()).map((row) => row.name)).toEqual(['a', 'b']);
    });

    test('an eq operator, an array and an and-combination are read like an equality', async () => {
      scope = { and: [{ merchantId: { eq: 'm-a' } }, { merchantId: ['m-a', 'm-b'] }] };
      await build(RejectItem).create({ data: { merchantId: 'm-a', name: 'ok' } });
      await refusal(build(RejectItem).create({ data: { merchantId: 'm-b', name: 'bad' } }));

      expect((await rows()).map((row) => row.name)).toEqual(['ok']);
    });
  });

  describe('update', () => {
    test('a payload that moves a row to another scope is refused and the row stays', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

      const error = await refusal(
        repository.updateById({ id: created.data.id, data: { merchantId: 'm-b' } }),
      );

      expect(error.message).toContain('merchantId');
      expect(await rows()).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });

    test('a payload that sets the scope column to null is refused', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: null } }));
      expect(await rows()).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });

    test('a payload that keeps the scope column inside the scope is written', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

      await repository.updateById({
        id: created.data.id,
        data: { merchantId: 'm-a', name: 'two' },
      });
      expect(await rows()).toEqual([{ merchantId: 'm-a', name: 'two' }]);
    });

    test('a payload that does not name the scope column is not checked', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

      await repository.updateById({ id: created.data.id, data: { name: 'renamed' } });
      expect(await rows()).toEqual([{ merchantId: 'm-a', name: 'renamed' }]);
    });
  });

  describe('assign', () => {
    test('fills an absent scope column from an equality scope', async () => {
      await build(AssignItem).create({ data: { name: 'one' } });

      expect(await rows()).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });

    test('still refuses a value that is present and disagrees', async () => {
      await refusal(build(AssignItem).create({ data: { merchantId: 'm-b', name: 'bad' } }));
      expect(await rows()).toEqual([]);
    });

    test('cannot assign from an inq scope, so an absent column is refused', async () => {
      scope = { merchantId: { inq: ['m-a', 'm-b'] } };

      await refusal(build(AssignItem).create({ data: { name: 'one' } }));
      expect(await rows()).toEqual([]);
    });

    test('createAll stamps every row that lacks the column', async () => {
      await build(AssignItem).createAll({
        data: [{ name: 'one' }, { merchantId: 'm-a', name: 'two' }],
      });

      expect(await rows()).toEqual([
        { merchantId: 'm-a', name: 'one' },
        { merchantId: 'm-a', name: 'two' },
      ]);
    });
  });

  describe('UNRESTRICTED and a missing scope', () => {
    test('UNRESTRICTED passes a cross-scope write and stamps nothing', async () => {
      scope = ScopeFilters.UNRESTRICTED;

      await build(AssignItem).createAll({
        data: [
          { merchantId: 'm-other', name: 'explicit' },
          { merchantId: null, name: 'shared' },
          { name: 'absent' },
        ],
      });

      expect(await rows()).toEqual([
        { merchantId: 'm-other', name: 'explicit' },
        { merchantId: null, name: 'shared' },
        { merchantId: null, name: 'absent' },
      ]);
    });

    test('UNRESTRICTED lets an update move a row to another scope', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });
      scope = ScopeFilters.UNRESTRICTED;

      await repository.updateById({ id: created.data.id, data: { merchantId: 'm-b' } });
      expect(await rows()).toEqual([{ merchantId: 'm-b', name: 'one' }]);
    });

    test('a scope that cannot be resolved refuses a create (onMissing defaults to deny)', async () => {
      scope = undefined;

      const error = await refusal(
        build(RejectItem).create({ data: { merchantId: 'm-a', name: 'one' } }),
      );
      expect(error.message).toContain('no scope could be resolved');
    });

    test('an update under an unresolved scope is left to the scoped where, which matches no row', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });
      scope = undefined;

      const result = await repository.updateById({
        id: created.data.id,
        data: { name: 'changed' },
      });
      expect(result.count).toBe(0);
      expect(await rows()).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });
  });

  describe('sharedRows', () => {
    test('null is refused by default and allowed with sharedRows', async () => {
      await refusal(build(RejectItem).create({ data: { merchantId: null, name: 'shared' } }));
      await build(SharedItem).create({ data: { merchantId: null, name: 'shared' } });

      expect(await rows()).toEqual([{ merchantId: null, name: 'shared' }]);
    });

    test('sharedRows still refuses a value from another scope', async () => {
      await refusal(build(SharedItem).create({ data: { merchantId: 'm-b', name: 'bad' } }));
    });

    test('sharedRows lets an absent scope column through', async () => {
      await build(SharedItem).create({ data: { name: 'no-owner' } });

      expect(await rows()).toEqual([{ merchantId: null, name: 'no-owner' }]);
    });
  });

  describe('a scope that cannot be verified', () => {
    test.each([
      [
        'an or over different columns',
        { or: [{ merchantId: 'm-a' }, { name: 'one' }] },
        /different columns/,
      ],
      [
        'an or with a range',
        { or: [{ merchantId: 'm-a' }, { merchantId: { gt: 'm' } }] },
        /operator 'gt'/,
      ],
      [
        'an or branch with two conditions',
        { or: [{ merchantId: 'm-a', name: 'one' }] },
        /several conditions/,
      ],
      ['a range', { merchantId: { gt: 'm' } }, /operator 'gt'/],
      ['two operators', { merchantId: { eq: 'm-a', neq: 'm-b' } }, /2 operators/],
      ['a nested path', { 'meta.merchant': 'm-a' }, /nested path/],
    ])(
      '%s refuses the write with its own message, never a skip',
      async (_label, resolved, pattern) => {
        scope = resolved;

        const error = await refusal(
          build(RejectItem).create({ data: { merchantId: 'm-a', name: 'one' } }),
        );
        expect(error.message).toMatch(/cannot be verified/);
        expect(error.message).toMatch(pattern);
        expect(await rows()).toEqual([]);
      },
    );
  });

  describe('declared columns', () => {
    test('a scope that constrains an undeclared column is refused as unverifiable', async () => {
      scope = { and: [{ merchantId: 'm-a' }, { name: 'one' }] };

      const error = await refusal(
        build(DeclaredItem).create({ data: { merchantId: 'm-a', name: 'one' } }),
      );
      expect(error.message).toContain("column 'name'");
    });

    test('a scope over the declared column passes', async () => {
      await build(DeclaredItem).create({ data: { merchantId: 'm-a', name: 'one' } });

      expect(await rows()).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });
  });

  describe('a shared-rows scope: an or of the ids and null', () => {
    const sharedScope = (ids: string[]) => ({
      or: [{ merchantId: { in: ids } }, { merchantId: null }],
    });

    test.each([
      ['RejectItem', RejectItem],
      ['SharedItem', SharedItem],
    ])(
      '%s: an id in the list is accepted and an id outside the list is refused',
      async (_name, entity) => {
        scope = sharedScope(['m-a', 'm-b']);
        const repository = build(entity);

        await repository.create({ data: { merchantId: 'm-a', name: 'in-list' } });
        await repository.create({ data: { merchantId: 'm-b', name: 'also-in-list' } });
        await refusal(repository.create({ data: { merchantId: 'm-c', name: 'outside' } }));

        expect((await rows()).map((row) => row.name)).toEqual(['in-list', 'also-in-list']);
      },
    );

    test('the null branch is a read permission: null and an absent column are refused without sharedRows', async () => {
      scope = sharedScope(['m-a']);
      const repository = build(RejectItem);

      const withNull = await refusal(
        repository.create({ data: { merchantId: null, name: 'shared' } }),
      );
      await refusal(repository.create({ data: { name: 'no-owner' } }));

      expect(withNull.message).toContain('merchantId');
      expect(await rows()).toEqual([]);
    });

    test('with sharedRows true null and an absent column are accepted', async () => {
      scope = sharedScope(['m-a']);
      const repository = build(SharedItem);

      await repository.create({ data: { merchantId: null, name: 'shared' } });
      await repository.create({ data: { name: 'no-owner' } });

      expect(await rows()).toEqual([
        { merchantId: null, name: 'shared' },
        { merchantId: null, name: 'no-owner' },
      ]);
    });

    test('createAll with a null row and no sharedRows writes nothing', async () => {
      scope = sharedScope(['m-a']);

      await refusal(
        build(RejectItem).createAll({
          data: [
            { merchantId: 'm-a', name: 'ok' },
            { merchantId: null, name: 'shared' },
          ],
        }),
      );
      expect(await rows()).toEqual([]);
    });

    test('an update may move a row to another listed id; to null only with sharedRows; never outside the list', async () => {
      scope = sharedScope(['m-a', 'm-b']);
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

      await repository.updateById({ id: created.data.id, data: { merchantId: 'm-b' } });
      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: null } }));
      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: 'm-c' } }));
      expect((await rows()).map((row) => row.merchantId)).toEqual(['m-b']);

      await build(SharedItem).updateById({ id: created.data.id, data: { merchantId: null } });
      expect((await rows()).map((row) => row.merchantId)).toEqual([null]);
    });

    test('UNRESTRICTED still bypasses it', async () => {
      scope = ScopeFilters.UNRESTRICTED;

      await build(RejectItem).create({ data: { merchantId: null, name: 'shared' } });
      expect(await rows()).toEqual([{ merchantId: null, name: 'shared' }]);
    });

    test('sharedRows also grants null when the scope has no null branch', async () => {
      scope = { merchantId: 'm-a' };

      await refusal(build(RejectItem).create({ data: { merchantId: null, name: 'shared' } }));
      await build(SharedItem).create({ data: { merchantId: null, name: 'shared' } });
      expect((await rows()).map((row) => row.name)).toEqual(['shared']);
    });
  });

  describe('an empty list scope', () => {
    test('refuses every create, including null and an absent column', async () => {
      scope = { merchantId: { in: [] } };
      const repository = build(RejectItem);

      await refusal(repository.create({ data: { merchantId: 'm-a', name: 'a' } }));
      await refusal(repository.create({ data: { merchantId: null, name: 'null' } }));
      await refusal(repository.create({ data: { name: 'absent' } }));
      await refusal(repository.createAll({ data: [{ merchantId: 'm-a', name: 'a' }] }));
      expect(await rows()).toEqual([]);
    });

    test('refuses every update that names the column, whatever the value', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });
      scope = { merchantId: { in: [] } };

      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: 'm-a' } }));
      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: 'm-b' } }));
      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: null } }));
      expect(await rows()).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });

    test('an inq with no values behaves the same', async () => {
      scope = { merchantId: { inq: [] } };

      await refusal(build(RejectItem).create({ data: { merchantId: 'm-a', name: 'a' } }));
      expect(await rows()).toEqual([]);
    });

    test('an empty list inside an or-null scope accepts only through sharedRows', async () => {
      scope = { or: [{ merchantId: { in: [] } }, { merchantId: null }] };

      await refusal(build(RejectItem).create({ data: { merchantId: 'm-a', name: 'a' } }));
      await refusal(build(RejectItem).create({ data: { merchantId: null, name: 'shared' } }));
      await build(SharedItem).create({ data: { merchantId: null, name: 'shared' } });
      await refusal(build(SharedItem).create({ data: { merchantId: 'm-a', name: 'a' } }));
      expect((await rows()).map((row) => row.name)).toEqual(['shared']);
    });
  });

  describe('every write entry point passes through the guard', () => {
    const seed = async () => {
      const repository = build(RejectItem);
      const mine = await repository.create({ data: { merchantId: 'm-a', name: 'mine' } });
      scope = ScopeFilters.UNRESTRICTED;
      const theirs = await repository.create({ data: { merchantId: 'm-b', name: 'theirs' } });
      scope = { merchantId: 'm-a' };

      return { repository, mine: mine.data.id, theirs: theirs.data.id };
    };

    test('create and createAll', async () => {
      await refusal(build(RejectItem).create({ data: { merchantId: 'm-b', name: 'x' } }));
      await refusal(build(RejectItem).createAll({ data: [{ merchantId: 'm-b', name: 'x' }] }));
      expect(await rows()).toEqual([]);
    });

    test('updateById, updateAll and updateBy: a payload naming another scope is refused', async () => {
      const { repository, mine } = await seed();

      await refusal(repository.updateById({ id: mine, data: { merchantId: 'm-b' } }));
      await refusal(repository.updateAll({ where: { name: 'mine' }, data: { merchantId: 'm-b' } }));
      await refusal(repository.updateBy({ where: { name: 'mine' }, data: { merchantId: 'm-b' } }));

      expect((await rows()).map((row) => row.merchantId)).toEqual(['m-a', 'm-b']);
    });

    test('updateAll and updateBy with a payload that stays in scope touch only the scoped rows', async () => {
      const { repository } = await seed();

      await repository.updateAll({
        where: {},
        data: { name: 'renamed' },
        options: { force: true },
      });
      await repository.updateBy({
        where: {},
        data: { name: 'renamed-by' },
        options: { force: true },
      });

      expect((await rows()).map((row) => row.name)).toEqual(['renamed-by', 'theirs']);
    });

    test('deleteById, deleteAll and deleteBy only reach rows inside the scope', async () => {
      const { repository, mine, theirs } = await seed();

      expect((await repository.deleteById({ id: theirs })).count).toBe(0);
      expect((await repository.deleteBy({ where: { name: 'theirs' } })).count).toBe(0);
      expect((await repository.deleteAll({ where: {}, options: { force: true } })).count).toBe(1);
      expect(mine).toBeDefined();
      expect((await rows()).map((row) => row.name)).toEqual(['theirs']);
    });

    test('soft delete and restore go through the guarded update', async () => {
      const soft = build(SoftItem, SoftDeletableRelationalRepository);
      const created = await soft.create({ data: { merchantId: 'm-a', name: 'soft' } });

      await soft.deleteById({ id: created.data.id });
      expect((await allRows()).map((row) => row.deletedAt !== null)).toEqual([true]);

      await soft.restoreById({ id: created.data.id });
      expect((await allRows()).map((row) => row.deletedAt)).toEqual([null]);
    });
  });
});
