import { useRequestContext } from '@/base/metadata/request-context';
import { ExecutionTestHarness } from '@/testing';
import { createClient } from '@libsql/client';
import {
  BaseSqliteDataSource,
  BaseSqliteEntity,
  SoftDeletableSqliteRepository,
} from '@venizia/ignis-connectors/sqlite';
import { LibSqlDriver } from '@venizia/ignis-connectors/sqlite/libsql';
import type { TValueOrPromise } from '@venizia/ignis-helpers/common';
import { Execution, ExecutionModes, type IExecutionFrame } from '@venizia/ignis-helpers/core';
import { datasource, model, type TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';

/** A test that boots no application: a repository, or a bare Hono app, gets frames from the harness alone. */
const TABLE_NAME = 'harness_items';

const itemsTable = sqliteTable(TABLE_NAME, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantId: text('merchant_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

/** The scope is the frame's `harnessMerchant` value; none outside one. */
const resolve = (context: { scope?: IExecutionFrame }) => {
  const merchantId: unknown = Reflect.get(context.scope?.values ?? {}, 'harnessMerchant');

  return typeof merchantId === 'string' ? { merchantId } : null;
};

@model({
  type: 'entity',
  settings: { access: { resolve }, query: { filter: { where: { deletedAt: null } } } },
})
class HarnessItem extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@datasource({ driver: LibSqlDriver })
class HarnessDataSource extends BaseSqliteDataSource<{ url: string }, TAnyDataSourceSchema> {
  constructor() {
    super({
      name: HarnessDataSource.name,
      config: { url: ':memory:' },
      schema: { [TABLE_NAME]: itemsTable },
    });
  }

  override configure(): TValueOrPromise<void> {}
}

const client = createClient({ url: ':memory:' });
let previous: typeof globalThis.ignisExecutionRunner;

/** The suite starts with no runner, whatever ran before it in this process. */
beforeAll(async () => {
  previous = globalThis.ignisExecutionRunner;
  globalThis.ignisExecutionRunner = undefined;
  await client.executeMultiple(
    `CREATE TABLE ${TABLE_NAME} (id integer primary key autoincrement, merchant_id text, deleted_at integer);
     INSERT INTO ${TABLE_NAME} (merchant_id) VALUES ('m-a'), ('m-b');`,
  );
});

afterAll(() => {
  globalThis.ignisExecutionRunner = previous;
  client.close();
});

const readFrame = () => {
  const frame = Execution.current();

  return { mode: frame?.mode, hasRequest: frame?.request !== undefined };
};

describe('ExecutionTestHarness.install', () => {
  test('installs the runner once: a second call keeps the first', async () => {
    expect(globalThis.ignisExecutionRunner).toBeUndefined();

    ExecutionTestHarness.install();
    const first = globalThis.ignisExecutionRunner;
    ExecutionTestHarness.install();

    expect(first).toBeDefined();
    expect(globalThis.ignisExecutionRunner).toBe(first);
  });

  test('a repository of a scoped model reads by the frame a test opens', async () => {
    ExecutionTestHarness.install();
    const dataSource = new HarnessDataSource();
    Reflect.set(dataSource, 'client', client);
    const repository = new SoftDeletableSqliteRepository<typeof itemsTable>(dataSource, {
      entityClass: HarnessItem,
    });

    const rows = await Execution.run({
      mode: ExecutionModes.SCOPED,
      values: Object.fromEntries([['harnessMerchant', 'm-b']]),
      task: () => repository.find({ filter: {} }),
    });

    expect(rows.map((row) => row.merchantId)).toEqual(['m-b']);
    const unframed = await repository.find({ filter: {} });

    expect(unframed).toEqual([]);
  });
});

describe('ExecutionTestHarness.mount', () => {
  test('every request of a bare Hono app runs in a scoped frame of its own', async () => {
    globalThis.ignisExecutionRunner = undefined;
    const app = ExecutionTestHarness.mount({ app: new Hono() });
    app.get('/frame', (context) => {
      return context.json({ ...readFrame(), isOwnRequest: useRequestContext() === context });
    });

    const response = await app.request('/frame');

    const body = await response.json();

    expect(body).toEqual({
      mode: ExecutionModes.SCOPED,
      hasRequest: true,
      isOwnRequest: true,
    });
    expect(Execution.current()).toBeUndefined();
  });

  test('without it, a bare app has no frame', async () => {
    ExecutionTestHarness.install();
    const app = new Hono();
    app.get('/frame', (context) => context.json(readFrame()));

    const response = await app.request('/frame');

    const body = await response.json();

    expect(body).toEqual({ hasRequest: false });
  });

  test('a route added before it is not framed', async () => {
    const app = new Hono();
    app.get('/early', (context) => context.json(readFrame()));
    ExecutionTestHarness.mount({ app });

    const response = await app.request('/early');

    const body = await response.json();

    expect(body).toEqual({ hasRequest: false });
  });

  test('mounting twice answers as mounting once', async () => {
    const app = ExecutionTestHarness.mount({
      app: ExecutionTestHarness.mount({ app: new Hono() }),
    });
    app.get('/frame', (context) => context.json(readFrame()));

    const response = await app.request('/frame');

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toEqual({ mode: ExecutionModes.SCOPED, hasRequest: true });
  });

  test('keeps the type of an app with its own variables', async () => {
    const app = ExecutionTestHarness.mount({ app: new Hono<{ Variables: { tenant: string } }>() });
    app.get('/tenant', (context) => {
      context.set('tenant', 't-1');

      return context.text(context.get('tenant'));
    });

    const response = await app.request('/tenant');

    const body = await response.text();

    expect(body).toBe('t-1');
  });
});
