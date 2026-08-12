import type { TSqliteConnector } from '@/connectors/sqlite/drivers';
import { SqliteQueryExecutor } from '@/connectors/sqlite/repositories/executor';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { expectRejection } from '../../../rejection.helper';

const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  age: integer('age'),
});

type TUser = typeof users.$inferSelect;

describe('SqliteQueryExecutor - against a real in-memory libsql database', () => {
  let client: Client;
  let connector: TSqliteConnector<{ users: typeof users }>;
  const executor = new SqliteQueryExecutor();

  beforeAll(async () => {
    client = createClient({ url: ':memory:' });
    connector = drizzle({ client, schema: { users } });

    await client.execute(`
      CREATE TABLE users (
        id integer primary key autoincrement,
        email text not null,
        age integer
      )
    `);
  });

  afterAll(() => {
    client.close();
  });

  beforeEach(async () => {
    await client.executeMultiple(`
      DELETE FROM users;
      INSERT INTO users (id, email, age) VALUES (1, 'a@b.c', 30), (2, 'd@e.f', 40), (3, 'g@h.i', 50);
    `);
  });

  test('select applies where, orderBy, limit and offset', async () => {
    const rows = await executor.select<TUser>({
      connector,
      table: users,
      where: sql`${users.age} >= 30`,
      orderBy: [asc(users.id)],
      limit: 2,
      offset: 1,
    });

    expect(rows.map(row => row.id)).toEqual([2, 3]);
  });

  test('select with a column projection returns only those columns', async () => {
    const rows = await executor.select<{ id: number }>({
      connector,
      table: users,
      columns: { id: users.id },
      orderBy: [asc(users.id)],
    });

    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  // The `where` is what makes this discriminating: without it an executor that dropped the filter
  // and counted the whole table would still satisfy the assertion.
  test('count honours its where', async () => {
    const total = await executor.count({ connector, table: users, where: eq(users.id, 2) });

    expect(total).toBe(1);
  });

  test('insert returns the created row', async () => {
    const result = await executor.insert<TUser>({
      connector,
      table: users,
      values: { email: 'new@b.c', age: 21 },
      shouldReturn: true,
    });

    expect(result.count).toBe(1);
    expect(result.rows[0]).toMatchObject({ email: 'new@b.c', age: 21 });
  });

  test('insert with shouldReturn false reports the libsql affected-row count', async () => {
    const result = await executor.insert<TUser>({
      connector,
      table: users,
      values: [
        { email: 'x@b.c', age: 1 },
        { email: 'y@b.c', age: 2 },
      ],
      shouldReturn: false,
    });

    expect(result).toEqual({ count: 2, rows: [] });
  });

  test('update returns the changed rows', async () => {
    const result = await executor.update<{ id: number; age: number }>({
      connector,
      table: users,
      data: { age: 99 },
      where: eq(users.id, 1),
      returning: { id: users.id, age: users.age },
      shouldReturn: true,
    });

    expect(result).toEqual({ count: 1, rows: [{ id: 1, age: 99 }] });
  });

  test('update with shouldReturn false reports a truthful count for a multi-row match', async () => {
    const result = await executor.update<TUser>({
      connector,
      table: users,
      data: { age: 1 },
      where: sql`${users.age} >= 40`,
      shouldReturn: false,
    });

    expect(result).toEqual({ count: 2, rows: [] });
  });

  test('remove returns the deleted rows', async () => {
    const result = await executor.remove<TUser>({
      connector,
      table: users,
      where: eq(users.id, 3),
      shouldReturn: true,
    });

    const remaining = await executor.count({ connector, table: users });

    expect(result.count).toBe(1);
    expect(result.rows[0]).toMatchObject({ id: 3 });
    expect(remaining).toBe(2);
  });

  test('remove with shouldReturn false reports the libsql affected-row count', async () => {
    const result = await executor.remove<TUser>({
      connector,
      table: users,
      where: sql`${users.age} >= 40`,
      shouldReturn: false,
    });

    expect(result).toEqual({ count: 2, rows: [] });
  });

  test('findMany reaches the relational query interface', async () => {
    const rows = await executor.findMany<TUser>({
      connector,
      entityName: 'users',
      query: { where: eq(users.id, 2) },
    });

    expect(rows).toEqual([{ id: 2, email: 'd@e.f', age: 40 }]);
  });

  test('findFirst strips limit, which Drizzle structurally forbids', async () => {
    const result = await executor.findFirst<TUser>({
      connector,
      entityName: 'users',
      query: { where: eq(users.id, 2), limit: 5 },
    });

    expect(result).toEqual({ id: 2, email: 'd@e.f', age: 40 });
  });

  test('findFirst returns null when nothing matches', async () => {
    const result = await executor.findFirst<TUser>({
      connector,
      entityName: 'users',
      query: { where: eq(users.id, 404) },
    });

    expect(result).toBeNull();
  });

  test('findMany throws a schema key mismatch error naming the entity and available keys', async () => {
    await expectRejection({
      task: executor.findMany({ connector, entityName: 'articles', query: {} }),
      message:
        "[SqliteQueryExecutor] Schema key mismatch | Entity name 'articles' not found in connector.query | Available keys: [users] | Ensure the model's TABLE_NAME matches the schema registration key",
    });
  });

  test('a caller-supplied scope names the thrown error instead of the executor class', async () => {
    await expectRejection({
      task: executor.findFirst({
        connector,
        entityName: 'articles',
        query: {},
        scope: 'ProductRepository',
      }),
      message: /^\[ProductRepository\] Schema key mismatch/,
    });
  });

  test('select with a lock throws NotSupported - SQLite has no row locking', async () => {
    await expectRejection({
      task: executor.select({
        connector,
        table: users,
        lock: { strength: 'update' },
      }),
      message: /Row-level locking \(SELECT \.\.\. FOR UPDATE\) is not supported/,
    });
  });
});

describe('SqliteQueryExecutor - missing query interface', () => {
  test('findMany names the missing schema registration', async () => {
    const connectorWithoutQuery = { query: undefined } as AnyType;

    await expectRejection({
      task: new SqliteQueryExecutor().findMany({
        connector: connectorWithoutQuery,
        entityName: 'users',
        query: {},
      }),
      message: /Connector query interface not available/,
    });
  });
});
