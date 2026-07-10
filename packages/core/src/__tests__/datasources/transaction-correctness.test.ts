import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';

interface IReleaseCall {
  destroyed: boolean;
}

/** Fake `pg.PoolClient`: records release() calls and can be told which statement should throw. */
class FakePoolClient {
  readonly statements: string[] = [];
  readonly releases: IReleaseCall[] = [];

  constructor(private readonly failOn?: string) {}

  async query(statement: string): Promise<unknown> {
    this.statements.push(statement);

    if (this.failOn && statement.startsWith(this.failOn)) {
      throw new Error(`${this.failOn} exploded`);
    }

    return { rows: [] };
  }

  release(error?: Error | boolean): void {
    this.releases.push({ destroyed: Boolean(error) });
  }
}

class FakePool {
  constructor(readonly client: FakePoolClient) {}

  async connect(): Promise<FakePoolClient> {
    return this.client;
  }
}

class ProbeDataSource extends BasePostgresDataSource<{}> {
  constructor(private readonly fakePool: FakePool) {
    super({ name: 'probe', config: {} });
  }

  configure(): void {
    // The pool is injected; this fixture never opens a real connection.
    this.pool = this.fakePool as AnyType;
  }

  getConnectionString(): string {
    return '';
  }
}

const buildDataSource = (failOn?: string) => {
  const client = new FakePoolClient(failOn);
  const dataSource = new ProbeDataSource(new FakePool(client));
  dataSource.configure();
  return { client, dataSource };
};

describe('beginTransaction - happy path', () => {
  test('COMMIT releases the connection back to the pool, undestroyed', async () => {
    const { client, dataSource } = buildDataSource();

    const transaction = await dataSource.beginTransaction();
    await transaction.commit();

    expect(client.statements).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED',
      'COMMIT',
    ]);
    expect(client.releases).toEqual([{ destroyed: false }]);
    expect(transaction.isActive).toBe(false);
  });

  test('ROLLBACK releases the connection back to the pool, undestroyed', async () => {
    const { client, dataSource } = buildDataSource();

    const transaction = await dataSource.beginTransaction();
    await transaction.rollback();

    expect(client.statements[1]).toBe('ROLLBACK');
    expect(client.releases).toEqual([{ destroyed: false }]);
  });
});

describe('beginTransaction - failure paths', () => {
  test('a failed COMMIT rethrows instead of resolving successfully', async () => {
    const { dataSource } = buildDataSource('COMMIT');
    const transaction = await dataSource.beginTransaction();

    let caught: unknown;
    try {
      await transaction.commit();
    } catch (error) {
      caught = error;
    }

    // The whole point: `await transaction.commit()` must NOT resolve when the data was never written.
    expect(caught).toBeDefined();
    expect((caught as Error).message).toBe('COMMIT exploded');
  });

  test('a failed COMMIT destroys the connection instead of pooling a poisoned one', async () => {
    const { client, dataSource } = buildDataSource('COMMIT');
    const transaction = await dataSource.beginTransaction();

    try {
      await transaction.commit();
    } catch {
      // Asserted in the previous test.
    }

    expect(client.releases).toEqual([{ destroyed: true }]);
    expect(transaction.isActive).toBe(false);
  });

  test('a failed ROLLBACK rethrows and destroys the connection', async () => {
    const { client, dataSource } = buildDataSource('ROLLBACK');
    const transaction = await dataSource.beginTransaction();

    let caught: unknown;
    try {
      await transaction.rollback();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(client.releases).toEqual([{ destroyed: true }]);
  });

  test('the connection is released exactly once on every path', async () => {
    const { client, dataSource } = buildDataSource('COMMIT');
    const transaction = await dataSource.beginTransaction();

    try {
      await transaction.commit();
    } catch {
      // Expected.
    }

    expect(client.releases).toHaveLength(1);
  });
});

describe('beginTransaction - already-ended guard', () => {
  test('commit() twice throws', async () => {
    const { dataSource } = buildDataSource();
    const transaction = await dataSource.beginTransaction();
    await transaction.commit();

    let caught: unknown;
    try {
      await transaction.commit();
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('already ended');
  });

  test('rollback() after commit() throws', async () => {
    const { dataSource } = buildDataSource();
    const transaction = await dataSource.beginTransaction();
    await transaction.commit();

    let caught: unknown;
    try {
      await transaction.rollback();
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('already ended');
  });
});
