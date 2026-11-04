import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import {
  datasource,
  model,
  RepositoryErrorCodes,
  ScopeFilterMissingBehaviors,
  ScopeFilters,
} from '@venizia/ignis-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import {
  DefaultSqliteRepository,
  SoftDeletableSqliteRepository,
} from '@/relational/sqlite/repositories';

/**
 * `access.resolve` on SQLite (libsql), the counterpart of the Postgres suites `pglite-scope-filter`
 * and `scope-write-guard`: read scoping, `onMissing`, `columns`, `write.mode` and `write.sharedRows`.
 *
 * Where SQLite differs from Postgres, and what this suite pins:
 * - It cannot lock a row, so the guard must never ask for one (the executor throws NotSupported on a lock).
 * - `contains` and `regexp` are refused by the dialect, so a scope that uses one fails loudly instead of
 *   returning rows from an approximate query.
 *
 * The model registry is keyed by table name for the whole process, so this table has its own name.
 */
const TABLE_NAME = 'lite_resolve_items';

const itemsTable = sqliteTable(TABLE_NAME, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantId: text('merchant_id'),
  name: text('name'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

/** What `resolve()` returns right now: each test sets it. `undefined` is "no scope could be resolved". */
let scope: AnyType = { merchantId: 'm-a' };
const resolve = () => scope;

@model({ type: 'entity', settings: { access: { resolve } } })
class RejectItem extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { access: { resolve, write: { mode: 'assign' } } } })
class AssignItem extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { access: { resolve, write: { sharedRows: true } } } })
class SharedItem extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { access: { resolve, columns: ['merchantId'] } } })
class DeclaredItem extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@model({
  type: 'entity',
  settings: {
    access: { resolve, onMissing: ScopeFilterMissingBehaviors.ALLOW },
  },
})
class AllowItem extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@model({
  type: 'entity',
  settings: { access: { resolve }, query: { filter: { where: { deletedAt: null } } } },
})
class SoftItem extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@model({
  type: 'entity',
  settings: {
    access: { resolve, write: { sharedRows: true } },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class SoftSharedItem extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@datasource({ driver: LibSqlDriver })
class ResolveSqliteDataSource extends BaseSqliteDataSource<{ url: string }, AnyType, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: ResolveSqliteDataSource.name,
      config: { url: ':memory:' },
      schema: { [TABLE_NAME]: itemsTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}
}

let client: Client;
let dataSource: ResolveSqliteDataSource;

/** The repository for an entity. */
const build = (entityClass: AnyType): AnyType => {
  return new DefaultSqliteRepository<typeof itemsTable>(dataSource as AnyType, { entityClass });
};

/** The repository for an entity that declares a `deletedAt` filter: it can soft delete and restore. */
const buildSoft = (entityClass: AnyType): AnyType => {
  return new SoftDeletableSqliteRepository<typeof itemsTable>(dataSource as AnyType, {
    entityClass,
  });
};

const NOT_SUPPORTED_CODE = 'core.not_supported';

/** The normalized code of an application error, or `undefined` for anything else. */
const errorCode = (error: unknown): string | undefined => {
  return isApplicationError(error) ? error.normalized.code : undefined;
};

beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  await client.execute(
    `CREATE TABLE ${TABLE_NAME} (id integer primary key autoincrement, merchant_id text, name text, tags text, deleted_at integer)`,
  );
  dataSource = new ResolveSqliteDataSource({ client });
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  scope = { merchantId: 'm-a' };
  await client.executeMultiple(`DELETE FROM ${TABLE_NAME}; DELETE FROM sqlite_sequence;`);
});

const allRows = async (): Promise<
  Array<{ merchantId: string | null; name: string; deletedAt: number | null }>
> => {
  const { rows } = await client.execute(
    `SELECT merchant_id AS merchantId, name, deleted_at AS deletedAt FROM ${TABLE_NAME} ORDER BY id`,
  );

  return rows.map((row) => ({
    merchantId: row.merchantId === null ? null : String(row.merchantId),
    name: String(row.name),
    deletedAt: row.deletedAt === null ? null : Number(row.deletedAt),
  }));
};

const rows = async () => {
  const all = await allRows();

  return all.map(({ merchantId, name }) => ({ merchantId, name }));
};

const names = async () => {
  const all = await allRows();

  return all.map((row) => row.name);
};

/** Rows written straight to the table, no scope involved: the setup of a test. */
const insert = async (
  values: Array<{ merchantId: TNullable<string>; name: string; deleted?: boolean }>,
): Promise<void> => {
  for (const value of values) {
    await client.execute({
      sql: `INSERT INTO ${TABLE_NAME} (merchant_id, name, deleted_at) VALUES (?, ?, ?)`,
      args: [value.merchantId ?? null, value.name, value.deleted ? Date.now() : null],
    });
  }
};

/** id 1/2: m-a (active, soft-deleted). id 3/4: m-b (active, soft-deleted). */
const seedTwoMerchants = () => {
  return insert([
    { merchantId: 'm-a', name: 'a-active' },
    { merchantId: 'm-a', name: 'a-deleted', deleted: true },
    { merchantId: 'm-b', name: 'b-active' },
    { merchantId: 'm-b', name: 'b-deleted', deleted: true },
  ]);
};

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

/** The error a call raised, whatever its type, or `undefined` when it went through. */
const failure = async (task: () => Promise<unknown>): Promise<unknown> => {
  try {
    await task();
  } catch (error) {
    return error;
  }

  return undefined;
};

describe('access.resolve on SQLite - read verbs are scoped', () => {
  beforeEach(async () => {
    await seedTwoMerchants();
  });

  test('find hides every other merchant', async () => {
    const found = await buildSoft(SoftItem).find({ filter: { order: ['id asc'] } });

    expect(found.map((row: AnyType) => row.name)).toEqual(['a-active']);
  });

  test('findOne, findById and count scope the same way', async () => {
    const repository = buildSoft(SoftItem);

    const one = await repository.findOne({ filter: {} });
    const foreign = await repository.findById({ id: 3 });
    const own = await repository.findById({ id: 1 });
    const { count } = await repository.count({ where: {} });

    expect(one?.name).toBe('a-active');
    expect(foreign).toBeNull();
    expect(own?.name).toBe('a-active');
    expect(count).toBe(1);
  });

  test('shouldSkipDefaultFilter removes the soft-delete filter but not the merchant scope', async () => {
    const found = await buildSoft(SoftItem).find({
      filter: { order: ['id asc'] },
      options: { shouldSkipDefaultFilter: true },
    });

    expect(found.map((row: AnyType) => row.name)).toEqual(['a-active', 'a-deleted']);
  });

  test('UNRESTRICTED reads every row', async () => {
    scope = ScopeFilters.UNRESTRICTED;

    const found = await build(RejectItem).find({ filter: { order: ['id asc'] } });

    expect(found).toHaveLength(4);
  });

  test('an in list, an or with null and an and-combination narrow the read', async () => {
    await insert([{ merchantId: null, name: 'shared' }]);
    const repository = build(RejectItem);

    scope = { merchantId: { in: ['m-a', 'm-b'] } };
    const listed = await repository.find({ filter: { order: ['id asc'] } });

    scope = { or: [{ merchantId: 'm-a' }, { merchantId: null }] };
    const shared = await repository.find({ filter: { order: ['id asc'] } });

    scope = { and: [{ merchantId: 'm-a' }, { name: 'a-active' }] };
    const narrowed = await repository.find({ filter: {} });

    expect(listed).toHaveLength(4);
    expect(shared.map((row: AnyType) => row.name)).toEqual(['a-active', 'a-deleted', 'shared']);
    expect(narrowed.map((row: AnyType) => row.name)).toEqual(['a-active']);
  });
});

describe('access.resolve on SQLite - write verbs are scoped', () => {
  beforeEach(async () => {
    await seedTwoMerchants();
  });

  test("updateAll only touches the current merchant's rows", async () => {
    await buildSoft(SoftItem).updateAll({
      data: { name: 'renamed' },
      where: {},
      options: { shouldReturn: false },
    });

    const result = await names();
    expect(result).toEqual(['renamed', 'a-deleted', 'b-active', 'b-deleted']);
  });

  test("a soft deleteAll only soft-deletes the current merchant's active row", async () => {
    await buildSoft(SoftItem).deleteAll({ where: {}, options: { shouldReturn: false } });

    const result = await allRows();
    expect(result.map((row) => row.deletedAt !== null)).toEqual([true, true, false, true]);
  });

  test("updateById and deleteById on another merchant's id are scoped no-ops", async () => {
    const repository = buildSoft(SoftItem);

    const updated = await repository.updateById({ id: 3, data: { name: 'hacked' } });
    const deleted = await repository.deleteById({ id: 3 });

    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);
    const result = await allRows();
    expect(result[2]).toEqual({ merchantId: 'm-b', name: 'b-active', deletedAt: null });
  });

  test('restoreById restores my own row and denies another merchant row', async () => {
    const repository = buildSoft(SoftItem);

    const own = await repository.restoreById({ id: 2 });
    const foreign = await repository.restoreById({ id: 4 });

    expect(own.count).toBe(1);
    expect(foreign.count).toBe(0);
    const result = await allRows();
    expect(result.map((row) => row.deletedAt !== null)).toEqual([false, false, false, true]);
  });

  test('restoreAll only reaches the current merchant', async () => {
    await buildSoft(SoftItem).restoreAll({ where: {}, options: { shouldReturn: false } });

    const result = await allRows();
    expect(result.map((row) => row.deletedAt !== null)).toEqual([false, false, false, true]);
  });

  test('a hard deleteAll only reaches my rows', async () => {
    const result = await build(RejectItem).deleteAll({
      where: {},
      options: { force: true },
    });

    expect(result.count).toBe(2);
    const left = await names();
    expect(left).toEqual(['b-active', 'b-deleted']);
  });
});

describe("access.resolve on SQLite - onMissing: 'deny' (the default)", () => {
  beforeEach(async () => {
    await seedTwoMerchants();
  });

  test('find and count match nothing when the scope cannot be resolved', async () => {
    scope = null;
    const repository = build(RejectItem);

    const found = await repository.find({ filter: {} });
    const { count } = await repository.count({ where: {} });

    expect(found).toEqual([]);
    expect(count).toBe(0);
  });

  test('restoreById denies a row that exists when the scope cannot be resolved', async () => {
    scope = null;

    const result = await buildSoft(SoftItem).restoreById({ id: 2 });

    expect(result.count).toBe(0);
    const rowsAfter = await allRows();
    expect(rowsAfter[1].deletedAt).not.toBeNull();
  });

  test('a create is refused with the missing-scope message and nothing is written', async () => {
    scope = undefined;

    const error = await refusal(
      build(RejectItem).create({ data: { merchantId: 'm-a', name: 'one' } }),
    );

    expect(error.message).toContain('no scope could be resolved');
    const count = await names();
    expect(count).toHaveLength(4);
  });

  test('an update under an unresolved scope is left to the scoped where, which matches no row', async () => {
    scope = undefined;

    const result = await build(RejectItem).updateById({ id: 1, data: { name: 'changed' } });

    expect(result.count).toBe(0);
    const result2 = await names();
    expect(result2[0]).toBe('a-active');
  });
});

describe("access.resolve on SQLite - onMissing: 'allow' applies no scope", () => {
  beforeEach(async () => {
    await seedTwoMerchants();
  });

  test('every merchant is visible while the scope is unresolved', async () => {
    scope = null;

    const found = await build(AllowItem).find({ filter: { order: ['id asc'] } });

    expect(found).toHaveLength(4);
  });

  test('the same model scopes normally once the resolver returns a value', async () => {
    scope = { merchantId: 'm-a' };

    const found = await build(AllowItem).find({ filter: { order: ['id asc'] } });

    expect(found.map((row: AnyType) => row.name)).toEqual(['a-active', 'a-deleted']);
  });
});

describe('access.resolve on SQLite - a throwing resolver propagates', () => {
  class ResolutionError extends Error {}

  test("find rejects with the resolver's own error instead of silently un-scoping", async () => {
    scope = undefined;

    const throwing = () => {
      throw new ResolutionError('scope resolution blew up');
    };

    @model({ type: 'entity', settings: { access: { resolve: throwing } } })
    class ThrowingItem extends BaseSqliteEntity {
      static override TABLE_NAME = TABLE_NAME;
      static override schema = itemsTable;
    }

    const caught = await failure(() => build(ThrowingItem).find({ filter: {} }));

    expect(caught).toBeInstanceOf(ResolutionError);
  });
});

describe('access.resolve on SQLite - the write guard, reject mode', () => {
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
    expect(error.message).toContain(TABLE_NAME);
    expect(error.message).toContain('merchantId');
    expect(error.message).not.toContain('m-secret-other');
    expect(error.normalized.code).toBe(RepositoryErrorCodes.SCOPE_WRITE_DENIED);
    const result = await rows();
    expect(result).toEqual([]);
  });

  test('a row without the scope column is refused', async () => {
    const error = await refusal(build(RejectItem).create({ data: { name: 'one' } }));

    expect(error.message).toContain('the scope column is missing');
  });

  test('createAll: one bad row refuses the whole batch and nothing is written', async () => {
    await refusal(
      build(RejectItem).createAll({
        data: [
          { merchantId: 'm-a', name: 'ok-1' },
          { merchantId: 'm-b', name: 'bad' },
          { merchantId: 'm-a', name: 'ok-2' },
        ],
      }),
    );

    const result = await rows();
    expect(result).toEqual([]);
  });

  test('an update payload that moves a row to another scope, or to null, is refused and the row stays', async () => {
    const repository = build(RejectItem);
    const created = await repository.create({ data: { merchantId: 'm-a', name: 'one' } });

    await refusal(repository.updateById({ id: created.data.id, data: { merchantId: 'm-b' } }));
    await refusal(repository.updateById({ id: created.data.id, data: { merchantId: null } }));
    await repository.updateById({ id: created.data.id, data: { name: 'renamed' } });

    const result = await rows();
    expect(result).toEqual([{ merchantId: 'm-a', name: 'renamed' }]);
  });

  test('UNRESTRICTED passes a cross-scope write', async () => {
    scope = ScopeFilters.UNRESTRICTED;

    await build(RejectItem).create({ data: { merchantId: 'm-other', name: 'explicit' } });

    const result = await rows();
    expect(result).toEqual([{ merchantId: 'm-other', name: 'explicit' }]);
  });

  test('every write entry point passes through the guard', async () => {
    const repository = build(RejectItem);

    await refusal(repository.create({ data: { merchantId: 'm-b', name: 'x' } }));
    await refusal(repository.createAll({ data: [{ merchantId: 'm-b', name: 'x' }] }));
    const mine = await repository.create({ data: { merchantId: 'm-a', name: 'mine' } });
    await refusal(repository.updateById({ id: mine.data.id, data: { merchantId: 'm-b' } }));
    await refusal(repository.updateAll({ where: { name: 'mine' }, data: { merchantId: 'm-b' } }));
    await refusal(repository.updateBy({ where: { name: 'mine' }, data: { merchantId: 'm-b' } }));

    const result = await rows();
    expect(result).toEqual([{ merchantId: 'm-a', name: 'mine' }]);
  });

  test('soft delete and restore go through the guarded update', async () => {
    const soft = buildSoft(SoftItem);
    const created = await soft.create({ data: { merchantId: 'm-a', name: 'soft' } });

    await soft.deleteById({ id: created.data.id });
    const afterDelete = await allRows();
    await soft.restoreById({ id: created.data.id });
    const afterRestore = await allRows();

    expect(afterDelete.map((row) => row.deletedAt !== null)).toEqual([true]);
    expect(afterRestore.map((row) => row.deletedAt)).toEqual([null]);
  });
});

describe('access.resolve on SQLite - write.mode assign', () => {
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

  test('cannot assign from an in list, so an absent column is refused', async () => {
    scope = { merchantId: { in: ['m-a', 'm-b'] } };

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

  test('UNRESTRICTED stamps nothing', async () => {
    scope = ScopeFilters.UNRESTRICTED;

    await build(AssignItem).create({ data: { name: 'absent' } });

    const result = await rows();
    expect(result).toEqual([{ merchantId: null, name: 'absent' }]);
  });
});

describe('access.resolve on SQLite - write.sharedRows', () => {
  const sharedScope = { or: [{ merchantId: { in: ['m-a'] } }, { merchantId: null }] };

  test('null is refused by default and allowed with sharedRows; another merchant stays refused', async () => {
    await refusal(build(RejectItem).create({ data: { merchantId: null, name: 'shared' } }));
    await build(SharedItem).create({ data: { merchantId: null, name: 'shared' } });
    await refusal(build(SharedItem).create({ data: { merchantId: 'm-b', name: 'bad' } }));
    await build(SharedItem).create({ data: { name: 'no-owner' } });

    const result = await rows();
    expect(result).toEqual([
      { merchantId: null, name: 'shared' },
      { merchantId: null, name: 'no-owner' },
    ]);
  });

  test('an or of the ids and null: the null branch is a read permission, not a write one', async () => {
    scope = sharedScope;

    await refusal(build(RejectItem).create({ data: { merchantId: null, name: 'shared' } }));
    await refusal(build(RejectItem).create({ data: { name: 'no-owner' } }));
    await build(RejectItem).create({ data: { merchantId: 'm-a', name: 'mine' } });
    await refusal(build(RejectItem).create({ data: { merchantId: 'm-c', name: 'outside' } }));

    const result = await rows();
    expect(result).toEqual([{ merchantId: 'm-a', name: 'mine' }]);
  });

  describe('a shared row cannot be changed or deleted without sharedRows', () => {
    /** Three rows written without a scope: mine (m-a), shared (null) and theirs (m-b). */
    beforeEach(async () => {
      await insert([
        { merchantId: 'm-a', name: 'mine' },
        { merchantId: null, name: 'shared' },
        { merchantId: 'm-b', name: 'theirs' },
      ]);
      scope = sharedScope;
    });

    test('reads still return my rows and the shared rows, never the other merchant', async () => {
      const found = await build(RejectItem).find({ filter: {} });

      expect(found.map((row: AnyType) => row.name).sort()).toEqual(['mine', 'shared']);
    });

    test('updateById and deleteById change my row and leave the shared one (count 0)', async () => {
      const repository = build(RejectItem);

      const mineUpdate = await repository.updateById({ id: 1, data: { name: 'mine-2' } });
      const sharedUpdate = await repository.updateById({ id: 2, data: { name: 'shared-2' } });
      const sharedDelete = await repository.deleteById({ id: 2 });
      const theirsDelete = await repository.deleteById({ id: 3 });

      expect(mineUpdate.count).toBe(1);
      expect(sharedUpdate.count).toBe(0);
      expect(sharedDelete.count).toBe(0);
      expect(theirsDelete.count).toBe(0);
      const result = await names();
      expect(result).toEqual(['mine-2', 'shared', 'theirs']);
    });

    test('updateAll and deleteAll touch only my rows', async () => {
      const repository = build(RejectItem);

      await repository.updateAll({ where: {}, data: { name: 'all' }, options: { force: true } });
      const afterUpdate = await names();
      const deleted = await repository.deleteAll({ where: {}, options: { force: true } });

      expect(afterUpdate).toEqual(['all', 'shared', 'theirs']);
      expect(deleted.count).toBe(1);
      const result = await names();
      expect(result).toEqual(['shared', 'theirs']);
    });

    test('soft delete and restore reach my row only, not a shared one', async () => {
      const repository = buildSoft(SoftItem);

      const shared = await repository.deleteById({ id: 2 });
      const mine = await repository.deleteById({ id: 1 });
      const restored = await repository.restoreById({ id: 1 });

      expect(shared.count).toBe(0);
      expect(mine.count).toBe(1);
      expect(restored.count).toBe(1);
    });

    test('with sharedRows true the shared row can be changed, deleted and soft deleted; the other merchant row cannot', async () => {
      const repository = build(SharedItem);

      const changed = await repository.updateById({ id: 2, data: { name: 'shared-2' } });
      const theirs = await repository.updateById({ id: 3, data: { name: 'theirs-2' } });
      const deleted = await repository.deleteById({ id: 2, options: { force: true } });

      expect(changed.count).toBe(1);
      expect(theirs.count).toBe(0);
      expect(deleted.count).toBe(1);
      const result = await names();
      expect(result).toEqual(['mine', 'theirs']);

      await insert([{ merchantId: null, name: 'shared-soft' }]);
      const soft = buildSoft(SoftSharedItem);
      const softDeleted = await soft.deleteById({ id: 4 });
      const softRestored = await soft.restoreById({ id: 4 });

      expect(softDeleted.count).toBe(1);
      expect(softRestored.count).toBe(1);
    });

    test('a scope the guard cannot read refuses a delete instead of leaving shared rows reachable', async () => {
      scope = { or: [{ merchantId: 'm-a' }, { name: 'shared' }] };

      const error = await refusal(build(RejectItem).deleteById({ id: 2 }));

      expect(error.message).toMatch(/cannot be verified/);
      const result = await names();
      expect(result).toEqual(['mine', 'shared', 'theirs']);
    });
  });
});

describe('access.resolve on SQLite - a scope that cannot be verified', () => {
  test.each([
    [
      'an or over different columns',
      { or: [{ merchantId: 'm-a' }, { name: 'one' }] },
      /different columns/,
    ],
    ['a range', { merchantId: { gt: 'm' } }, /operator 'gt'/],
    ['two operators', { merchantId: { eq: 'm-a', neq: 'm-b' } }, /2 operators/],
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

describe('access.resolve on SQLite - declared columns', () => {
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

describe('access.resolve on SQLite - where it differs from Postgres', () => {
  beforeEach(async () => {
    await seedTwoMerchants();
  });

  test('SQLite cannot lock a row, so no resolve read or write asks for a lock', async () => {
    const repository = new DefaultSqliteRepository<typeof itemsTable>(dataSource as AnyType, {
      entityClass: RejectItem as AnyType,
    });
    const select = spyOn(repository['queryExecutor'], 'select');

    await repository.create({ data: { merchantId: 'm-a', name: 'new' } });
    await repository.updateById({ id: 1, data: { merchantId: 'm-a', name: 'renamed' } });
    await repository.find({ filter: {} });

    expect(select.mock.calls.length).toBeGreaterThan(0);
    expect(select.mock.calls.every(([opts]) => opts.lock === undefined)).toBe(true);
    select.mockRestore();
  });

  test('a scope that uses regexp is refused as NotSupported, not answered by an approximate query', async () => {
    scope = { merchantId: { regexp: '^m-a' } };

    const caught = await failure(() => build(RejectItem).find({ filter: {} }));

    expect(errorCode(caught)).toBe(NOT_SUPPORTED_CODE);
  });

  test('a scope that uses contains is refused as NotSupported', async () => {
    scope = { tags: { contains: ['x'] } };

    const caught = await failure(() => build(RejectItem).find({ filter: {} }));

    expect(errorCode(caught)).toBe(NOT_SUPPORTED_CODE);
  });

  test('a write under a regexp or contains scope is refused and writes nothing', async () => {
    const before = await names();

    for (const resolved of [{ merchantId: { regexp: '^m-a' } }, { tags: { contains: ['x'] } }]) {
      scope = resolved;

      const caught = await failure(() =>
        build(RejectItem).create({ data: { merchantId: 'm-a', name: 'new' } }),
      );

      expect(isApplicationError(caught)).toBe(true);
    }

    const after = await names();
    expect(after).toEqual(before);
  });
});
