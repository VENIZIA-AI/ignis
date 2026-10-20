import { datasource } from '@venizia/ignis-kernel';
import { BaseRelationalDataSource } from '@/relational/core/datasources';
import type { TRelationalTransactionOptions } from '@/relational/core/datasources';
import type { IRelationalConnection, IRelationalDriver } from '@/relational/core/drivers';
import type {
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
} from '@/relational/core/repositories/common';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';

/** Records which path shut it down: its driver's `end()`, or its own `close()`. */
class RecordingClient {
  readonly endedBy: string[] = [];

  close(): void {
    this.endedBy.push('client');
  }
}

class RecordingDriver implements IRelationalDriver<AnyType, RecordingClient> {
  private readonly client: RecordingClient;

  constructor(opts: { client: RecordingClient }) {
    this.client = opts.client;
  }

  createConnector(): AnyType {
    return {};
  }

  acquire(): Promise<IRelationalConnection<AnyType>> {
    throw getError({ message: '[RecordingDriver] acquire is not exercised by this fixture' });
  }

  getClient(): RecordingClient {
    return this.client;
  }

  async end(): Promise<void> {
    this.client.endedBy.push('driver');
  }
}

/** No `end()`: the shape of a hand-made driver cast past `IRelationalDriver`. */
class EndlessDriver {
  private readonly client: RecordingClient;

  constructor(opts: { client: RecordingClient }) {
    this.client = opts.client;
  }

  createConnector(): AnyType {
    return {};
  }

  getClient(): RecordingClient {
    return this.client;
  }
}

abstract class RecordingDataSourceFixture extends BaseRelationalDataSource<
  {},
  AnyType,
  {},
  RecordingClient,
  AnyType
> {
  constructor() {
    super({ name: 'recording', config: {}, schema: {} });
  }

  configure(): void {
    this.client = new RecordingClient();
  }

  getConnectionString(): string {
    return 'recording://memory';
  }

  protected override buildBeginStatement(_opts?: TRelationalTransactionOptions): string {
    return 'BEGIN';
  }

  override getQueryDialect(): IRelationalQueryDialect {
    throw getError({ message: '[RecordingDataSourceFixture] dialect is not exercised' });
  }

  override getQueryExecutor(): IRelationalQueryExecutor<AnyType> {
    throw getError({ message: '[RecordingDataSourceFixture] executor is not exercised' });
  }
}

@datasource({ driver: RecordingDriver, autoDiscovery: false })
class DriverNamedDataSource extends RecordingDataSourceFixture {}

@datasource({ autoDiscovery: false })
class DriverlessDataSource extends RecordingDataSourceFixture {}

@datasource({ driver: EndlessDriver, autoDiscovery: false })
class EndlessDriverDataSource extends RecordingDataSourceFixture {}

@datasource({ driver: PGliteDriver, autoDiscovery: false })
class MemoryPGliteDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor() {
    super({ name: MemoryPGliteDataSource.name, config: {}, schema: {} });
  }

  override async configure(): Promise<void> {
    const client = new PGlite();
    await client.query('SELECT 1');
    this.client = client;
  }

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }
}

describe('Relational close()', () => {
  test('ends the driver a query already wired', async () => {
    const dataSource = new DriverNamedDataSource();
    dataSource.configure();
    dataSource.getConnector();

    await dataSource.close();

    expect(dataSource.getClient().endedBy).toEqual(['driver']);
  });

  test('wires the driver when nothing queried yet, so the engine teardown still runs', async () => {
    const dataSource = new DriverNamedDataSource();
    dataSource.configure();

    await dataSource.close();

    expect(dataSource.getClient().endedBy).toEqual(['driver']);
  });

  test('runs once - every later call shares the first result', async () => {
    const dataSource = new DriverNamedDataSource();
    dataSource.configure();

    const first = dataSource.close();
    const second = dataSource.close();
    await first;

    expect(second).toBe(first);
    expect(dataSource.getClient().endedBy).toEqual(['driver']);
  });

  test('a datasource that never built a client has nothing to close', async () => {
    const dataSource = new DriverNamedDataSource();

    expect(await dataSource.close()).toBeUndefined();
  });

  test('a client no driver can wrap is drained directly', async () => {
    const dataSource = new DriverlessDataSource();
    dataSource.configure();

    await dataSource.close();

    expect(dataSource.getClient().endedBy).toEqual(['client']);
  });

  test('a driver without end() still drains the client', async () => {
    const dataSource = new EndlessDriverDataSource();
    dataSource.configure();

    await dataSource.close();

    expect(dataSource.getClient().endedBy).toEqual(['client']);
  });

  test('a PGlite datasource closes its client and clears the exit status PGlite plants', async () => {
    const host = globalThis.process;
    const dataSource = new MemoryPGliteDataSource();
    await dataSource.configure();

    // Set by hand: PGlite plants it once per process, so a query here may or may not re-plant it.
    // Closing the raw client leaves it at 99; only the driver's end() clears it.
    host.exitCode = 99;

    try {
      await dataSource.close();

      expect(dataSource.getClient().closed).toBe(true);
      expect(host.exitCode).toBe(0);
    } finally {
      host.exitCode = 0;
    }
  });
});
