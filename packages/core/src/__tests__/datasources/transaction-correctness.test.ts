import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import { FakePool } from '../connectors/postgres/drivers/fake-pg-client';
import { runTransactionContract } from './transaction-contract';

class ProbeDataSource extends BasePostgresDataSource<{}> {
  constructor(private readonly fakePool: FakePool) {
    super({ name: 'probe', config: {} });
  }

  configure(): void {
    // The pool is injected; this fixture never opens a real connection.
    this.client = this.fakePool as AnyType;
  }

  getConnectionString(): string {
    return '';
  }
}

const buildDataSource = (failOn?: string) => {
  const pool = new FakePool({ failOn });
  const dataSource = new ProbeDataSource(pool);
  dataSource.configure();
  return { pool, dataSource };
};

/** Flattened statements/releases across every physical connection the pool ever handed out. */
const statementsOf = (pool: FakePool): string[] =>
  pool.clients.flatMap(client => client.statements);
const releasesOf = (pool: FakePool) => pool.clients.flatMap(client => client.releases);

describe('beginTransaction - happy path', () => {
  test('COMMIT releases the connection back to the pool, undestroyed', async () => {
    const { pool, dataSource } = buildDataSource();

    const transaction = await dataSource.beginTransaction();
    await transaction.commit();

    expect(pool.clients).toHaveLength(1);
    expect(statementsOf(pool)).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED',
      'COMMIT',
    ]);
    expect(releasesOf(pool)).toEqual([{ destroyed: false }]);
    expect(transaction.isActive).toBe(false);
  });

  test('ROLLBACK releases the connection back to the pool, undestroyed', async () => {
    const { pool, dataSource } = buildDataSource();

    const transaction = await dataSource.beginTransaction();
    await transaction.rollback();

    expect(statementsOf(pool)[1]).toBe('ROLLBACK');
    expect(releasesOf(pool)).toEqual([{ destroyed: false }]);
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
    const { pool, dataSource } = buildDataSource('COMMIT');
    const transaction = await dataSource.beginTransaction();

    try {
      await transaction.commit();
    } catch {
      // Asserted in the previous test.
    }

    expect(releasesOf(pool)).toEqual([{ destroyed: true }]);
    expect(transaction.isActive).toBe(false);
  });

  test('a failed ROLLBACK rethrows and destroys the connection', async () => {
    const { pool, dataSource } = buildDataSource('ROLLBACK');
    const transaction = await dataSource.beginTransaction();

    let caught: unknown;
    try {
      await transaction.rollback();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(releasesOf(pool)).toEqual([{ destroyed: true }]);
  });

  test('the connection is released exactly once on every path', async () => {
    const { pool, dataSource } = buildDataSource('COMMIT');
    const transaction = await dataSource.beginTransaction();

    try {
      await transaction.commit();
    } catch {
      // Expected.
    }

    expect(releasesOf(pool)).toHaveLength(1);
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

describe('getClient', () => {
  test('returns the pool once configure() has assigned it', () => {
    const { dataSource } = buildDataSource();
    expect(dataSource.getClient()).toBeDefined();
  });

  test('throws rather than returning an undefined typed as the client', () => {
    // `pool` is genuinely unset for any datasource backed by a driver other than `pg`. Returning
    // `undefined as Client` would push the failure to whatever dereferences it.
    class UnconfiguredDataSource extends BasePostgresDataSource<{}> {
      configure(): void {
        // assigns no pool
      }
      getConnectionString(): string {
        return '';
      }
    }

    const dataSource = new UnconfiguredDataSource({ name: 'unconfigured', config: {} });

    let caught: unknown;
    try {
      dataSource.getClient();
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('configure()');
  });
});

describe('beginTransaction - rollback after a failure-ended transaction', () => {
  test('rollback() after a FAILED commit is a silent no-op - the original error path survives', async () => {
    const { pool, dataSource } = buildDataSource('COMMIT');
    const transaction = await dataSource.beginTransaction();

    let caught: unknown;
    try {
      await transaction.commit();
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe('COMMIT exploded');

    // The canonical downstream pattern is `catch { await tx.rollback(); throw error; }`. If this
    // rollback threw 'already ended', it would REPLACE the real commit failure in every such
    // caller. The transaction already ended by failure - rollback's goal is achieved - so it must
    // resolve silently.
    await transaction.rollback();

    expect(statementsOf(pool)).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED',
      'COMMIT',
    ]);
    expect(releasesOf(pool)).toEqual([{ destroyed: true }]);
  });

  test('rollback() after a FAILED rollback is also a silent no-op', async () => {
    const { pool, dataSource } = buildDataSource('ROLLBACK');
    const transaction = await dataSource.beginTransaction();

    let caught: unknown;
    try {
      await transaction.rollback();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();

    await transaction.rollback();

    expect(releasesOf(pool)).toEqual([{ destroyed: true }]);
  });

  test('commit() after a FAILED commit still throws - retrying a dead transaction is a caller bug', async () => {
    const { dataSource } = buildDataSource('COMMIT');
    const transaction = await dataSource.beginTransaction();

    try {
      await transaction.commit();
    } catch {
      // asserted above
    }

    let caught: unknown;
    try {
      await transaction.commit();
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('already ended');
  });
});

describe('beginTransaction - acquisition and concurrency', () => {
  test('a failed BEGIN destroys the acquired connection instead of leaking it', async () => {
    const { pool, dataSource } = buildDataSource('BEGIN');

    let caught: unknown;
    try {
      await dataSource.beginTransaction();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    // The connection was checked out before BEGIN ran; if BEGIN throws, no caller ever receives a
    // handle to release it. Leaking here exhausts the pool under repeated BEGIN failures.
    expect(releasesOf(pool)).toEqual([{ destroyed: true }]);
  });

  test('concurrent commit() and rollback() end the transaction exactly once', async () => {
    const { pool, dataSource } = buildDataSource();

    const transaction = await dataSource.beginTransaction();
    const outcomes = await Promise.allSettled([transaction.commit(), transaction.rollback()]);

    // One wins, the other must hit the already-ended guard - never two control statements and
    // never a double release of the same physical connection.
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    // A single beginTransaction() acquires exactly ONE physical connection - concurrency is on the
    // two finish() calls racing over that one connection, not on two separate acquisitions.
    expect(pool.clients).toHaveLength(1);
    expect(pool.clients[0].statements).toHaveLength(2);
    expect(pool.clients[0].releases).toHaveLength(1);
  });
});

describe('beginTransaction - driver resolution', () => {
  test('a datasource that set only this.client behaves exactly as before drivers existed', async () => {
    const { pool, dataSource } = buildDataSource();

    const transaction = await dataSource.beginTransaction();
    await transaction.commit();

    expect(pool.clients[0].statements).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED',
      'COMMIT',
    ]);
    expect(pool.clients[0].releases).toEqual([{ destroyed: false }]);
  });

  test('the adopted driver is created once and reused across transactions', async () => {
    const { dataSource } = buildDataSource();

    const first = await dataSource.beginTransaction();
    await first.commit();
    const adopted = Reflect.get(dataSource, 'driver');

    const second = await dataSource.beginTransaction();
    await second.commit();

    expect(adopted).toBeDefined();
    expect(Reflect.get(dataSource, 'driver')).toBe(adopted);
  });

  test('concurrent first transactions adopt ONE driver, not one each', async () => {
    const { dataSource } = buildDataSource();

    // Driver adoption is async (the concrete driver is imported on demand), so two callers can both
    // observe an unset `this.driver` before either finishes resolving. Record every distinct driver
    // ever assigned; a resolver that caches only the result, not the in-flight promise, yields two.
    const assigned = new Set<unknown>();
    let current: unknown;

    Object.defineProperty(dataSource, 'driver', {
      configurable: true,
      get: () => current,
      set: (value: unknown) => {
        if (value) {
          assigned.add(value);
        }

        current = value;
      },
    });

    const [first, second] = await Promise.all([
      dataSource.beginTransaction(),
      dataSource.beginTransaction(),
    ]);

    await first.commit();
    await second.commit();

    expect(assigned.size).toBe(1);
  });

  test('an explicitly assigned driver is used, and this.client is never touched', async () => {
    const acquired: string[] = [];

    class ExplicitDriverDataSource extends BasePostgresDataSource<{}> {
      configure(): void {
        this.driver = {
          createConnector: () => ({}) as AnyType,
          acquire: async () => ({
            connector: {} as AnyType,
            execute: async (opts: { statement: string }) => {
              acquired.push(opts.statement);
              return undefined;
            },
            release: () => undefined,
          }),
          getClient: () => 'raw-client',
          end: async () => undefined,
        } as AnyType;
      }

      getConnectionString(): string {
        return '';
      }
    }

    const dataSource = new ExplicitDriverDataSource({ name: 'explicit', config: {} });
    dataSource.configure();

    const transaction = await dataSource.beginTransaction({ isolationLevel: 'SERIALIZABLE' });
    await transaction.commit();

    expect(acquired).toEqual(['BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'COMMIT']);
    // No pg pool was ever assigned; the driver owned the whole path.
    expect(Reflect.get(dataSource, 'pool')).toBeUndefined();
    expect(dataSource.getClient()).toBe('raw-client' as AnyType);
  });

  test('no driver and no pool throws a message naming configure()', async () => {
    class BareDataSource extends BasePostgresDataSource<{}> {
      configure(): void {
        // deliberately assigns neither this.client nor this.driver
      }
      getConnectionString(): string {
        return '';
      }
    }

    const dataSource = new BareDataSource({ name: 'bare', config: {} });

    let caught: unknown;
    try {
      await dataSource.beginTransaction();
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('configure()');
  });

  test("an unrecognized pool shape surfaces resolveDatabaseDriver's own error", async () => {
    class UnrecognizedPoolDataSource extends BasePostgresDataSource<{}> {
      configure(): void {
        // Satisfies neither `isPostgresJsClient` (needs reserve+unsafe) nor `isNodePostgresPool`
        // (needs connect) - resolveDatabaseDriver() must reject with its own message, unswallowed.
        this.client = { end: async () => undefined } as AnyType;
      }

      getConnectionString(): string {
        return '';
      }
    }

    const dataSource = new UnrecognizedPoolDataSource({ name: 'unrecognized-pool', config: {} });
    dataSource.configure();

    let caught: unknown;
    try {
      await dataSource.beginTransaction();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error).message).toContain('bun add pg');
    expect((caught as Error).message).toContain('bun add postgres');
  });

  test('useDriver() wires the driver AND the connector in one step', async () => {
    const executed: string[] = [];
    const fakeConnector = { marker: 'from-driver' } as AnyType;

    class UseDriverDataSource extends BasePostgresDataSource<{}> {
      configure(): void {
        this.useDriver({
          driver: {
            createConnector: () => fakeConnector,
            acquire: async () => ({
              connector: fakeConnector,
              execute: async (executeOpts: { statement: string }) => {
                executed.push(executeOpts.statement);
                return { count: 0 };
              },
              release: () => undefined,
            }),
            getClient: () => 'raw-client',
            end: async () => undefined,
          } as AnyType,
          schema: {},
        });
      }

      getConnectionString(): string {
        return '';
      }
    }

    const dataSource = new UseDriverDataSource({ name: 'use-driver', config: {} });
    dataSource.configure();

    // Both halves wired: the pooled connector is the driver's, and transactions ride the driver.
    expect(dataSource.getConnector()).toBe(fakeConnector);

    const transaction = await dataSource.beginTransaction();
    await transaction.commit();

    expect(executed).toEqual(['BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED', 'COMMIT']);
  });
});

runTransactionContract({
  connector: 'postgres (node-postgres driver)',
  probe: {
    begin: async (opts?: { failOn?: 'COMMIT' | 'ROLLBACK' }) => {
      const { dataSource } = buildDataSource(opts?.failOn);
      return dataSource.beginTransaction();
    },
  },
});
