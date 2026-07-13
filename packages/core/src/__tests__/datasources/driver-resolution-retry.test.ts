import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { BasePostgresDataSource } from '@/connectors/postgres';

class LazyResolutionDataSource extends BasePostgresDataSource<{}> {
  constructor(pool: AnyType) {
    super({ name: 'lazy-resolution', config: {} });
    this.client = pool;
  }

  configure(): void {
    // The pool is injected pre-built; nothing to open.
  }

  getConnectionString(): string {
    return '';
  }

  resolveDriverForProbe() {
    return this['resolveDriver']();
  }
}

/**
 * Driver resolution is lazy (first transaction) and its in-flight promise is cached so concurrent
 * callers share one resolution. A REJECTED resolution must not stay cached: the failure can be
 * transient, and a poisoned cache would fail every later transaction with the stale error forever.
 */
describe('resolveDriver - a failed resolution is retried, not cached forever', () => {
  test('first failure rejects, and a later call retries against the healed pool', async () => {
    // No reserve/unsafe/connect: resolveDatabaseDriver cannot classify this client.
    const pool: AnyType = {};
    const dataSource = new LazyResolutionDataSource(pool);

    let firstFailure: unknown;
    try {
      await dataSource.resolveDriverForProbe();
    } catch (error) {
      firstFailure = error;
    }
    expect(firstFailure).toBeDefined();

    // The pool heals: it now looks like node-postgres.
    pool.connect = () => {
      return Promise.resolve({ query: () => Promise.resolve({ rows: [] }), release: () => {} });
    };

    const driver = await dataSource.resolveDriverForProbe();

    expect(driver).toBeDefined();
    expect(typeof driver.acquire).toBe('function');
  });
});
