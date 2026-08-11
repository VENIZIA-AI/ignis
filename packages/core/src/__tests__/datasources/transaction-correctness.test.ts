import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { DataSourceDrivers } from '@/base/datasources';
import { datasource } from '@/base/metadata';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import { NodePostgresDriver } from '@/connectors/postgres/drivers/node-postgres';
import { FakePool } from '../connectors/postgres/drivers/fake-pg-client';
import { runTransactionContract } from './transaction-contract';
import { expectRejection } from '../rejection.helper';

@datasource({ driver: NodePostgresDriver })
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

    // The whole point: `await transaction.commit()`
    // must NOT resolve when the data was never written.
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
    // `pool` is genuinely unset for any datasource backed by a driver other than `pg`, and
    // returning `undefined as Client` would push the failure to whatever dereferences it.
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

    // In the canonical `catch { await tx.rollback(); throw error; }`, a rollback throwing 'already
    // ended' would REPLACE the real commit failure - the transaction ended by failure, so rollback
    // must resolve silently.
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
    // The connection was checked out before BEGIN ran, so if BEGIN throws no caller ever receives a
    // handle to release it and repeated failures exhaust the pool.
    expect(releasesOf(pool)).toEqual([{ destroyed: true }]);
  });

  test('concurrent commit() and rollback() end the transaction exactly once', async () => {
    const { pool, dataSource } = buildDataSource();

    const transaction = await dataSource.beginTransaction();
    const outcomes = await Promise.allSettled([transaction.commit(), transaction.rollback()]);

    // One wins, the other must hit the already-ended guard - never two control
    // statements and never a double release of the same physical connection.
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    // A single beginTransaction() acquires exactly ONE physical connection: the race is on
    // the two finish() calls over that one connection, not on two separate acquisitions.
    expect(pool.clients).toHaveLength(1);
    expect(pool.clients[0].statements).toHaveLength(2);
    expect(pool.clients[0].releases).toHaveLength(1);
  });
});

describe('beginTransaction - driver wiring', () => {
  test('a datasource that only sets this.client is wired from @datasource({ driver })', async () => {
    const { pool, dataSource } = buildDataSource();

    const transaction = await dataSource.beginTransaction();
    await transaction.commit();

    expect(pool.clients[0].statements).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED',
      'COMMIT',
    ]);
    expect(pool.clients[0].releases).toEqual([{ destroyed: false }]);
  });

  test('the driver is built once and reused across transactions', async () => {
    const { dataSource } = buildDataSource();

    const first = await dataSource.beginTransaction();
    await first.commit();
    const wired = Reflect.get(dataSource, 'driver');

    const second = await dataSource.beginTransaction();
    await second.commit();

    expect(wired).toBeDefined();
    expect(Reflect.get(dataSource, 'driver')).toBe(wired);
  });

  test('concurrent first transactions build ONE driver, not one each', async () => {
    const { dataSource } = buildDataSource();

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

  test('a datasource with no @datasource({ driver }) throws instead of guessing', async () => {
    class UndecoratedDataSource extends BasePostgresDataSource<{}> {
      configure(): void {
        this.client = new FakePool() as AnyType;
      }

      getConnectionString(): string {
        return '';
      }
    }

    const dataSource = new UndecoratedDataSource({ name: 'undecorated', config: {} });
    dataSource.configure();

    await expectRejection({
      task: dataSource.beginTransaction(),
      message: /must name a driver CLASS/,
    });
  });

  test('a driver-name STRING is refused - a string carries no module into the bundle', async () => {
    // The cast reproduces an untyped JavaScript caller, which the runtime must refuse too: a string
    // names a driver without referencing it, so the bundler would never package the driver module.
    @datasource({ driver: DataSourceDrivers.NODE_POSTGRES as AnyType })
    class StringDriverDataSource extends BasePostgresDataSource<{}> {
      configure(): void {
        this.client = new FakePool() as AnyType;
      }

      getConnectionString(): string {
        return '';
      }
    }

    const dataSource = new StringDriverDataSource({ name: 'string-driver', config: {} });
    dataSource.configure();

    await expectRejection({
      task: dataSource.beginTransaction(),
      message: /must name a driver CLASS/,
    });
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

  test('a client the named driver cannot use is refused by that driver, not silently adopted', async () => {
    @datasource({ driver: NodePostgresDriver })
    class UnrecognizedPoolDataSource extends BasePostgresDataSource<{}> {
      configure(): void {
        // No connect(), no pool accounting: not a `pg.Pool`.
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
    expect((caught as Error).message).toContain('Expected a `pg` Pool');
  });

  test('a bare pg.Client is refused - it has connect() but cannot pool', () => {
    const bareClient = { connect: async () => ({}), end: async () => undefined } as AnyType;

    expect(() => new NodePostgresDriver({ client: bareClient })).toThrow(/Expected a `pg` Pool/);
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
