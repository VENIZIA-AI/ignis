import { describe, expect, test } from 'bun:test';
import type { IRelationalDriver } from '@/connectors/postgres/drivers';

type TSchema = Record<string, never>;

export interface IDriverProbe {
  driver: IRelationalDriver<TSchema>;
  /** Statements the fake client actually received, in order. */
  statements: () => string[];
  /** One entry per release() call, in order. */
  releases: () => Array<{ destroyed: boolean }>;
  /** Whether the driver's underlying pool/client was closed. */
  ended: () => boolean;
}

/**
 * Every relational driver must satisfy this suite against an in-memory fake of its own client. It
 * asserts the NEUTRAL contract only - never a driver's own API - so a passing driver is substitutable
 * behind `IRelationalDriver`. A seam only one driver can satisfy is not a seam.
 *
 * Note what is deliberately NOT asserted: that `release({ destroy: true })` actually discards the
 * connection. node-postgres can; postgres-js cannot. That asymmetry is real, and it belongs in each
 * driver's own tests rather than being smoothed over here.
 */
export interface IConformanceOptions {
  /** Display name of the driver under test, e.g. `node-postgres`. */
  driver: string;

  /**
   * Builds a probe around a driver whose next `execute()` throws when the statement starts with
   * `failOn`. Named for its production counterpart: both answer "which driver backs this client",
   * one by structural detection, one by the test choosing a fake.
   */
  resolveDatabaseDriver: TResolveDatabaseDriver;
}

/** Yields a fresh probe per call - conformance tests must never share driver state. */
export type TResolveDatabaseDriver = (failOn?: string) => IDriverProbe;

export const run = (opts: IConformanceOptions): void => {
  const { driver: driverName, resolveDatabaseDriver: build } = opts;

  describe(`IRelationalDriver conformance - ${driverName}`, () => {
    test('createConnector() returns a pooled connector', () => {
      const { driver } = build();
      expect(driver.createConnector({ schema: {} })).toBeDefined();
    });

    test('acquire() yields a connection carrying its own connector', async () => {
      const { driver } = build();
      const connection = await driver.acquire({ schema: {} });

      expect(connection.connector).toBeDefined();
      expect(typeof connection.execute).toBe('function');
      expect(typeof connection.release).toBe('function');

      connection.release();
    });

    test("acquire()'s connector is bound to the acquired connection, NOT to the pool", async () => {
      const { driver } = build();
      const connection = await driver.acquire({ schema: {} });

      // Drizzle records what it was bound to on `$client`. If a driver bound the transaction
      // connector to the pool, every statement inside the transaction would be free to land on a
      // different backend than the BEGIN, and the transaction would silently not be a transaction.
      const boundClient = Reflect.get(connection.connector, '$client');

      expect(boundClient).toBeDefined();
      expect(boundClient).not.toBe(driver.getClient());

      connection.release();
    });

    test('two acquire() calls bind to two different connections', async () => {
      const { driver } = build();

      const first = await driver.acquire({ schema: {} });
      const second = await driver.acquire({ schema: {} });

      expect(Reflect.get(first.connector, '$client')).not.toBe(
        Reflect.get(second.connector, '$client'),
      );

      first.release();
      second.release();
    });

    test('createConnector() IS bound to the pool', () => {
      const { driver } = build();
      const connector = driver.createConnector({ schema: {} });

      // The pooled connector is the non-transactional one; it must reach the pool, not one client.
      expect(Reflect.get(connector, '$client')).toBe(driver.getClient());
    });

    test('two acquire() calls yield independent connections', async () => {
      const { driver, releases } = build();

      const first = await driver.acquire({ schema: {} });
      const second = await driver.acquire({ schema: {} });

      first.release();
      second.release();

      expect(releases()).toHaveLength(2);
    });

    test('execute() forwards the statement verbatim', async () => {
      const { driver, statements } = build();
      const connection = await driver.acquire({ schema: {} });

      await connection.execute({ statement: 'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED' });
      connection.release();

      expect(statements()).toEqual(['BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED']);
    });

    test('execute() resolves to the NEUTRAL statement result, not a native driver shape', async () => {
      const { driver } = build();
      const connection = await driver.acquire({ schema: {} });

      const result = await connection.execute({ statement: 'BEGIN' });
      connection.release();

      // A driver that passes its native result through leaks its client type across the seam and
      // fails here: pg's native result carries `rows`, postgres-js's IS an array. The neutral
      // contract is a floor, not a ceiling - a future driver may carry extra neutral fields
      // (MySQL's insertId), so the suite must never assert the exact key set.
      expect(typeof result.count).toBe('number');
      expect('rows' in result).toBe(false);
      expect(Array.isArray(result)).toBe(false);
    });

    test('execute() preserves statement order', async () => {
      const { driver, statements } = build();
      const connection = await driver.acquire({ schema: {} });

      await connection.execute({ statement: 'BEGIN' });
      await connection.execute({ statement: 'COMMIT' });
      connection.release();

      expect(statements()).toEqual(['BEGIN', 'COMMIT']);
    });

    test('a failing execute() rejects rather than resolving', async () => {
      const { driver } = build('COMMIT');
      const connection = await driver.acquire({ schema: {} });

      let caught: unknown;
      try {
        await connection.execute({ statement: 'COMMIT' });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      connection.release({ destroy: true });
    });

    test('release() is recorded once per call, undestroyed by default', async () => {
      const { driver, releases } = build();
      const connection = await driver.acquire({ schema: {} });

      connection.release();

      expect(releases()).toHaveLength(1);
      expect(releases()[0].destroyed).toBe(false);
    });

    test('release({ destroy: true }) is accepted by every driver', async () => {
      const { driver, releases } = build();
      const connection = await driver.acquire({ schema: {} });

      // Whether the connection is really discarded is driver-specific; accepting the option is not.
      expect(() => connection.release({ destroy: true })).not.toThrow();
      expect(releases()).toHaveLength(1);
    });

    test('getClient() returns the raw client escape', () => {
      const { driver } = build();
      expect(driver.getClient()).toBeDefined();
    });

    test('end() closes the underlying pool', async () => {
      const { driver, ended } = build();

      await driver.end();

      expect(ended()).toBe(true);
    });
  });
};
