import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import { PGlite } from '@electric-sql/pglite';
import { BasePostgresDataSource } from '@venizia/ignis-connectors/postgres';
import { PGliteDriver } from '@venizia/ignis-connectors/postgres/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { RuntimeModules } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  AbstractDataSource,
  BindingKeys,
  BindingNamespaces,
  datasource,
  type IApplicationConfigs,
  type IApplicationInfo,
} from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';

@datasource({ driver: PGliteDriver, autoDiscovery: false })
class StopProbeDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor() {
    super({ name: StopProbeDataSource.name, config: {}, schema: {} });
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

class StopApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'stop-app', version: '0.0.0', description: 'Datasource shutdown probe' };
  }

  staticConfigure(): void {}

  preConfigure(): void {
    this.dataSource(StopProbeDataSource);
  }

  postConfigure(): void {}
  setupMiddlewares(): void {}

  getProbeClient(): PGlite {
    return this.get<StopProbeDataSource>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.DATASOURCE,
        key: StopProbeDataSource.name,
      }),
    }).getClient();
  }
}

/** A pool whose checked-out client is never released: its `close()` never settles. */
@datasource({ autoDiscovery: false })
class HangingDataSource extends AbstractDataSource {
  constructor() {
    super({ scope: HangingDataSource.name });
    this.name = HangingDataSource.name;
    this.settings = {};
  }

  configure(): void {}

  override close(): Promise<void> {
    return new Promise<void>(() => {});
  }
}

/** The hanging datasource is configured first, so it is also the first one `stop()` closes. */
class HangingFirstApplication extends StopApplication {
  override preConfigure(): void {
    this.dataSource(HangingDataSource);
    super.preConfigure();
  }
}

const CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

const buildApplication = (): StopApplication => {
  const application = new StopApplication({ scope: StopApplication.name, config: CONFIGS });
  application.init();
  return application;
};

describe('stop() closes the datasources the application configured', () => {
  afterEach(() => {
    // PGlite may plant 99 on the host; the runner must never inherit it.
    globalThis.process.exitCode = 0;
  });

  test('after stop() a PGlite datasource client is closed, and the exit status it planted is cleared', async () => {
    const application = buildApplication();
    await application.start();

    const client = application.getProbeClient();
    expect(client.closed).toBe(false);

    globalThis.process.exitCode = 99;
    await application.stop();

    expect(client.closed).toBe(true);
    expect(globalThis.process.exitCode).toBe(0);
  });

  test('a second stop() is harmless', async () => {
    const application = buildApplication();
    await application.start();
    const client = application.getProbeClient();

    await application.stop();
    await application.stop();

    expect(client.closed).toBe(true);
  });

  test('an application that booted without a socket still closes its datasources', async () => {
    const application = buildApplication();
    await application.initialize();
    const client = application.getProbeClient();

    await application.stop();

    expect(client.closed).toBe(true);
  });

  test('a server that fails to close still has its datasources closed, and stop() reports it', async () => {
    const application = buildApplication();
    await application.initialize();
    const client = application.getProbeClient();

    application['runtime'] = RuntimeModules.NODE;
    application['serverInstance'] = {
      close: (callback: (error?: Error) => void) => {
        callback(getError({ message: 'server was not running' }));
      },
    };

    const stopResult = await application.stop().catch((error: unknown) => error);

    expect(String(stopResult)).toContain('server was not running');
    expect(client.closed).toBe(true);
  });

  test('a close() that never settles does not hold stop(), and the next datasource still closes', async () => {
    const application = new HangingFirstApplication({
      scope: HangingFirstApplication.name,
      config: { ...CONFIGS, dataSourceCloseTimeoutMs: 50 },
    });
    application.init();
    await application.start();
    const client = application.getProbeClient();

    await application.stop();

    expect(client.closed).toBe(true);
  });
});
