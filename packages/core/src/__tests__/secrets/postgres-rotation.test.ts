import { datasource } from '@/base/metadata/persistents';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import { NodePostgresDriver } from '@/connectors/postgres/drivers/node-postgres';
import type { AnyType } from '@venizia/ignis-helpers';
import { describe, expect, test } from 'bun:test';

class FakePool {
  ended = false;
  totalCount = 0;
  idleCount = 0;
  waitingCount = 0;
  constructor(public config: AnyType) {}
  async connect() {
    return { query: async () => ({}), release: () => {} };
  }
  async query() {
    return {};
  }
  async end() {
    this.ended = true;
  }
}

@datasource({ driver: NodePostgresDriver })
class RotatingDataSource extends BasePostgresDataSource<{ user?: string; password?: string }> {
  builds: FakePool[] = [];
  constructor() {
    super({ name: 'rotating', config: { user: 'old', password: 'old-pass' } });
  }
  configure(): void {
    const pool = new FakePool(this.getSettings()) as AnyType;
    this.builds.push(pool);
    this.client = pool;
  }
  getConnectionString(): string {
    return 'postgres://fake';
  }
}

@datasource({ driver: NodePostgresDriver })
class FailingRotatingDataSource extends BasePostgresDataSource<{
  user?: string;
  password?: string;
}> {
  builds: FakePool[] = [];
  failNext = false;
  constructor() {
    super({ name: 'failing-rotating', config: { user: 'old', password: 'old-pass' } });
  }
  configure(): void {
    const pool = new FakePool(this.getSettings()) as AnyType;
    this.builds.push(pool);
    this.client = pool;
    if (this.failNext) {
      throw new Error('bad rotated creds');
    }
  }
  getConnectionString(): string {
    return 'postgres://fake';
  }
}

describe('Postgres onSecretRotated', () => {
  test('rebuilds pool with new creds and drains the old one', async () => {
    const ds = new RotatingDataSource();
    ds.configure();
    const oldPool = ds.builds[0];

    await ds.onSecretRotated({
      key: 'datasources.postgres',
      secret: { username: 'v-new', password: 'v-new-pass' },
    });

    const newPool = ds.builds[1];
    expect(newPool).toBeDefined();
    expect(newPool.config).toMatchObject({ user: 'v-new', password: 'v-new-pass' });
    expect(oldPool.ended).toBe(true);
  });

  test('keeps serving the old pool when configure() throws mid-rotation', async () => {
    const ds = new FailingRotatingDataSource();
    ds.configure();
    const oldPool = ds.builds[0];

    ds.failNext = true;
    let caught: unknown;
    try {
      await ds.onSecretRotated({
        key: 'datasources.postgres',
        secret: { username: 'v-new', password: 'v-new-pass' },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('bad rotated creds');

    // A pool the failed configure() managed to open must be drained, never leaked.
    expect(ds.builds.length).toBe(2);
    expect(ds.builds[1].ended).toBe(true);

    // The datasource must be UNCHANGED and still usable on the old pool.
    expect(oldPool.ended).toBe(false);
    expect(ds.getClient()).toBe(oldPool as AnyType);
    expect(() => ds.getConnector()).not.toThrow();

    // Old credentials must be restored so a later query/rebuild does not use half-rotated settings.
    expect((ds.getSettings() as AnyType).user).toBe('old');
    expect((ds.getSettings() as AnyType).password).toBe('old-pass');
  });
});
