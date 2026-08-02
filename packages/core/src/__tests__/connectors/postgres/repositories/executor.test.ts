import { describe, expect, test } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { PostgresQueryExecutor } from '@/connectors/postgres/repositories/executor';

const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
});

/** Chainable stub recording the builder path the executor walked. */
const createFakeConnector = () => {
  const trail: string[] = [];
  const captured: { countWhere?: unknown } = {};
  const chain: Record<string, unknown> = {};
  for (const method of [
    'from',
    '$dynamic',
    'where',
    'orderBy',
    'limit',
    'offset',
    'for',
    'values',
    'set',
    'returning',
  ]) {
    chain[method] = (...args: unknown[]) => {
      trail.push(`${method}(${args.length})`);
      return chain;
    };
  }
  // Read paths (select) expect an array; write paths without `.returning()` expect a driver
  // result shape (`pg.QueryResult`-like). A non-zero `rowCount` makes the `shouldReturn: false`
  // count assertions discriminating - a hardcoded `count: 0` return would fail against this.
  (chain as { then?: unknown }).then = (resolve: (value: unknown) => void) =>
    resolve({ rows: [], rowCount: 3 });

  return {
    trail,
    captured,
    connector: {
      select: (...args: unknown[]) => {
        trail.push(`select(${args.length})`);
        return chain;
      },
      insert: () => {
        trail.push('insert');
        return chain;
      },
      update: () => {
        trail.push('update');
        return chain;
      },
      delete: () => {
        trail.push('delete');
        return chain;
      },
      $count: async (_table: unknown, where?: unknown) => {
        trail.push('$count');
        captured.countWhere = where;
        return 7;
      },
    },
  };
};

/** Fake `connector.query[entityName]` relational-query interface, recording the config object each call receives. */
const createFakeQueryConnector = (opts: {
  entries: Record<string, unknown>;
  findManyResult?: unknown[];
  findFirstResult?: unknown;
}) => {
  const calls: { findMany?: unknown; findFirst?: unknown } = {};
  const query: Record<string, unknown> = {};

  for (const entityName of Object.keys(opts.entries)) {
    query[entityName] = {
      findMany: (config: unknown) => {
        calls.findMany = config;
        return Promise.resolve(opts.findManyResult ?? []);
      },
      findFirst: (config: unknown) => {
        calls.findFirst = config;
        return Promise.resolve(opts.findFirstResult ?? null);
      },
    };
  }

  return { calls, connector: { query } };
};

describe('PostgresQueryExecutor', () => {
  test('select applies where, orderBy, limit and offset in order', async () => {
    const { connector, trail } = createFakeConnector();
    const executor = new PostgresQueryExecutor();

    await executor.select({
      connector: connector as never,
      table: usersTable,
      where: sql`1 = 1`,
      orderBy: [sql`id desc`],
      limit: 10,
      offset: 20,
    });

    expect(trail).toEqual([
      'select(0)',
      'from(1)',
      '$dynamic(0)',
      'where(1)',
      'orderBy(1)',
      'limit(1)',
      'offset(1)',
    ]);
  });

  test('select with a column projection passes the projection to select()', async () => {
    const { connector, trail } = createFakeConnector();
    await new PostgresQueryExecutor().select({
      connector: connector as never,
      table: usersTable,
      columns: { id: usersTable.id },
    });
    expect(trail[0]).toBe('select(1)');
  });

  // The `where` is what makes this discriminating: without it an executor that dropped the filter
  // and counted the whole table would still satisfy the assertion.
  test('count delegates to $count, passing its where through', async () => {
    const { connector, captured } = createFakeConnector();
    const where = sql`id = 1`;

    const total = await new PostgresQueryExecutor().count({
      connector: connector as never,
      table: usersTable,
      where,
    });

    expect(total).toBe(7);
    expect(captured.countWhere).toBe(where);
  });

  test('insert with shouldReturn false never calls returning() and reports the driver count', async () => {
    const { connector, trail } = createFakeConnector();
    const result = await new PostgresQueryExecutor().insert({
      connector: connector as never,
      table: usersTable,
      values: { email: 'a@b.c' },
      shouldReturn: false,
    });
    expect(trail).toEqual(['insert', 'values(1)']);
    expect(result).toEqual({ count: 3, rows: [] });
  });

  test('update applies set, where and returning in order', async () => {
    const { connector, trail } = createFakeConnector();
    await new PostgresQueryExecutor().update({
      connector: connector as never,
      table: usersTable,
      data: { email: 'new@b.c' },
      where: sql`id = 1`,
      shouldReturn: true,
    });
    expect(trail).toEqual(['update', 'set(1)', 'where(1)', 'returning(0)']);
  });

  test('update with shouldReturn false never calls returning() and reports the driver count', async () => {
    const { connector, trail } = createFakeConnector();
    const result = await new PostgresQueryExecutor().update({
      connector: connector as never,
      table: usersTable,
      data: { email: 'new@b.c' },
      where: sql`id = 1`,
      shouldReturn: false,
    });
    expect(trail).toEqual(['update', 'set(1)', 'where(1)']);
    expect(result).toEqual({ count: 3, rows: [] });
  });

  test('remove applies where then returning in order', async () => {
    const { connector, trail } = createFakeConnector();
    await new PostgresQueryExecutor().remove({
      connector: connector as never,
      table: usersTable,
      where: sql`id = 1`,
      shouldReturn: true,
    });
    expect(trail).toEqual(['delete', 'where(1)', 'returning(0)']);
  });

  test('remove with shouldReturn false never calls returning() and reports the driver count', async () => {
    const { connector, trail } = createFakeConnector();
    const result = await new PostgresQueryExecutor().remove({
      connector: connector as never,
      table: usersTable,
      where: sql`id = 1`,
      shouldReturn: false,
    });
    expect(trail).toEqual(['delete', 'where(1)']);
    expect(result).toEqual({ count: 3, rows: [] });
  });

  test('findMany reaches connector.query[entityName].findMany with the query passed through', async () => {
    const { connector, calls } = createFakeQueryConnector({
      entries: { users: {} },
      findManyResult: [{ id: 1 }],
    });
    const query = { where: sql`1 = 1`, limit: 5 };

    const rows = await new PostgresQueryExecutor().findMany({
      connector: connector as never,
      entityName: 'users',
      query,
    });

    expect(calls.findMany).toBe(query);
    expect(rows).toEqual([{ id: 1 }]);
  });

  test('findFirst strips limit before reaching connector.query[entityName].findFirst', async () => {
    const { connector, calls } = createFakeQueryConnector({
      entries: { users: {} },
      findFirstResult: { id: 1 },
    });
    const where = sql`1 = 1`;

    const result = await new PostgresQueryExecutor().findFirst({
      connector: connector as never,
      entityName: 'users',
      query: { where, limit: 1 },
    });

    expect(calls.findFirst).toEqual({ where });
    expect(Object.keys(calls.findFirst as object)).not.toContain('limit');
    expect(result).toEqual({ id: 1 });
  });

  test('findMany throws a schema key mismatch error naming the entity and available keys', async () => {
    const { connector } = createFakeQueryConnector({ entries: { articles: {} } });

    expect(
      new PostgresQueryExecutor().findMany({
        connector: connector as never,
        entityName: 'users',
        query: {},
      }),
    ).rejects.toThrow(
      "[PostgresQueryExecutor] Schema key mismatch | Entity name 'users' not found in connector.query | Available keys: [articles] | Ensure the model's TABLE_NAME matches the schema registration key",
    );
  });

  test('a caller-supplied scope names the thrown error instead of the executor class', async () => {
    const { connector } = createFakeQueryConnector({ entries: { articles: {} } });

    expect(
      new PostgresQueryExecutor().findFirst({
        connector: connector as never,
        entityName: 'users',
        query: {},
        scope: 'ProductRepository',
      }),
    ).rejects.toThrow(/^\[ProductRepository\] Schema key mismatch/);
  });
});
