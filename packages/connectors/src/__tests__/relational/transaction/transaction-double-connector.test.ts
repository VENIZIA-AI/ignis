import type { IDatabaseTransaction, TRelationalConnector } from '@/relational/postgres/datasources';
import type { TSqliteConnector } from '@/relational/sqlite/drivers';
import {
  PostgresTransactionDouble,
  SqliteTransactionDouble,
  TransactionDouble,
  TransactionStates,
} from '@/testing';
import { PGlite } from '@electric-sql/pglite';
import { getError } from '@venizia/ignis-helpers/core';
import { afterAll, beforeAll, describe, expect, expectTypeOf, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { integer, pgTable } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { captureRejection } from './parity-suite';

const messageOf = async (opts: { task: Promise<unknown> }): Promise<string | undefined> => {
  const caught = await captureRejection(opts);

  return caught instanceof Error ? caught.message : undefined;
};

const CONNECTOR_UNAVAILABLE =
  '[TransactionDouble] connector is not available - stub the repository method that reached the database';

/** A stub that stands for the real connector, the way a unit test passes it. */
const stubOf = <TConnector>(): TConnector => ({ stub: true }) as unknown as TConnector;

const readConnector = (double: { connector: unknown }): unknown => double.connector;

describe('the connector option', () => {
  test('each double returns the connector it was given, the same reference every read', () => {
    const connector = stubOf<TRelationalConnector>();
    const sqliteConnector = stubOf<TSqliteConnector>();

    for (const double of [
      new TransactionDouble({ connector }),
      new PostgresTransactionDouble({ connector }),
      new SqliteTransactionDouble({ connector: sqliteConnector }),
    ]) {
      expect(double.connector).toBe(double.connector);
      expect(double.connector).toBeObject();
    }

    expect(new PostgresTransactionDouble({ connector }).connector).toBe(connector);
    expect(new SqliteTransactionDouble({ connector: sqliteConnector }).connector).toBe(
      sqliteConnector,
    );
    expect(new TransactionDouble({ connector }).connector).toBe(connector);
  });

  test('without it the getter throws the same error as before, also for `connector: undefined`', () => {
    for (const double of [
      new TransactionDouble(),
      new PostgresTransactionDouble(),
      new SqliteTransactionDouble(),
      new TransactionDouble({ connector: undefined }),
      new PostgresTransactionDouble({ commitError: getError({ message: 'x' }) }),
    ]) {
      expect(() => readConnector(double)).toThrow(CONNECTOR_UNAVAILABLE);
    }
  });

  test('a connector does not change the lifecycle: it still commits once and refuses a second end', async () => {
    const double = new PostgresTransactionDouble({ connector: stubOf<TRelationalConnector>() });

    await double.commit();
    const second = await messageOf({ task: double.commit() });

    expect(double.state).toBe(TransactionStates.COMMITTED);
    expect(double.commitCount).toBe(1);
    expect(second).toBeString();
  });
});

describe('the connector type', () => {
  test('is the type the option was given, and `never` without one', () => {
    const postgres = new PostgresTransactionDouble({ connector: stubOf<TRelationalConnector>() });
    const sqlite = new SqliteTransactionDouble({ connector: stubOf<TSqliteConnector>() });
    const plain = new PostgresTransactionDouble();
    const named = new PostgresTransactionDouble<TRelationalConnector>({
      connector: stubOf<TRelationalConnector>(),
    });

    expectTypeOf(postgres.connector).toEqualTypeOf<TRelationalConnector>();
    expectTypeOf(sqlite.connector).toEqualTypeOf<TSqliteConnector>();
    expectTypeOf(named.connector).toEqualTypeOf<TRelationalConnector>();
    expectTypeOf<(typeof plain)['connector']>().toBeNever();
    expectTypeOf<TransactionDouble['connector']>().toBeNever();
    expectTypeOf(plain).toEqualTypeOf<PostgresTransactionDouble<never>>();
  });

  test('a stub of another type is refused where the real type is named', () => {
    // @ts-expect-error a stub that is not the connector type does not fit `TRelationalConnector`
    const refused = new PostgresTransactionDouble<TRelationalConnector>({ connector: { stub: 1 } });

    expect(readConnector(refused)).toEqual({ stub: 1 });
  });
});

describe('onCommit and onRollback', () => {
  test('onCommit runs once per commit, after the count goes up, and onRollback not at all', async () => {
    const seen: Array<{ commits: number; rollbacks: number }> = [];
    let rolledBack = 0;
    const double: PostgresTransactionDouble = new PostgresTransactionDouble({
      onCommit: () => {
        seen.push({ commits: double.commitCount, rollbacks: double.rollbackCount });
      },
      onRollback: () => {
        rolledBack++;
      },
    });

    await double.commit();

    expect(seen).toEqual([{ commits: 1, rollbacks: 0 }]);
    expect(rolledBack).toBe(0);
  });

  test('onRollback runs once per rollback, and onCommit not at all', async () => {
    let committed = 0;
    let rolledBack = 0;
    const double = new SqliteTransactionDouble({
      onCommit: () => {
        committed++;
      },
      onRollback: () => {
        rolledBack++;
      },
    });

    await double.rollback();

    expect({ committed, rolledBack }).toEqual({ committed: 0, rolledBack: 1 });
    expect(double.state).toBe(TransactionStates.ROLLED_BACK);
  });

  test('a second end that the lifecycle refuses does not call the hook again', async () => {
    let committed = 0;
    const double = new TransactionDouble({
      onCommit: () => {
        committed++;
      },
    });

    await double.commit();
    await messageOf({ task: double.commit() });
    await messageOf({ task: double.rollback() });

    expect(committed).toBe(1);
  });

  test('an async hook is awaited before commit() resolves', async () => {
    const order: string[] = [];
    const double = new TransactionDouble({
      onCommit: async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        order.push('hook');
      },
    });

    await double.commit();
    order.push('after');

    expect(order).toEqual(['hook', 'after']);
  });

  test('the hook runs before an injected error, so a test sees a failed end too', async () => {
    const order: string[] = [];
    const double = new PostgresTransactionDouble({
      commitError: getError({ message: 'deadlock' }),
      onCommit: () => {
        order.push('hook');
      },
    });

    const message = await messageOf({ task: double.commit() });

    expect(order).toEqual(['hook']);
    expect(message).toContain('deadlock');
    expect(double.state).toBe(TransactionStates.FAILED);
    expect(double.commitCount).toBe(1);
  });

  test('a throw from a hook fails the end like commitError does', async () => {
    const double = new TransactionDouble({
      onRollback: () => {
        throw getError({ message: 'hook refused' });
      },
    });

    const message = await messageOf({ task: double.rollback() });

    expect(message).toContain('hook refused');
    expect(double.state).toBe(TransactionStates.FAILED);
    expect(double.rollbackCount).toBe(1);
  });
});

/**
 * PGlite has no double of its own: its connector is the same `PgDatabase` the Postgres double names,
 * so `PostgresTransactionDouble` is the PGlite double. The connector below is a real in-process PGlite.
 */
describe('PGlite shares the Postgres double', () => {
  const schema = { items: pgTable('double_items', { id: integer('id').primaryKey() }) };
  type TSchema = typeof schema;

  let client: PGlite;
  let connector: PgliteDatabase<TSchema>;

  beforeAll(async () => {
    client = new PGlite();
    await client.waitReady;
    connector = drizzle({ client, schema });
  });

  afterAll(async () => {
    await client.close();
  });

  test('a PGlite connector is accepted as the connector type, and runs a query through the double', async () => {
    const double = new PostgresTransactionDouble<TRelationalConnector<TSchema>>({ connector });
    const result = await double.connector.execute(sql`select 1 as one`);

    expectTypeOf(double.connector).toEqualTypeOf<TRelationalConnector<TSchema>>();
    expect(result).toMatchObject({ rows: [{ one: 1 }] });
  });

  test('a double carrying the PGlite connector is accepted where a Postgres transaction is asked for', () => {
    const double = new PostgresTransactionDouble({ connector });
    const asHandle: IDatabaseTransaction<TSchema> = double;

    expectTypeOf(double.connector).toEqualTypeOf<PgliteDatabase<TSchema>>();
    expect(asHandle.connector).toBe(connector);
  });
});
