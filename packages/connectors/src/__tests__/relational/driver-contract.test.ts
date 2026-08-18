import { describe, expect, test } from 'bun:test';
import type { IRelationalDriver } from '@/relational/core/drivers';
import { isRelationalTransaction } from '@/relational/core/datasources/common';
import { isDatabaseTransaction } from '@/relational/postgres/datasources';

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
    expect((await connection.execute({ statement: 'BEGIN' })).count).toBe(0);
    expect(await connection.query({ statement: 'SELECT 1' })).toEqual([]);
  });

  test('the postgres guard accepts what the neutral guard accepts', () => {
    const handle = { isActive: true, connector: {} } as never;
    expect(isDatabaseTransaction(handle)).toBe(true);
    expect(isRelationalTransaction(handle)).toBe(true);
  });

  test('both guards reject a transaction without a connector', () => {
    const handle = { isActive: true } as never;
    expect(isDatabaseTransaction(handle)).toBe(false);
    expect(isRelationalTransaction(handle)).toBe(false);
  });
});
