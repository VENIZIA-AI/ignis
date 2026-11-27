import { datasource, type TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { TransactionErrors } from '@/relational/core/datasources';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { NodePostgresDriver } from '@/relational/postgres/drivers/node-postgres';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { PostgresJsDriver } from '@/relational/postgres/drivers/postgres-js';
import { PGlite } from '@electric-sql/pglite';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createFakePool } from '../postgres/drivers/fake-pg-client';
import { createFakeSql } from '../postgres/drivers/fake-postgres-js-client';

// A PGlite instance starts a Postgres in WebAssembly. Set only on the files whose tests CI logs showed over the
// threshold: up to 9.1 s here, in a parallel run on a small runner.
setDefaultTimeout(30_000);

@datasource({ driver: PGliteDriver, autoDiscovery: false })
class MemoryDataSource extends BasePostgresDataSource<{}, TAnyDataSourceSchema, {}, PGlite> {
  constructor() {
    super({ name: MemoryDataSource.name, config: {}, schema: {} });
  }

  override async configure(): Promise<void> {
    const client = new PGlite();
    await client.query('CREATE TABLE ledger (id int PRIMARY KEY)');
    this.client = client;
  }

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }
}

const countRows = async (opts: { client: PGlite }): Promise<number | undefined> => {
  const result = await opts.client.query<{ n: number }>('SELECT count(*)::int AS n FROM ledger');

  return result.rows[0]?.n;
};

/** The application catches a failed statement and carries on, as a handler that treats a duplicate (23505) as "already there" does. The caught error is returned. */
const insertCaught = async (opts: { client: PGlite; id: number }): Promise<unknown> => {
  try {
    await opts.client.query(`INSERT INTO ledger VALUES (${opts.id})`);

    return undefined;
  } catch (error) {
    return error;
  }
};

describe('COMMIT answered with ROLLBACK', () => {
  test('a transaction whose statement failed and was caught throws on commit, and saves nothing', async () => {
    const dataSource = new MemoryDataSource();
    await dataSource.configure();
    const client = dataSource.getClient();

    try {
      const transaction = await dataSource.beginTransaction();
      await insertCaught({ client, id: 1 });
      const duplicate = await insertCaught({ client, id: 1 });
      expect(duplicate).toMatchObject({ code: '23505' });

      const error = await RejectionUtility.rejectionOf({ task: transaction.commit() });

      expect(error).toMatchObject({
        message: TransactionErrors.COMMIT_ROLLED_BACK.message.text,
        statusCode: 500,
        normalized: { code: TransactionErrors.COMMIT_ROLLED_BACK.message.code },
      });

      const saved = await countRows({ client });
      expect(saved).toBe(0);

      // The caller's own `catch { await transaction.rollback() }` must not throw over the error above.
      await transaction.rollback();
    } finally {
      await dataSource.close();
    }
  });

  test('a healthy transaction still commits, and the connection is free for the next one', async () => {
    const dataSource = new MemoryDataSource();
    await dataSource.configure();
    const client = dataSource.getClient();

    try {
      const first = await dataSource.beginTransaction();
      await insertCaught({ client, id: 1 });
      await first.commit();

      const second = await dataSource.beginTransaction();
      await second.rollback();

      const saved = await countRows({ client });
      expect(saved).toBe(1);
    } finally {
      await dataSource.close();
    }
  });
});

describe('the command tag each driver reports', () => {
  test('node-postgres: `command` of the pg result', async () => {
    const pool = createFakePool({ command: 'ROLLBACK' });
    const driver = new NodePostgresDriver({ client: pool });
    const connection = await driver.acquire({ schema: {} });
    const result = await connection.execute({ statement: 'COMMIT' });

    expect(result).toEqual({ count: 0, command: 'ROLLBACK' });
  });

  test('postgres-js: `command` of the RowList', async () => {
    const sql = createFakeSql({ command: 'ROLLBACK' });
    const driver = new PostgresJsDriver({ client: sql });
    const connection = await driver.acquire({ schema: {} });
    const result = await connection.execute({ statement: 'COMMIT' });

    expect(result).toEqual({ count: 0, command: 'ROLLBACK' });
  });

  test('PGlite: `command` of the query result', async () => {
    const driver = new PGliteDriver({ client: new PGlite() });
    const connection = await driver.acquire({ schema: {} });

    try {
      const begun = await connection.execute({ statement: 'BEGIN' });
      const committed = await connection.execute({ statement: 'COMMIT' });

      expect(begun.command).toBe('BEGIN');
      expect(committed.command).toBe('COMMIT');
    } finally {
      connection.release();
      await driver.end();
    }
  });
});
