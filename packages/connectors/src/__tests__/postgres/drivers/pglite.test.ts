import { PGlite } from '@electric-sql/pglite';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/relational/postgres/repositories/executor';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * The neutral `PgDatabase` types `execute()` through the
 * driver's result HKT, which erases to `unknown` here.
 */
const executeRows = async (opts: {
  connector: AnyType;
  statement: SQL;
}): Promise<Array<AnyType>> => {
  const result = await opts.connector.execute(opts.statement);
  return result.rows;
};

const BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED';

const roundTripTable = pgTable('pglite_round_trip', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

class RoundTripEntity extends BasePostgresEntity {
  static override TABLE_NAME = 'pglite_round_trip';
  static override schema = roundTripTable;
}

describe('PGliteDriver - constructor guard', () => {
  test('rejects a `pg.Pool`-shaped object', () => {
    const poolShaped = {
      connect: () => undefined,
      query: () => undefined,
      end: () => undefined,
      totalCount: 0,
    };

    expect(() => new PGliteDriver({ client: poolShaped as AnyType })).toThrow(/PGlite/);
  });

  test('rejects a `postgres` Sql-shaped object', () => {
    const sqlShaped = { reserve: () => undefined, unsafe: () => undefined, end: () => undefined };

    expect(() => new PGliteDriver({ client: sqlShaped as AnyType })).toThrow(/PGlite/);
  });
});

/**
 * ONE in-memory PGlite for every behavioural test - a boot costs
 * seconds, and each test owns its own table so they never collide.
 */
describe('PGliteDriver - against a real PGlite instance', () => {
  let client: PGlite;
  let driver: PGliteDriver<AnyType>;

  beforeAll(async () => {
    client = new PGlite();
    await client.waitReady;
    driver = new PGliteDriver<AnyType>({ client });

    await client.exec(`
      CREATE TABLE serialisation_probe (id int primary key);
      CREATE TABLE rollback_probe (id int primary key);
      CREATE TABLE pglite_round_trip (
        id uuid primary key default gen_random_uuid(),
        name varchar(255),
        metadata jsonb,
        created_at timestamptz default now()
      );
    `);
  });

  afterAll(async () => {
    await driver.end();
  });

  test('two overlapping transactions do NOT interleave', async () => {
    const first = await driver.acquire({ schema: {} });
    await first.execute({ statement: BEGIN });
    await first.connector.execute(sql`INSERT INTO serialisation_probe (id) VALUES (1)`);

    // B starts WITHOUT awaiting A's commit. On the raw client its BEGIN silently joins
    // A's transaction, so A's COMMIT commits B's row and B's ROLLBACK is a no-op.
    let hasSecondStarted = false;
    const second = (async () => {
      const connection = await driver.acquire({ schema: {} });
      hasSecondStarted = true;

      await connection.execute({ statement: BEGIN });
      await connection.connector.execute(sql`INSERT INTO serialisation_probe (id) VALUES (2)`);
      await connection.execute({ statement: 'ROLLBACK' });
      connection.release();
    })();

    await sleep(50);
    const hasSecondRunInsideFirst = hasSecondStarted;

    await first.execute({ statement: 'COMMIT' });
    first.release();
    await second;

    const rows = (
      await client.query<{ id: number }>('SELECT id FROM serialisation_probe ORDER BY id')
    ).rows;

    // One assertion over both facts, so a regression reports the
    // ordering AND the surviving row rather than stopping at the first.
    expect({ ranInsideFirst: hasSecondRunInsideFirst, rows }).toEqual({
      ranInsideFirst: false,
      rows: [{ id: 1 }],
    });
  });

  test('a rolled-back transaction really rolls back', async () => {
    const connection = await driver.acquire({ schema: {} });
    await connection.execute({ statement: BEGIN });
    await connection.connector.execute(sql`INSERT INTO rollback_probe (id) VALUES (7)`);

    const inside = await executeRows({
      connector: connection.connector,
      statement: sql`SELECT id FROM rollback_probe`,
    });
    expect(inside).toHaveLength(1);

    await connection.execute({ statement: 'ROLLBACK' });
    connection.release();

    const after = await client.query('SELECT id FROM rollback_probe');
    expect(after.rows).toEqual([]);
  });

  test('acquire() while the slot is held WAITS, and proceeds once released', async () => {
    const order: Array<string> = [];

    const first = await driver.acquire({ schema: {} });
    order.push('first acquired');

    const secondPromise = driver.acquire({ schema: {} }).then(connection => {
      order.push('second acquired');
      return connection;
    });

    await sleep(50);
    order.push('still waiting');

    first.release();
    order.push('first released');

    const second = await secondPromise;
    second.release();

    expect(order).toEqual(['first acquired', 'still waiting', 'first released', 'second acquired']);
  });

  test('release({ destroy: true }) frees the slot and scrubs a left-open transaction', async () => {
    const first = await driver.acquire({ schema: {} });
    await first.execute({ statement: BEGIN });
    await first.connector.execute(sql`INSERT INTO rollback_probe (id) VALUES (99)`);

    // The single session cannot be thrown away, so discard must scrub
    // it - otherwise the next borrower inherits this open transaction.
    first.release({ destroy: true });

    const second = await driver.acquire({ schema: {} });
    const rows = await executeRows({
      connector: second.connector,
      statement: sql`SELECT id FROM rollback_probe`,
    });
    second.release();

    expect(rows).toEqual([]);
  });

  test('execute() maps PGlite `affectedRows` to the neutral count', async () => {
    const connection = await driver.acquire({ schema: {} });

    const begin = await connection.execute({ statement: BEGIN });
    const insert = await connection.execute({
      statement: 'INSERT INTO rollback_probe (id) VALUES (11),(12),(13)',
    });
    await connection.execute({ statement: 'ROLLBACK' });
    connection.release();

    expect(begin.count).toBe(0);
    expect(insert.count).toBe(3);
  });

  test('a repository round-trips uuid, jsonb and timestamptz through the driver', async () => {
    const dataSource = {
      getQueryDialect: () => new PostgresQueryDialect(),
      getQueryExecutor: () => new PostgresQueryExecutor(),
      getConnector: () => driver.createConnector({ schema: { roundTripTable } }),
    } as AnyType;

    const repository = new DefaultCRUDRepository<AnyType>(dataSource, {
      entityClass: RoundTripEntity,
    });

    const created = await repository.create({
      data: { name: 'pglite', metadata: { engine: 'wasm', score: 7 } },
    });

    expect(created.count).toBe(1);
    expect(created.data.id).toMatch(/^[0-9a-f-]{36}$/);

    const found = await repository.findById({ id: created.data.id });

    expect(found).toMatchObject({
      id: created.data.id,
      name: 'pglite',
      metadata: { engine: 'wasm', score: 7 },
    });
    expect(found.createdAt).toBeInstanceOf(Date);
  });

  test('getClient() returns the raw PGlite the driver was constructed with', () => {
    expect(driver.getClient()).toBe(client);
  });
});

/**
 * Its own PGlite: these tests deliberately strand the single
 * slot, which would poison every later test sharing the instance.
 */
describe('PGliteDriver - acquire timeout', () => {
  let client: PGlite;
  let driver: PGliteDriver<AnyType>;

  beforeAll(async () => {
    client = new PGlite();
    await client.waitReady;

    // Short enough to assert without the suite waiting; the shipped default is 30s.
    driver = new PGliteDriver<AnyType>({ client, acquireTimeoutMs: 150 });

    await client.exec('CREATE TABLE timeout_probe (id int primary key);');
  });

  afterAll(async () => {
    await driver.end();
  });

  test('a transaction held past the timeout makes the next acquire() REJECT, not hang', async () => {
    const held = await driver.acquire({ schema: {} });
    await held.execute({ statement: BEGIN });

    // The leak the timeout exists for: nothing releases
    // `held`, so without a timeout this would never settle.
    let failure: unknown;
    try {
      const starved = await driver.acquire({ schema: {} });
      starved.release();
    } catch (error) {
      failure = error;
    }

    expect((failure as Error)?.message).toMatch(
      /\[PGliteDriver\]\[acquire\].+timed out after 150ms/,
    );

    await held.execute({ statement: 'ROLLBACK' });
    held.release();
  });

  test('a transaction well inside the timeout is unaffected', async () => {
    const first = await driver.acquire({ schema: {} });
    await first.execute({ statement: BEGIN });
    await first.connector.execute(sql`INSERT INTO timeout_probe (id) VALUES (1)`);

    const secondPromise = driver.acquire({ schema: {} });

    await sleep(30);
    await first.execute({ statement: 'COMMIT' });
    first.release();

    const second = await secondPromise;
    const rows = await executeRows({
      connector: second.connector,
      statement: sql`SELECT id FROM timeout_probe`,
    });
    second.release();

    expect(rows).toEqual([{ id: 1 }]);
  });
});

/**
 * Review finding A4: `bun test` in this package printed `1141 pass / 0 fail` and exited 99, because
 * PGlite's Emscripten runtime writes its own status onto the host process during ordinary
 * operation - not at close. The same status reaches any server that embeds PGlite, where Docker and
 * systemd read it as a crash, so the driver clears it on the way out.
 */
describe('PGliteDriver host exit status', () => {
  /**
   * The status is SET here rather than provoked with a query. Measured on 0.5.5: PGlite plants it
   * once per process, at the first WASM instantiation - a manual reset survives every later query,
   * and a second PGlite instance never re-plants it. A test that provoked it would therefore pass
   * or fail on which file `bun test` happened to run first. The end-to-end proof that PGlite still
   * plants it is this package's own suite exit code.
   */
  test('end() clears the status PGlite planted on the host process', async () => {
    const host = globalThis.process;
    const client = new PGlite();
    const driver = new PGliteDriver<AnyType>({ client });

    // The query is load-bearing, not decoration: closing a PGlite that was never queried writes 0
    // to the host exit code on its own, which would make either assertion below meaningless.
    await client.query('SELECT 1');

    host.exitCode = 99;

    await driver.end();

    expect(host.exitCode).toBe(0);
  });

  test('end() leaves an exit code the application set itself alone', async () => {
    const host = globalThis.process;
    const client = new PGlite();
    const driver = new PGliteDriver<AnyType>({ client });

    await client.query('SELECT 1');

    host.exitCode = 3;

    try {
      await driver.end();
      expect(host.exitCode).toBe(3);
    } finally {
      // Never leave the runner carrying a non-zero status - that is the failure under test.
      host.exitCode = 0;
    }
  });
});
