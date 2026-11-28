import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  ExecutionModes,
  isApplicationError,
  type IExecutionFrame,
} from '@venizia/ignis-helpers/core';
import {
  datasource,
  model,
  RepositoryErrorCodes,
  RequestContextRegistry,
  ScopeFilterMissingBehaviors,
  type TAnyDataSourceSchema,
} from '@venizia/ignis-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { AsyncLocalStorage } from 'node:async_hooks';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity, SqliteUserAuditEnricher } from '@/relational/sqlite/models';
import { SoftDeletableSqliteRepository } from '@/relational/sqlite/repositories';

/** The execution frame in `access`: what a system frame sees, what `resolve` is given, and the writes it refuses. */
const TABLE_NAME = 'lite_execution_items';

const itemsTable = sqliteTable(TABLE_NAME, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantId: text('merchant_id'),
  name: text('name'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  ...SqliteUserAuditEnricher.generateColumnDefs({
    created: { dataType: 'string', columnName: 'created_by', allowAnonymous: true },
    modified: { dataType: 'string', columnName: 'modified_by', allowAnonymous: true },
  }),
});

const seen: Array<IExecutionFrame | undefined> = [];

/** The scope is the frame's `merchant` value; none outside one. */
const resolve = (context: { scope?: IExecutionFrame }) => {
  seen.push(context.scope);
  const merchantId: unknown = Reflect.get(context.scope?.values ?? {}, 'merchantId');

  return typeof merchantId === 'string' ? { merchantId } : null;
};

@model({
  type: 'entity',
  settings: { access: { resolve }, query: { filter: { where: { deletedAt: null } } } },
})
class Item extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@model({
  type: 'entity',
  settings: {
    access: { resolve, onMissing: ScopeFilterMissingBehaviors.ALLOW },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class OpenItem extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@datasource({ driver: LibSqlDriver })
class ExecutionSqliteDataSource extends BaseSqliteDataSource<
  { url: string },
  TAnyDataSourceSchema,
  {},
  Client
> {
  constructor(opts: { client: Client }) {
    super({
      name: ExecutionSqliteDataSource.name,
      config: { url: ':memory:' },
      schema: { [TABLE_NAME]: itemsTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}
}

const store = new AsyncLocalStorage<IExecutionFrame>();
let client: Client;
let dataSource: ExecutionSqliteDataSource;
let previous: typeof globalThis.ignisExecutionRunner;

const repository = (entityClass: typeof Item | typeof OpenItem = Item) =>
  new SoftDeletableSqliteRepository<typeof itemsTable>(dataSource, { entityClass });

const framed = <Result>(frame: Partial<IExecutionFrame>, task: () => Promise<Result>) =>
  store.run({ mode: ExecutionModes.SCOPED, values: {}, ...frame }, task);

const system = <Result>(task: () => Promise<Result>) =>
  framed({ mode: ExecutionModes.SYSTEM, reason: 'test', userId: 'reaper' }, task);

const rows = async () => {
  const result = await client.execute(
    `SELECT name, created_by AS createdBy, modified_by AS modifiedBy, deleted_at AS deletedAt FROM ${TABLE_NAME} ORDER BY id`,
  );

  return result.rows.map((row) => ({ ...row }));
};

const refusal = async (task: () => Promise<unknown>) => {
  const [outcome] = await Promise.allSettled([task()]);
  const error: unknown = outcome.status === 'rejected' ? outcome.reason : undefined;

  return isApplicationError(error)
    ? { status: error.statusCode, code: error.normalized.code }
    : outcome.status;
};

beforeAll(async () => {
  previous = globalThis.ignisExecutionRunner;
  globalThis.ignisExecutionRunner = {
    read: () => store.getStore(),
    capture: () => ({ values: {} }),
    run: async (options) => options.task(),
    runFrame: (options) => store.run(options.frame, options.task),
  };
  client = createClient({ url: ':memory:' });
  await client.execute(
    `CREATE TABLE ${TABLE_NAME} (id integer primary key autoincrement, merchant_id text, name text, deleted_at integer, created_by text, modified_by text)`,
  );
  dataSource = new ExecutionSqliteDataSource({ client });
});

afterAll(() => {
  globalThis.ignisExecutionRunner = previous;
  client.close();
});

beforeEach(async () => {
  seen.length = 0;
  RequestContextRegistry.clearResolver();
  await client.executeMultiple(
    `DELETE FROM ${TABLE_NAME}; DELETE FROM sqlite_sequence;
     INSERT INTO ${TABLE_NAME} (merchant_id, name) VALUES ('m-a', 'a'), ('m-b', 'b');`,
  );
});

describe('a system frame', () => {
  test('reads and writes every row without asking resolve', async () => {
    const found = await system(() => repository().find({ filter: { order: ['id asc'] } }));
    await system(() => repository().updateById({ id: 2, data: { name: 'b2' } }));
    await system(() => repository().create({ data: { merchantId: 'm-z', name: 'z' } }));

    expect(found.map((row) => row.name)).toEqual(['a', 'b']);
    expect(seen).toEqual([]);
    const after = await rows();
    expect(after.map((row) => row.name)).toEqual(['a', 'b2', 'z']);
  });

  test('stamps its user, and none when it names none', async () => {
    await system(() => repository().create({ data: { merchantId: 'm-a', name: 'by-reaper' } }));
    await framed({ mode: ExecutionModes.SYSTEM, reason: 'test' }, () =>
      repository().create({ data: { merchantId: 'm-a', name: 'by-nobody' } }),
    );

    const after = await rows();
    expect(after.slice(2).map((row) => row.createdBy)).toEqual(['reaper', null]);
  });
});

describe('a scoped frame', () => {
  test('hands itself to resolve, whose values give the scope', async () => {
    const found = await framed({ values: Object.fromEntries([['merchantId', 'm-b']]) }, () =>
      repository().find({ filter: {} }),
    );

    expect(found.map((row) => row.name)).toEqual(['b']);
    expect(seen.at(-1)?.mode).toBe(ExecutionModes.SCOPED);
  });

  test('stamps its user over the request user', async () => {
    const values = Object.fromEntries([['merchantId', 'm-a']]);
    await framed({ userId: 'job-user', values }, () =>
      repository().updateById({ id: 1, data: { name: 'renamed' } }),
    );

    const after = await rows();
    expect(after[0]?.modifiedBy).toBe('job-user');
  });
});

describe('a write with no scope to resolve', () => {
  const REFUSED = { status: 403, code: RepositoryErrorCodes.SCOPE_WRITE_DENIED };

  for (const [name, task] of [
    ['updateById', () => repository().updateById({ id: 1, data: { name: 'x' } })],
    ['updateBy', () => repository().updateBy({ where: { name: 'a' }, data: { name: 'x' } })],
    ['a soft deleteById', () => repository().deleteById({ id: 1 })],
    [
      'a hard deleteBy',
      () => repository().deleteBy({ where: { name: 'a' }, options: { shouldHardDelete: true } }),
    ],
    ['restoreById', () => repository().restoreById({ id: 1 })],
    ['create', () => repository().create({ data: { merchantId: 'm-a', name: 'x' } })],
  ] as const) {
    test(`${name} is refused, outside every frame and in a frame with no scope`, async () => {
      const result = await refusal(task);
      expect(result).toEqual(REFUSED);
      const result2 = await framed({}, () => refusal(task));
      expect(result2).toEqual(REFUSED);
      const after = await rows();
      expect(after.map((row) => [row.name, row.deletedAt])).toEqual([
        ['a', null],
        ['b', null],
      ]);
    });
  }

  test('a read still answers nothing, and onMissing allow still writes', async () => {
    const found = await repository().find({ filter: {} });
    const updated = await repository(OpenItem).updateById({ id: 1, data: { name: 'open' } });

    expect(found).toEqual([]);
    expect(updated.count).toBe(1);
  });

  test('a row outside a resolved scope is still a count of zero', async () => {
    const values = Object.fromEntries([['merchantId', 'm-a']]);
    const updated = await framed({ values }, () =>
      repository().updateById({ id: 2, data: { name: 'x' } }),
    );

    expect(updated.count).toBe(0);
  });
});
