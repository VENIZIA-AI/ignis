import { PGlite } from '@electric-sql/pglite';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import type { TClass, TNullable } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { model, RepositoryErrorCodes, ScopeFilters } from '@venizia/ignis-kernel';
import type { TWhere } from '@venizia/ignis-kernel';
import { BaseRelationalEntity } from '@/relational/core/models';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { DefaultCRUDRepository, SoftDeletableRepository } from '@/relational/postgres/repositories';
import { StubDataSource } from './stub-data-source';

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
let scope: TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED = { merchantId: 'm-a' };
const resolve = () => scope;

@model({ type: 'entity', settings: { access: { resolve } } })
class RejectItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({ type: 'entity', settings: { access: { resolve, write: { mode: 'assign' } } } })
class AssignItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({ type: 'entity', settings: { access: { resolve, write: { sharedRows: true } } } })
class SharedItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({ type: 'entity', settings: { access: { resolve, columns: ['merchantId'] } } })
class DeclaredItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({ type: 'entity' })
class PlainItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({
  type: 'entity',
  settings: { access: { resolve }, query: { filter: { where: { deletedAt: null } } } },
})
class SoftItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({ type: 'entity', settings: { query: { filter: { where: { deletedAt: null } } } } })
class FilterOnlyItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

@model({
  type: 'entity',
  settings: {
    access: { resolve, write: { sharedRows: true } },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class SoftSharedItem extends BaseRelationalEntity<typeof itemsTable> {
  static override schema = itemsTable;
  static override TABLE_NAME = 'write_guard_items';
}

type TItemEntityClass = TClass<BaseRelationalEntity<typeof itemsTable>>;

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
  let driver: PGliteDriver;

  const buildDataSource = () =>
    new StubDataSource({ connector: () => driver.createConnector({ schema: { itemsTable } }) });

  const build = (entityClass: TItemEntityClass) =>
    new DefaultCRUDRepository<typeof itemsTable>(buildDataSource(), { entityClass });

  const buildSoft = (entityClass: TItemEntityClass) =>
    new SoftDeletableRepository<typeof itemsTable>(buildDataSource(), { entityClass });

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

  const rows = async () => {
    const all = await allRows();

    return all.map(({ merchantId, name }) => ({ merchantId, name }));
  };

  beforeAll(async () => {
    await client.waitReady;
    driver = new PGliteDriver({ client });
    await client.exec(
      'CREATE TABLE write_guard_items (id serial primary key, merchant_id text, name text, deleted_at timestamp)',
    );
  }, 30_000);

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

      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-a', name: 'one' }]);
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
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('a row without the scope column is refused', async () => {
      const error = await refusal(build(RejectItem).create({ data: { name: 'one' } }));

      expect(error.message).toContain('the scope column is missing');
      const result = await rows();
      expect(result).toEqual([]);
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
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('createAll: every row inside the scope is written', async () => {
      await build(RejectItem).createAll({
        data: [
          { merchantId: 'm-a', name: 'ok-1' },
          { merchantId: 'm-a', name: 'ok-2' },
        ],
      });

      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['ok-1', 'ok-2']);
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
      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['a', 'b']);
    });

    test('an eq operator, an array and an and-combination are read like an equality', async () => {
      scope = { and: [{ merchantId: { eq: 'm-a' } }, { merchantId: ['m-a', 'm-b'] }] };
      await build(RejectItem).create({ data: { merchantId: 'm-a', name: 'ok' } });
      await refusal(build(RejectItem).create({ data: { merchantId: 'm-b', name: 'bad' } }));

      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['ok']);
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
      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });

    test('a payload that sets the scope column to null is refused', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: null } }));
      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });

    test('a payload that keeps the scope column inside the scope is written', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

      await repository.updateById({
        id: created.data.id,
        data: { merchantId: 'm-a', name: 'two' },
      });
      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-a', name: 'two' }]);
    });

    test('a payload that does not name the scope column is not checked', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

      await repository.updateById({ id: created.data.id, data: { name: 'renamed' } });
      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-a', name: 'renamed' }]);
    });
  });

  describe('assign', () => {
    test('fills an absent scope column from an equality scope', async () => {
      await build(AssignItem).create({ data: { name: 'one' } });

      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });

    test('still refuses a value that is present and disagrees', async () => {
      await refusal(build(AssignItem).create({ data: { merchantId: 'm-b', name: 'bad' } }));
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('cannot assign from an inq scope, so an absent column is refused', async () => {
      scope = { merchantId: { inq: ['m-a', 'm-b'] } };

      await refusal(build(AssignItem).create({ data: { name: 'one' } }));
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('createAll stamps every row that lacks the column', async () => {
      await build(AssignItem).createAll({
        data: [{ name: 'one' }, { merchantId: 'm-a', name: 'two' }],
      });

      const result = await rows();
      expect(result).toEqual([
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

      const result = await rows();
      expect(result).toEqual([
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
      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-b', name: 'one' }]);
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
      const result2 = await rows();
      expect(result2).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });
  });

  describe('sharedRows', () => {
    test('null is refused by default and allowed with sharedRows', async () => {
      await refusal(build(RejectItem).create({ data: { merchantId: null, name: 'shared' } }));
      await build(SharedItem).create({ data: { merchantId: null, name: 'shared' } });

      const result = await rows();
      expect(result).toEqual([{ merchantId: null, name: 'shared' }]);
    });

    test('sharedRows still refuses a value from another scope', async () => {
      await refusal(build(SharedItem).create({ data: { merchantId: 'm-b', name: 'bad' } }));
    });

    test('sharedRows lets an absent scope column through', async () => {
      await build(SharedItem).create({ data: { name: 'no-owner' } });

      const result = await rows();
      expect(result).toEqual([{ merchantId: null, name: 'no-owner' }]);
    });
  });

  describe('an empty where on updateBy and deleteBy needs force, on every model', () => {
    // The type asks for a where; a plain JS caller can still leave it out, and that must read as empty. JSON.parse answers `any`, so no cast is needed.
    const omitted = JSON.parse('{}').where;

    const seed = async () => {
      await client.exec(
        "INSERT INTO write_guard_items (merchant_id, name) VALUES ('m-a', 'mine'), ('m-b', 'theirs')",
      );
    };

    const untouched = [
      { merchantId: 'm-a', name: 'mine' },
      { merchantId: 'm-b', name: 'theirs' },
    ];

    test('a scoped model refuses it without force, though the scope would narrow it', async () => {
      await seed();
      const repository = build(RejectItem);

      await RejectionUtility.expectRejection({
        task: repository.deleteBy({ where: {} }),
        message: /Empty where condition/,
      });
      await RejectionUtility.expectRejection({
        task: repository.updateBy({ where: {}, data: { name: 'x' } }),
        message: /Empty where condition/,
      });
      await RejectionUtility.expectRejection({
        task: repository.updateBy({ where: { and: [] }, data: { name: 'x' } }),
        message: /Empty where condition/,
      });

      const after1 = await rows();
      expect(after1).toEqual(untouched);
    });

    test('a soft-deleting model refuses it too, whether the default filter joined the where', async () => {
      await seed();
      const repository = buildSoft(SoftItem);

      await RejectionUtility.expectRejection({
        task: repository.deleteBy({ where: {} }),
        message: /Empty where condition/,
      });
      await RejectionUtility.expectRejection({
        task: repository.restoreBy({ where: {} }),
        message: /Empty where condition/,
      });

      const after2 = await rows();
      expect(after2).toEqual(untouched);
    });

    test('where: omitted is an empty where: a scoped model refuses it without force', async () => {
      await seed();
      const repository = build(RejectItem);

      await RejectionUtility.expectRejection({
        task: repository.deleteBy({ where: omitted }),
        message: /Empty where condition/,
      });
      await RejectionUtility.expectRejection({
        task: repository.updateBy({ where: omitted, data: { name: 'x' } }),
        message: /Empty where condition/,
      });

      const afterUndefined = await rows();
      expect(afterUndefined).toEqual(untouched);
    });

    test('a model with only a default filter, no access, refuses an empty where too', async () => {
      await seed();
      const repository = build(FilterOnlyItem);

      await RejectionUtility.expectRejection({
        task: repository.deleteBy({ where: {} }),
        message: /Empty where condition/,
      });
      await RejectionUtility.expectRejection({
        task: repository.updateBy({ where: omitted, data: { name: 'x' } }),
        message: /Empty where condition/,
      });

      const afterFilterOnly = await rows();
      expect(afterFilterOnly).toEqual(untouched);

      await repository.deleteBy({ where: {}, options: { force: true } });

      const afterForce = await rows();
      expect(afterForce).toEqual([]);
    });

    test('with force the scope still holds: only the caller rows change, the other merchant is untouched', async () => {
      await seed();

      await build(RejectItem).updateBy({
        where: {},
        data: { name: 'renamed' },
        options: { force: true },
      });

      const after3 = await rows();
      expect(after3).toEqual([
        { merchantId: 'm-a', name: 'renamed' },
        { merchantId: 'm-b', name: 'theirs' },
      ]);

      await build(RejectItem).deleteBy({ where: {}, options: { force: true } });

      const after4 = await rows();
      expect(after4).toEqual([{ merchantId: 'm-b', name: 'theirs' }]);
    });

    test('force does not reach another merchant row, even when the caller where names it', async () => {
      await seed();

      await build(RejectItem).deleteBy({ where: { name: 'theirs' }, options: { force: true } });

      const after5 = await rows();
      expect(after5).toEqual(untouched);
    });

    test('a where the caller wrote needs no force: the scope joining it is not what makes it non-empty', async () => {
      await seed();

      await build(RejectItem).deleteBy({ where: { name: 'mine' } });

      const after6 = await rows();
      expect(after6).toEqual([{ merchantId: 'm-b', name: 'theirs' }]);
    });

    test('a model without access is unchanged: refused without force, every row with it', async () => {
      await seed();
      const repository = build(PlainItem);

      await RejectionUtility.expectRejection({
        task: repository.deleteBy({ where: {} }),
        message: /Empty where condition/,
      });
      const after7 = await rows();
      expect(after7).toEqual(untouched);

      await repository.deleteBy({ where: {}, options: { force: true } });

      const after8 = await rows();
      expect(after8).toEqual([]);
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
      ['a bracket path', { 'meta[merchant]': 'm-a' }, /nested path/],
    ])(
      '%s refuses the write with its own message, never a skip',
      async (_label, resolved, pattern) => {
        scope = resolved;

        const error = await refusal(
          build(RejectItem).create({ data: { merchantId: 'm-a', name: 'one' } }),
        );
        expect(error.message).toMatch(/cannot be verified/);
        expect(error.message).toMatch(pattern);
        const result = await rows();
        expect(result).toEqual([]);
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

      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-a', name: 'one' }]);
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

        const result = await rows();
        expect(result.map((row) => row.name)).toEqual(['in-list', 'also-in-list']);
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
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('with sharedRows true null and an absent column are accepted', async () => {
      scope = sharedScope(['m-a']);
      const repository = build(SharedItem);

      await repository.create({ data: { merchantId: null, name: 'shared' } });
      await repository.create({ data: { name: 'no-owner' } });

      const result = await rows();
      expect(result).toEqual([
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
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('an update may move a row to another listed id; to null only with sharedRows; never outside the list', async () => {
      scope = sharedScope(['m-a', 'm-b']);
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

      await repository.updateById({ id: created.data.id, data: { merchantId: 'm-b' } });
      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: null } }));
      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: 'm-c' } }));
      const result = await rows();
      expect(result.map((row) => row.merchantId)).toEqual(['m-b']);

      await build(SharedItem).updateById({ id: created.data.id, data: { merchantId: null } });
      const result2 = await rows();
      expect(result2.map((row) => row.merchantId)).toEqual([null]);
    });

    test('UNRESTRICTED still bypasses it', async () => {
      scope = ScopeFilters.UNRESTRICTED;

      await build(RejectItem).create({ data: { merchantId: null, name: 'shared' } });
      const result = await rows();
      expect(result).toEqual([{ merchantId: null, name: 'shared' }]);
    });

    test('sharedRows also grants null when the scope has no null branch', async () => {
      scope = { merchantId: 'm-a' };

      await refusal(build(RejectItem).create({ data: { merchantId: null, name: 'shared' } }));
      await build(SharedItem).create({ data: { merchantId: null, name: 'shared' } });
      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['shared']);
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
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('refuses every update that names the column, whatever the value', async () => {
      const repository = build(RejectItem);
      const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });
      scope = { merchantId: { in: [] } };

      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: 'm-a' } }));
      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: 'm-b' } }));
      await refusal(repository.updateById({ id: created.data.id, data: { merchantId: null } }));
      const result = await rows();
      expect(result).toEqual([{ merchantId: 'm-a', name: 'one' }]);
    });

    test('an inq with no values behaves the same', async () => {
      scope = { merchantId: { inq: [] } };

      await refusal(build(RejectItem).create({ data: { merchantId: 'm-a', name: 'a' } }));
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('an empty list inside an or-null scope accepts only through sharedRows', async () => {
      scope = { or: [{ merchantId: { in: [] } }, { merchantId: null }] };

      await refusal(build(RejectItem).create({ data: { merchantId: 'm-a', name: 'a' } }));
      await refusal(build(RejectItem).create({ data: { merchantId: null, name: 'shared' } }));
      await build(SharedItem).create({ data: { merchantId: null, name: 'shared' } });
      await refusal(build(SharedItem).create({ data: { merchantId: 'm-a', name: 'a' } }));
      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['shared']);
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
      const result = await rows();
      expect(result).toEqual([]);
    });

    test('updateById, updateBy and updateBy: a payload naming another scope is refused', async () => {
      const { repository, mine } = await seed();

      await refusal(repository.updateById({ id: mine, data: { merchantId: 'm-b' } }));
      await refusal(repository.updateBy({ where: { name: 'mine' }, data: { merchantId: 'm-b' } }));
      await refusal(repository.updateBy({ where: { name: 'mine' }, data: { merchantId: 'm-b' } }));

      const result = await rows();
      expect(result.map((row) => row.merchantId)).toEqual(['m-a', 'm-b']);
    });

    test('updateBy and updateBy with a payload that stays in scope touch only the scoped rows', async () => {
      const { repository } = await seed();

      await repository.updateBy({
        where: {},
        data: { name: 'renamed' },
        options: { force: true },
      });
      await repository.updateBy({
        where: {},
        data: { name: 'renamed-by' },
        options: { force: true },
      });

      const result = await rows();
      expect(result.map((row) => row.name)).toEqual(['renamed-by', 'theirs']);
    });

    test('deleteById, deleteBy and deleteBy only reach rows inside the scope', async () => {
      const { repository, mine, theirs } = await seed();

      const result = await repository.deleteById({ id: theirs });
      expect(result.count).toBe(0);
      const result2 = await repository.deleteBy({ where: { name: 'theirs' } });
      expect(result2.count).toBe(0);
      const result3 = await repository.deleteBy({ where: {}, options: { force: true } });
      expect(result3.count).toBe(1);
      expect(mine).toBeDefined();
      const result4 = await rows();
      expect(result4.map((row) => row.name)).toEqual(['theirs']);
    });

    test('soft delete and restore go through the guarded update', async () => {
      const soft = buildSoft(SoftItem);
      const created = await soft.create({ data: { merchantId: 'm-a', name: 'soft' } });

      await soft.deleteById({ id: created.data.id });
      const result = await allRows();
      expect(result.map((row) => row.deletedAt !== null)).toEqual([true]);

      await soft.restoreById({ id: created.data.id });
      const result2 = await allRows();
      expect(result2.map((row) => row.deletedAt)).toEqual([null]);
    });
  });

  describe('a shared row cannot be changed or deleted without sharedRows', () => {
    const sharedScope = { or: [{ merchantId: { in: ['m-a'] } }, { merchantId: null }] };

    /** Three rows, written without a scope: mine (m-a), shared (null) and theirs (m-b). */
    const seed = async <Repository extends DefaultCRUDRepository<typeof itemsTable>>(
      repository: Repository,
    ) => {
      scope = ScopeFilters.UNRESTRICTED;
      const mine = await repository.create({ data: { merchantId: 'm-a', name: 'mine' } });
      const shared = await repository.create({ data: { merchantId: null, name: 'shared' } });
      const theirs = await repository.create({ data: { merchantId: 'm-b', name: 'theirs' } });
      scope = sharedScope;

      return { repository, mine: mine.data.id, shared: shared.data.id, theirs: theirs.data.id };
    };

    const names = async () => {
      const found = await rows();

      return found.map((row) => row.name);
    };

    test('reads still return my rows and the shared rows, never the other merchant', async () => {
      const { repository } = await seed(build(RejectItem));

      const found = await repository.find({ filter: {} });

      expect(found.map((row) => row.name).sort()).toEqual(['mine', 'shared']);
    });

    test('updateById changes my row, and a shared row stays untouched (count 0)', async () => {
      const { repository, mine, shared, theirs } = await seed(build(RejectItem));

      const result = await repository.updateById({ id: mine, data: { name: 'mine-2' } });
      expect(result.count).toBe(1);
      const result2 = await repository.updateById({ id: shared, data: { name: 'shared-2' } });
      expect(result2.count).toBe(0);
      const result3 = await repository.updateById({ id: theirs, data: { name: 'theirs-2' } });
      expect(result3.count).toBe(0);

      const result4 = await names();
      expect(result4).toEqual(['mine-2', 'shared', 'theirs']);
    });

    test('deleteById removes my row, and a shared row stays (count 0)', async () => {
      const { repository, mine, shared } = await seed(build(RejectItem));

      const result = await repository.deleteById({ id: shared });
      expect(result.count).toBe(0);
      const result2 = await repository.deleteById({ id: mine });
      expect(result2.count).toBe(1);

      const result3 = await names();
      expect(result3).toEqual(['shared', 'theirs']);
    });

    test('updateBy and updateBy touch only my rows', async () => {
      const { repository } = await seed(build(RejectItem));

      await repository.updateBy({ where: {}, data: { name: 'all' }, options: { force: true } });
      const result = await names();
      expect(result).toEqual(['all', 'shared', 'theirs']);

      await repository.updateBy({ where: {}, data: { name: 'by' }, options: { force: true } });
      const result2 = await names();
      expect(result2).toEqual(['by', 'shared', 'theirs']);
    });

    test('deleteBy and deleteBy touch only my rows', async () => {
      const { repository } = await seed(build(RejectItem));

      const result = await repository.deleteBy({ where: {}, options: { force: true } });
      expect(result.count).toBe(1);
      const result2 = await names();
      expect(result2).toEqual(['shared', 'theirs']);

      const result3 = await repository.deleteBy({ where: {}, options: { force: true } });
      expect(result3.count).toBe(0);
      const result4 = await names();
      expect(result4).toEqual(['shared', 'theirs']);
    });

    test('a payload that does not name the scope column cannot reach a shared row through a name filter either', async () => {
      const { repository } = await seed(build(RejectItem));

      const result = await repository.updateBy({ where: { name: 'shared' }, data: { name: 'x' } });

      expect(result.count).toBe(0);
      const result2 = await names();
      expect(result2).toEqual(['mine', 'shared', 'theirs']);
    });

    test('soft delete and restore reach my row only, not a shared one', async () => {
      const { repository, mine, shared } = await seed(buildSoft(SoftItem));

      const result = await repository.deleteById({ id: shared });
      expect(result.count).toBe(0);
      const result2 = await repository.deleteById({ id: mine });
      expect(result2.count).toBe(1);
      const result3 = await allRows();
      expect(result3.map((row) => row.deletedAt !== null)).toEqual([true, false, false]);

      scope = ScopeFilters.UNRESTRICTED;
      await repository.deleteById({ id: shared });
      scope = sharedScope;
      const result4 = await allRows();
      expect(result4.map((row) => row.deletedAt !== null)).toEqual([true, true, false]);

      const result5 = await repository.restoreById({ id: shared });
      expect(result5.count).toBe(0);
      const result6 = await repository.restoreById({ id: mine });
      expect(result6.count).toBe(1);
      const result7 = await allRows();
      expect(result7.map((row) => row.deletedAt !== null)).toEqual([false, true, false]);
    });

    test('with sharedRows true the shared row can be changed, deleted, soft deleted and restored', async () => {
      const { repository, shared, theirs } = await seed(build(SharedItem));

      const result = await repository.updateById({ id: shared, data: { name: 'shared-2' } });
      expect(result.count).toBe(1);
      const result2 = await repository.updateById({ id: theirs, data: { name: 'theirs-2' } });
      expect(result2.count).toBe(0);
      const result3 = await repository.deleteById({ id: shared });
      expect(result3.count).toBe(1);
      const result4 = await names();
      expect(result4).toEqual(['mine', 'theirs']);

      const soft = await seed(buildSoft(SoftSharedItem));
      const result5 = await soft.repository.deleteById({ id: soft.shared });
      expect(result5.count).toBe(1);
      const result6 = await soft.repository.restoreById({ id: soft.shared });
      expect(result6.count).toBe(1);
    });

    test('UNRESTRICTED still reaches every row', async () => {
      const { repository, shared, theirs } = await seed(build(RejectItem));

      scope = ScopeFilters.UNRESTRICTED;
      const result = await repository.updateById({ id: shared, data: { name: 'a' } });
      expect(result.count).toBe(1);
      const result2 = await repository.deleteById({ id: theirs });
      expect(result2.count).toBe(1);
    });

    test('a scope that only allows null matches no row for a write', async () => {
      const { repository, shared } = await seed(build(RejectItem));
      scope = { merchantId: null };

      const result = await repository.updateById({ id: shared, data: { name: 'a' } });
      expect(result.count).toBe(0);
      const result2 = await repository.deleteById({ id: shared });
      expect(result2.count).toBe(0);
      const result3 = await names();
      expect(result3).toEqual(['mine', 'shared', 'theirs']);
    });

    test('a null inside a list is dropped for a write and the other values stay', async () => {
      const { repository, mine, shared } = await seed(build(RejectItem));
      scope = { merchantId: { inq: ['m-a', null] } };

      const result = await repository.updateById({ id: shared, data: { name: 'a' } });
      expect(result.count).toBe(0);
      const result2 = await repository.updateById({ id: mine, data: { name: 'b' } });
      expect(result2.count).toBe(1);
    });

    test('a scope the guard cannot read refuses a delete instead of leaving shared rows reachable', async () => {
      const { repository, shared } = await seed(build(RejectItem));
      scope = { or: [{ merchantId: 'm-a' }, { name: 'shared' }] };

      const error = await refusal(repository.deleteById({ id: shared }));

      expect(error.message).toMatch(/cannot be verified/);
      const result = await names();
      expect(result).toEqual(['mine', 'shared', 'theirs']);
    });
  });
});
