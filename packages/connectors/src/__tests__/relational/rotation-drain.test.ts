import { datasource } from '@venizia/ignis-kernel';
import { BaseRelationalDataSource } from '@/relational/core/datasources';
import type { TRelationalTransactionOptions } from '@/relational/core/datasources';
import type { IRelationalConnection, IRelationalDriver } from '@/relational/core/drivers';
import type {
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
} from '@/relational/core/repositories/common';
import type { AnyObject, AnyType } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';

/**
 * PGlite and libsql both shut down with `close()` and
 * have NO `end()` - the verb a pg.Pool leads with.
 */
class CloseOnlyClient {
  closed = false;

  constructor(readonly config: AnyObject) {}

  close(): void {
    this.closed = true;
  }
}

class CloseOnlyDriver implements IRelationalDriver<AnyType, CloseOnlyClient> {
  private readonly client: CloseOnlyClient;

  constructor(opts: { client: CloseOnlyClient }) {
    this.client = opts.client;
  }

  createConnector(): AnyType {
    return {};
  }

  acquire(): Promise<IRelationalConnection<AnyType>> {
    throw getError({ message: '[CloseOnlyDriver] acquire is not exercised by this fixture' });
  }

  getClient(): CloseOnlyClient {
    return this.client;
  }

  async end(): Promise<void> {
    // The datasource drains the raw client, not the
    // driver - leaving this inert keeps the two apart.
  }
}

/**
 * Fails where `onSecretRotated()` wires the rebuilt
 * driver, so the newly built client must be drained.
 */
class WiringFailureDriver extends CloseOnlyDriver {
  override createConnector(): AnyType {
    throw getError({ message: 'driver wiring blew up' });
  }
}

abstract class CloseOnlyDataSourceFixture extends BaseRelationalDataSource<
  { user?: string; password?: string },
  AnyType,
  {},
  CloseOnlyClient,
  AnyType
> {
  readonly builds: Array<CloseOnlyClient> = [];
  failNextConfigure = false;

  configure(): void {
    const client = new CloseOnlyClient({ ...(this.getSettings() as AnyObject) });
    this.builds.push(client);
    this.client = client;

    if (this.failNextConfigure) {
      throw getError({ message: 'bad rotated creds' });
    }
  }

  getConnectionString(): string {
    return 'file:fixture.db';
  }

  protected override buildBeginStatement(_opts?: TRelationalTransactionOptions): string {
    return 'BEGIN';
  }

  override getQueryDialect(): IRelationalQueryDialect {
    throw getError({ message: '[CloseOnlyDataSourceFixture] dialect is not exercised' });
  }

  override getQueryExecutor(): IRelationalQueryExecutor<AnyType> {
    throw getError({ message: '[CloseOnlyDataSourceFixture] executor is not exercised' });
  }
}

@datasource({ driver: CloseOnlyDriver, autoDiscovery: false })
class RotatingCloseOnlyDataSource extends CloseOnlyDataSourceFixture {
  constructor() {
    super({
      name: 'rotating-close-only',
      config: { user: 'old', password: 'old-pass' },
      schema: {},
    });
  }
}

@datasource({ driver: WiringFailureDriver, autoDiscovery: false })
class WiringFailureDataSource extends CloseOnlyDataSourceFixture {
  constructor() {
    super({
      name: 'wiring-failure-close-only',
      config: { user: 'old', password: 'old-pass' },
      schema: {},
    });
  }
}

describe('Relational onSecretRotated - draining a client that has no end()', () => {
  test('drains the old client after a successful rotation', async () => {
    const dataSource = new RotatingCloseOnlyDataSource();
    dataSource.configure();

    // Wires the driver, so the drain reads the client through it exactly as a live datasource does.
    dataSource.getConnector();
    const oldClient = dataSource.builds[0];

    await dataSource.onSecretRotated({
      key: 'datasources.sqlite',
      secret: { username: 'v-new', password: 'v-new-pass' },
    });

    const newClient = dataSource.builds[1];
    expect(newClient?.config).toMatchObject({ user: 'v-new', password: 'v-new-pass' });
    expect(oldClient.closed).toBe(true);
    expect(newClient.closed).toBe(false);
    expect(dataSource.getClient()).toBe(newClient);
  });

  test('repeated rotations leave no live client behind', async () => {
    const dataSource = new RotatingCloseOnlyDataSource();
    dataSource.configure();
    dataSource.getConnector();

    for (const round of [1, 2, 3]) {
      await dataSource.onSecretRotated({
        key: 'datasources.sqlite',
        secret: { username: `v-${round}`, password: `pass-${round}` },
      });
    }

    const live = dataSource.builds.filter(client => !client.closed);
    expect(live).toEqual([dataSource.getClient()]);
  });

  test('drains the half-built client when configure() throws mid-rotation', async () => {
    const dataSource = new RotatingCloseOnlyDataSource();
    dataSource.configure();
    dataSource.getConnector();
    const oldClient = dataSource.builds[0];

    dataSource.failNextConfigure = true;

    let failure: unknown;
    try {
      await dataSource.onSecretRotated({
        key: 'datasources.sqlite',
        secret: { username: 'v-new', password: 'v-new-pass' },
      });
    } catch (error) {
      failure = error;
    }

    expect((failure as Error)?.message).toContain('bad rotated creds');
    expect(dataSource.builds[1]?.closed).toBe(true);
    expect(oldClient.closed).toBe(false);
    expect(dataSource.getClient()).toBe(oldClient);
  });

  test('drains the rebuilt client when the driver fails to wire', async () => {
    const dataSource = new WiringFailureDataSource();
    dataSource.configure();
    const oldClient = dataSource.builds[0];

    let failure: unknown;
    try {
      await dataSource.onSecretRotated({
        key: 'datasources.sqlite',
        secret: { username: 'v-new', password: 'v-new-pass' },
      });
    } catch (error) {
      failure = error;
    }

    expect((failure as Error)?.message).toContain('driver wiring blew up');
    expect(dataSource.builds[1]?.closed).toBe(true);
    expect(oldClient.closed).toBe(false);
  });
});
