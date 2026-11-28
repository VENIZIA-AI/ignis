import { describe, expect, test } from 'bun:test';
import type { IRelationalDriver } from '@/relational/core/drivers';
import { AbstractRelationalDataSource } from '@/relational/core/datasources';
import { AbstractPostgresDataSource } from '@/relational/postgres/datasources';

describe('neutral driver contract', () => {
  test('a driver is implementable over an arbitrary connector type', async () => {
    const driver: IRelationalDriver<{ tag: string }, { closed: boolean }> = {
      createConnector: () => ({ tag: 'fake' }),
      acquire: async () => ({
        connector: { tag: 'fake' },
        execute: async () => ({ count: 0 }),
        query: async () => [],
        release: () => undefined,
      }),
      getClient: () => ({ closed: false }),
      end: async () => undefined,
    };

    const connection = await driver.acquire({ schema: {} as never });
    expect(connection.connector.tag).toBe('fake');
    const result = await connection.execute({ statement: 'BEGIN' });
    expect(result.count).toBe(0);
    const result2 = await connection.query({ statement: 'SELECT 1' });
    expect(result2).toEqual([]);
  });

  test('the postgres guard accepts what the neutral guard accepts', () => {
    const handle = { isActive: true, connector: {} } as never;
    expect(AbstractPostgresDataSource.isDatabaseTransaction(handle)).toBe(true);
    expect(AbstractRelationalDataSource.isRelationalTransaction(handle)).toBe(true);
  });

  test('both guards reject a transaction without a connector', () => {
    const handle = { isActive: true } as never;
    expect(AbstractPostgresDataSource.isDatabaseTransaction(handle)).toBe(false);
    expect(AbstractRelationalDataSource.isRelationalTransaction(handle)).toBe(false);
  });
});
