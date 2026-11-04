import {
  datasource,
  model,
  ScopeFilters,
  ScopeOperations,
  type TScopeOperation,
} from '@venizia/ignis-kernel';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { SoftDeletableRepository } from '@/relational/postgres/repositories';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * `access.resolve` receives `{ operation }`: one concrete operation per repository call, so one
 * model can read wider than it writes. Run against a real Postgres engine (PGlite).
 */
const TABLE_NAME = 'scope_operation_e2e';

const scopeTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id').notNull(),
  counterpartMerchantId: text('counterpart_merchant_id'),
  name: text('name').notNull(),
  deletedAt: timestamp('deleted_at'),
});

const ME = 'm1';

/** What the resolver under test was called with, one entry per call. */
let calls: Array<unknown> = [];
/** Swapped per test. */
let resolver: (context: { operation: TScopeOperation }) => AnyType = () => ({ merchantId: ME });

@model({
  type: 'entity',
  settings: {
    access: {
      resolve: (context) => {
        calls.push(context);

        return resolver(context);
      },
    },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class ReadWiderEntity extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = scopeTable;
}

/** The zero-argument resolver an existing model declares. It never reads its parameter. */
@model({
  type: 'entity',
  settings: {
    access: { resolve: () => ({ merchantId: ME }) },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class ZeroArgEntity extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = scopeTable;
}

/** Shared rows are writable, so the scope is no longer narrowed on a write. */
@model({
  type: 'entity',
  settings: {
    access: {
      resolve: (context) => resolver(context),
      write: { sharedRows: true },
    },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class SharedRowsEntity extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = scopeTable;
}

@datasource({ driver: PGliteDriver })
class OperationDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: OperationDataSource.name,
      config: {},
      schema: { [TABLE_NAME]: scopeTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

let client: PGlite;
let dataSource: OperationDataSource;
let repository: SoftDeletableRepository<typeof scopeTable>;
let zeroArgRepository: SoftDeletableRepository<typeof scopeTable>;
let sharedRowsRepository: SoftDeletableRepository<typeof scopeTable>;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;

  await client.exec(`
    CREATE TABLE ${TABLE_NAME} (
      id serial primary key,
      merchant_id text not null,
      counterpart_merchant_id text,
      name text not null,
      deleted_at timestamp
    );
  `);

  dataSource = new OperationDataSource({ client });

  repository = new SoftDeletableRepository<typeof scopeTable>(dataSource as AnyType, {
    entityClass: ReadWiderEntity as AnyType,
  });
  zeroArgRepository = new SoftDeletableRepository<typeof scopeTable>(dataSource as AnyType, {
    entityClass: ZeroArgEntity as AnyType,
  });
  sharedRowsRepository = new SoftDeletableRepository<typeof scopeTable>(dataSource as AnyType, {
    entityClass: SharedRowsEntity as AnyType,
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

/** id 1: mine. id 2: another merchant's, naming me as counterpart. id 3: unrelated. id 4: mine, soft-deleted. */
const seed = async (): Promise<void> => {
  await client.exec(`TRUNCATE TABLE ${TABLE_NAME} RESTART IDENTITY;`);
  await client.exec(`
    INSERT INTO ${TABLE_NAME} (merchant_id, counterpart_merchant_id, name, deleted_at) VALUES
      ('${ME}', 'm2', 'mine', NULL),
      ('m2', '${ME}', 'theirs-with-me', NULL),
      ('m3', 'm4', 'unrelated', NULL),
      ('${ME}', NULL, 'mine-deleted', now());
  `);
};

const rawNames = async (): Promise<Array<string>> => {
  const { rows } = await client.query<{ name: string }>(
    `SELECT name FROM ${TABLE_NAME} ORDER BY id`,
  );

  return rows.map((row) => row.name);
};

/** The wide scope for a read, the narrow one for a write: the shape the issue describes. */
const readWiderThanWrite = ({ operation }: { operation: TScopeOperation }) => {
  return ScopeOperations.includes({ group: ScopeOperations.WRITE, operation })
    ? { merchantId: ME }
    : { or: [{ merchantId: ME }, { counterpartMerchantId: ME }] };
};

/** The message of the refusal a write raised; fails when the write went through. */
const refusal = async (opts: { write: Promise<unknown> }): Promise<string> => {
  try {
    await opts.write;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('expected the write to be refused');
};

/** One call per repository method; each is awaited so a failure names the method. */
const METHODS: Array<{
  name: string;
  expected: TScopeOperation;
  run: (repo: SoftDeletableRepository<typeof scopeTable>) => Promise<unknown>;
}> = [
  { name: 'find', expected: 'read', run: (repo) => repo.find({ filter: {} }) },
  { name: 'findOne', expected: 'read', run: (repo) => repo.findOne({ filter: {} }) },
  { name: 'findById', expected: 'read', run: (repo) => repo.findById({ id: 1 }) },
  { name: 'count', expected: 'read', run: (repo) => repo.count({ where: {} }) },
  { name: 'existsWith', expected: 'read', run: (repo) => repo.existsWith({ where: {} }) },
  {
    name: 'create',
    expected: 'create',
    run: (repo) => repo.create({ data: { merchantId: ME, name: 'new' } }),
  },
  {
    name: 'createAll',
    expected: 'create',
    run: (repo) => repo.createAll({ data: [{ merchantId: ME, name: 'new-all' }] }),
  },
  {
    name: 'updateById',
    expected: 'update',
    run: (repo) => repo.updateById({ id: 1, data: { name: 'renamed' } }),
  },
  {
    name: 'updateAll',
    expected: 'update',
    run: (repo) => repo.updateAll({ where: {}, data: { name: 'renamed-all' } }),
  },
  {
    name: 'deleteById (hard)',
    expected: 'delete',
    run: (repo) => repo.deleteById({ id: 1, options: { shouldHardDelete: true } }),
  },
  {
    name: 'deleteAll (hard)',
    expected: 'delete',
    run: (repo) => repo.deleteAll({ where: {}, options: { shouldHardDelete: true } }),
  },
  // A soft delete is stored as an update of the row but is a delete to the caller: it passes DELETE.
  { name: 'deleteById (soft)', expected: 'delete', run: (repo) => repo.deleteById({ id: 1 }) },
  { name: 'deleteAll (soft)', expected: 'delete', run: (repo) => repo.deleteAll({ where: {} }) },
  { name: 'deleteBy (soft)', expected: 'delete', run: (repo) => repo.deleteBy({ where: {} }) },
  // A restore brings a row back: it stays an update.
  { name: 'restoreById', expected: 'update', run: (repo) => repo.restoreById({ id: 4 }) },
  { name: 'restoreAll', expected: 'update', run: (repo) => repo.restoreAll({ where: {} }) },
];

beforeEach(async () => {
  calls = [];
  resolver = () => ({ merchantId: ME });
  await seed();
});

describe('access.resolve receives { operation }', () => {
  for (const { name, expected, run } of METHODS) {
    test(`${name} passes ${expected}, and only ${expected}`, async () => {
      await run(repository);

      expect(calls.length).toBeGreaterThan(0);

      for (const context of calls) {
        expect(context).toEqual({ operation: expected });
      }
    });
  }

  test('no repository method ever passes a group', async () => {
    for (const { run } of METHODS) {
      await seed();
      await run(repository);
    }

    expect(calls.length).toBeGreaterThan(0);

    for (const context of calls) {
      const { operation } = context as { operation: string };

      expect(ScopeOperations.OPERATION_SET.has(operation)).toBe(true);
      expect(operation).not.toBe(ScopeOperations.WRITE);
      expect(operation).not.toBe(ScopeOperations.ALL);
    }
  });
});

describe('a zero-argument resolver is unchanged on every operation', () => {
  test('every method scopes to merchantId exactly as before', async () => {
    const found = await zeroArgRepository.find({ filter: { order: ['id asc'] } });
    expect(found.map((row) => row.name)).toEqual(['mine']);

    await zeroArgRepository.create({ data: { merchantId: ME, name: 'created' } });
    await zeroArgRepository.updateAll({ where: {}, data: { name: 'updated' } });
    const result = await rawNames();
    expect(result).toEqual(['updated', 'theirs-with-me', 'unrelated', 'mine-deleted', 'updated']);

    await zeroArgRepository.deleteAll({ where: {}, options: { shouldHardDelete: true } });
    const result2 = await rawNames();
    expect(result2).toEqual(['theirs-with-me', 'unrelated', 'mine-deleted']);
  });

  test('a write outside the scope is still refused', async () => {
    const message = await refusal({
      write: zeroArgRepository.create({ data: { merchantId: 'm9', name: 'foreign' } }),
    });

    expect(message).toContain('write refused by the access scope');
  });
});

describe('write.sharedRows keeps the refusal of a scope the guard cannot read', () => {
  const OR_OVER_TWO_COLUMNS = { or: [{ merchantId: ME }, { counterpartMerchantId: ME }] };

  test('a delete and an update selection under an or over two columns are refused', async () => {
    resolver = () => OR_OVER_TWO_COLUMNS;

    const writes = [
      sharedRowsRepository.deleteAll({ where: {}, options: { shouldHardDelete: true } }),
      sharedRowsRepository.deleteAll({ where: {} }),
      sharedRowsRepository.updateAll({ where: {}, data: { name: 'x' } }),
    ];

    for (const write of writes) {
      const result = await refusal({ write });
      expect(result).toContain("an 'or' over different columns");
    }

    const result2 = await rawNames();
    expect(result2).toEqual(['mine', 'theirs-with-me', 'unrelated', 'mine-deleted']);
  });

  test('positive control: the shared-rows shape, an or on one column with null, still selects', async () => {
    await client.exec(`UPDATE ${TABLE_NAME} SET merchant_id = '${ME}' WHERE id = 3`);
    resolver = () => ({ or: [{ merchantId: ME }, { merchantId: 'm2' }] });

    await sharedRowsRepository.deleteAll({
      where: {},
      options: { shouldReturn: false, shouldHardDelete: true },
    });

    const result3 = await rawNames();
    expect(result3).toEqual(['mine-deleted']);
  });
});

describe('one model reads wider than it writes', () => {
  beforeEach(() => {
    resolver = readWiderThanWrite;
  });

  test('a read sees my rows and the rows that name me as counterpart', async () => {
    const rows = await repository.find({ filter: { order: ['id asc'] } });

    expect(rows.map((row) => row.name)).toEqual(['mine', 'theirs-with-me']);
  });

  test('an update reaches only my rows, not the counterpart rows the read can see', async () => {
    await repository.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });

    const result = await rawNames();
    expect(result).toEqual(['renamed', 'theirs-with-me', 'unrelated', 'mine-deleted']);
  });

  test('a delete reaches only my rows', async () => {
    await repository.deleteAll({
      where: {},
      options: { shouldReturn: false, shouldHardDelete: true },
    });

    const result2 = await rawNames();
    expect(result2).toEqual(['theirs-with-me', 'unrelated', 'mine-deleted']);
  });

  test('a create is held to the narrow scope', async () => {
    await repository.create({ data: { merchantId: ME, name: 'created' } });
    const result3 = await rawNames();
    expect(result3).toContain('created');

    const message = await refusal({
      write: repository.create({
        data: { merchantId: 'm2', counterpartMerchantId: ME, name: 'foreign' },
      }),
    });

    expect(message).toContain('write refused by the access scope');
  });

  test('returning the or over two columns for a write is still refused, with the same message', async () => {
    resolver = () => ({ or: [{ merchantId: ME }, { counterpartMerchantId: ME }] });

    const writes = [
      repository.create({ data: { merchantId: ME, name: 'x' } }),
      repository.updateAll({ where: {}, data: { name: 'x' }, options: { shouldReturn: false } }),
      repository.deleteAll({ where: {}, options: { shouldHardDelete: true } }),
    ];

    for (const write of writes) {
      const result4 = await refusal({ write });
      expect(result4).toContain("an 'or' over different columns cannot be checked on a write");
    }
  });

  test('a soft delete is held to the DELETE scope, not the UPDATE scope', async () => {
    // UPDATE may reach another merchant's rows (one column, so it is checkable); DELETE may not.
    resolver = ({ operation }) => {
      return operation === ScopeOperations.UPDATE
        ? { merchantId: { inq: [ME, 'm2'] } }
        : { merchantId: ME };
    };

    await repository.deleteAll({ where: {}, options: { shouldReturn: false } });
    const { rows: afterSoftDelete } = await client.query<{ name: string; deletedAt: Date | null }>(
      `SELECT name, deleted_at AS "deletedAt" FROM ${TABLE_NAME} ORDER BY id`,
    );
    expect(afterSoftDelete.map((row) => [row.name, row.deletedAt !== null])).toEqual([
      ['mine', true],
      ['theirs-with-me', false],
      ['unrelated', false],
      ['mine-deleted', true],
    ]);

    // The same resolver lets an update reach the other merchant's row: only the operation differs.
    await repository.updateAll({
      where: {},
      data: { name: 'touched' },
      options: { shouldReturn: false },
    });
    const result6 = await rawNames();
    expect(result6).toEqual(['mine', 'touched', 'unrelated', 'mine-deleted']);
  });

  test('restore stays an update', async () => {
    resolver = ({ operation }) => {
      return operation === ScopeOperations.UPDATE ? { merchantId: ME } : { merchantId: 'nobody' };
    };

    const result = await repository.restoreById({ id: 4 });
    expect(result.data?.name).toBe('mine-deleted');
  });

  test('UNRESTRICTED for one operation applies to that operation only', async () => {
    resolver = ({ operation }) => {
      return operation === ScopeOperations.READ ? ScopeFilters.UNRESTRICTED : { merchantId: ME };
    };

    const rows = await repository.find({ filter: {} });
    expect(rows.length).toBe(3);

    await repository.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });
    const result5 = await rawNames();
    expect(result5).toEqual(['renamed', 'theirs-with-me', 'unrelated', 'mine-deleted']);
  });
});
