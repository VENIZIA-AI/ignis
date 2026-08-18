import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { expectRejection } from '../../rejection.helper';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * SQLite's write-transaction verb: it takes the write lock
 * immediately instead of upgrading later and failing.
 */
const BEGIN = 'BEGIN IMMEDIATE';

describe('LibSqlDriver - constructor guard', () => {
  test('rejects a `bun:sqlite`-shaped Database', () => {
    const databaseShaped = {
      prepare: () => undefined,
      exec: () => undefined,
      query: () => undefined,
      close: () => undefined,
    };

    expect(() => new LibSqlDriver({ client: databaseShaped as AnyType })).toThrow(
      /Expected an `@libsql\/client` Client/,
    );
  });

  test('rejects a `pg.Pool`-shaped object', () => {
    const poolShaped = { connect: () => undefined, query: () => undefined, end: () => undefined };

    expect(() => new LibSqlDriver({ client: poolShaped as AnyType })).toThrow(/LibSqlDriver/);
  });
});

describe('LibSqlDriver - against a real in-memory libsql database', () => {
  let client: Client;
  let driver: LibSqlDriver<AnyType>;

  beforeAll(async () => {
    client = createClient({ url: ':memory:' });
    driver = new LibSqlDriver<AnyType>({ client });

    await client.executeMultiple(`
      CREATE TABLE rollback_probe (id integer primary key);
      CREATE TABLE serialisation_probe (id integer primary key);
    `);
  });

  afterAll(async () => {
    await driver.end();
  });

  test('execute() runs BEGIN IMMEDIATE / COMMIT verbatim and maps rowsAffected', async () => {
    const connection = await driver.acquire({ schema: {} });

    const begin = await connection.execute({ statement: BEGIN });
    const insert = await connection.execute({
      statement: 'INSERT INTO serialisation_probe (id) VALUES (1),(2),(3)',
    });
    const commit = await connection.execute({ statement: 'COMMIT' });
    connection.release();

    const rows = (await client.execute('SELECT id FROM serialisation_probe ORDER BY id')).rows;

    expect({ begin: begin.count, insert: insert.count, commit: commit.count }).toEqual({
      begin: 0,
      insert: 3,
      commit: 0,
    });
    expect(rows.map(row => row['id'])).toEqual([1, 2, 3]);
  });

  test('a rolled-back transaction really rolls back', async () => {
    const connection = await driver.acquire({ schema: {} });
    await connection.execute({ statement: BEGIN });
    await connection.execute({ statement: 'INSERT INTO rollback_probe (id) VALUES (7)' });

    // Read through the acquired connector, which proves it
    // is bound to the connection holding the transaction.
    const inside = await connection.connector.all<{ id: number }>(
      sql`SELECT id FROM rollback_probe`,
    );
    expect(inside).toEqual([{ id: 7 }]);

    await connection.execute({ statement: 'ROLLBACK' });
    connection.release();

    const after = await client.execute('SELECT id FROM rollback_probe');
    expect(after.rows).toHaveLength(0);
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
    await first.execute({ statement: 'INSERT INTO rollback_probe (id) VALUES (99)' });

    // The single connection cannot be thrown away, so discard must scrub it - otherwise the next
    // borrower inherits this open transaction.
    first.release({ destroy: true });

    const second = await driver.acquire({ schema: {} });
    const rows = await second.connector.all<{ id: number }>(sql`SELECT id FROM rollback_probe`);
    second.release();

    expect(rows).toEqual([]);
  });

  test('createConnector() round-trips rows through Drizzle', async () => {
    const connector = driver.createConnector({ schema: {} });

    await connector.run(sql`INSERT INTO rollback_probe (id) VALUES (42)`);
    const rows = await connector.all<{ id: number }>(sql`SELECT id FROM rollback_probe`);
    await client.execute('DELETE FROM rollback_probe');

    expect(rows).toEqual([{ id: 42 }]);
  });

  test('getClient() returns the raw Client the driver was constructed with', () => {
    expect(driver.getClient()).toBe(client);
  });
});

/**
 * Its own client: these tests deliberately strand the single
 * slot, which would poison every later test sharing the instance.
 */
describe('LibSqlDriver - acquire timeout', () => {
  let client: Client;
  let driver: LibSqlDriver<AnyType>;

  beforeAll(async () => {
    client = createClient({ url: ':memory:' });

    // Short enough to assert without the suite waiting; the shipped default is 30s.
    driver = new LibSqlDriver<AnyType>({ client, acquireTimeoutMs: 150 });

    await client.execute('CREATE TABLE timeout_probe (id integer primary key)');
  });

  afterAll(async () => {
    await driver.end();
  });

  test('defaults to a bounded wait rather than waiting forever', () => {
    expect(LibSqlDriver.DEFAULT_ACQUIRE_TIMEOUT_MS).toBe(30_000);
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
      /\[LibSqlDriver\]\[acquire\].+timed out after 150ms/,
    );

    await held.execute({ statement: 'ROLLBACK' });
    held.release();
  });

  test('a transaction well inside the timeout is unaffected', async () => {
    const first = await driver.acquire({ schema: {} });
    await first.execute({ statement: BEGIN });
    await first.execute({ statement: 'INSERT INTO timeout_probe (id) VALUES (1)' });

    const secondPromise = driver.acquire({ schema: {} });

    await sleep(30);
    await first.execute({ statement: 'COMMIT' });
    first.release();

    const second = await secondPromise;
    const rows = await second.connector.all<{ id: number }>(sql`SELECT id FROM timeout_probe`);
    second.release();

    expect(rows).toEqual([{ id: 1 }]);
  });
});

describe('LibSqlDriver - remote client', () => {
  test('acquire() throws NotSupported: a remote statement runs on its own connection', async () => {
    const remoteClient = createClient({ url: 'http://127.0.0.1:1' });
    const driver = new LibSqlDriver<AnyType>({ client: remoteClient });

    await expectRejection({
      task: driver.acquire({ schema: {} }),
      message: /Explicit transactions over a 'http' libsql client/,
    });

    remoteClient.close();
  });
});
