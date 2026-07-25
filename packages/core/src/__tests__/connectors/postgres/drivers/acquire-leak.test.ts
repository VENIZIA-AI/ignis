import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { NodePostgresDriver } from '@/connectors/postgres/drivers/node-postgres';

/** `acquire()` checks a connection OUT before building the Drizzle connector: if that construction throws, the connection must be handed back or every later `beginTransaction()` leaks one until the pool is exhausted. */
const buildFakePool = () => {
  const released: Array<unknown> = [];

  const pool = {
    totalCount: 0,
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: (error?: unknown) => released.push(error ?? 'clean'),
    }),
    end: async () => undefined,
  };

  return { pool: pool as AnyType, released };
};

/** A schema drizzle cannot read: it throws the moment the constructor enumerates it. */
const buildExplodingSchema = (): AnyType => {
  return new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error('schema exploded');
      },
      get: () => {
        throw new Error('schema exploded');
      },
    },
  );
};

describe('acquire() must not leak the connection it checked out', () => {
  test('a connector construction that throws still releases the connection', async () => {
    const { pool, released } = buildFakePool();
    const driver = new NodePostgresDriver({ client: pool });

    let thrown: unknown;
    try {
      await driver.acquire({ schema: buildExplodingSchema() });
    } catch (error) {
      thrown = error;
    }

    // It must still fail loudly - releasing is not swallowing.
    expect(thrown).toBeDefined();
    // And the connection must be back in the pool.
    expect(released).toHaveLength(1);
  });

  test('a healthy acquire does not release early', async () => {
    const { pool, released } = buildFakePool();
    const driver = new NodePostgresDriver({ client: pool });

    const connection = await driver.acquire({ schema: {} });

    expect(released).toHaveLength(0);
    expect(typeof connection.execute).toBe('function');

    connection.release();
    expect(released).toHaveLength(1);
  });
});
