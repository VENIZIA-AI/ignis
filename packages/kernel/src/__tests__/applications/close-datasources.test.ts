import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import { AbstractDataSource } from '@/base/datasources';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { beforeEach, describe, expect, test } from 'bun:test';
import { ProbeDataSource } from '../support/artifact-fixtures';
import { RecordingLogger } from '../support/recording-logger';

/** What each fixture did, in order, across the whole application. */
class DataSourceJournal {
  static entries: string[] = [];

  static reset(): void {
    DataSourceJournal.entries = [];
  }
}

class StoppableApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'close-datasources-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}

  /** `closeDataSources` is protected - each host calls it from its own `stop()`, as this one does. */
  stop(): Promise<void> {
    return this.closeDataSources();
  }
}

abstract class JournalDataSource extends AbstractDataSource {
  constructor() {
    super({ scope: 'JournalDataSource' });
    this.name = this.constructor.name;
    this.settings = {};
    DataSourceJournal.entries.push(`construct:${this.name}`);
  }

  configure(): void {
    DataSourceJournal.entries.push(`configure:${this.name}`);
  }
}

class OrdersDataSource extends JournalDataSource {
  override async close(): Promise<void> {
    DataSourceJournal.entries.push(`close:${this.name}`);
  }
}

class BrokenDataSource extends JournalDataSource {
  override async close(): Promise<void> {
    DataSourceJournal.entries.push(`close:${this.name}`);
    throw getError({ message: 'pool refused to end' });
  }
}

/** Keeps the root `close()`. */
class PlainDataSource extends JournalDataSource {}

class AuditDataSource extends JournalDataSource {
  override async close(): Promise<void> {
    DataSourceJournal.entries.push(`close:${this.name}`);
  }
}

/** A pool whose checked-out client is never released: its `end()` never settles. */
class HangingDataSource extends JournalDataSource {
  override close(): Promise<void> {
    DataSourceJournal.entries.push(`close:${this.name}`);
    return new Promise<void>(() => {});
  }
}

const buildConfigs = (opts?: { dataSourceCloseTimeoutMs?: number }): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
  ...opts,
});

const buildApplication = (opts?: { dataSourceCloseTimeoutMs?: number }): StoppableApplication => {
  return new StoppableApplication({
    scope: StoppableApplication.name,
    config: buildConfigs(opts),
  });
};

describe('RestApplication.closeDataSources', () => {
  beforeEach(() => {
    DataSourceJournal.reset();
  });

  test('closes every datasource the boot configured, and one failure does not stop the rest', async () => {
    const application = buildApplication();
    application.dataSource(OrdersDataSource);
    application.dataSource(BrokenDataSource);
    application.dataSource(AuditDataSource);
    await application.registerDataSources();

    await application.stop();

    expect(DataSourceJournal.entries.filter(entry => entry.startsWith('close:'))).toEqual([
      'close:OrdersDataSource',
      'close:BrokenDataSource',
      'close:AuditDataSource',
    ]);
  });

  test('a datasource that was registered but never configured is not even constructed', async () => {
    const application = buildApplication();
    application.dataSource(OrdersDataSource);

    await application.stop();

    expect(DataSourceJournal.entries).toEqual([]);
  });

  test('a datasource with no close() is skipped, the others still close', async () => {
    const application = buildApplication();
    application.dataSource(ProbeDataSource);
    application.dataSource(OrdersDataSource);
    await application.registerDataSources();

    await application.stop();

    expect(DataSourceJournal.entries).toContain('close:OrdersDataSource');
  });

  test('stopping twice is harmless', async () => {
    const application = buildApplication();
    application.dataSource(OrdersDataSource);
    await application.registerDataSources();

    await application.stop();
    await application.stop();

    expect(DataSourceJournal.entries.filter(entry => entry.startsWith('close:')).length).toBe(2);
  });

  test('the engine-neutral root has nothing to release', async () => {
    expect(await new PlainDataSource().close()).toBeUndefined();
  });

  test('a close() that never settles is given up on, and the next datasource still closes', async () => {
    const application = buildApplication({ dataSourceCloseTimeoutMs: 50 });
    const logger = new RecordingLogger();
    application.logger = logger;
    application.dataSource(HangingDataSource);
    application.dataSource(OrdersDataSource);
    await application.registerDataSources();

    await application.stop();

    expect(DataSourceJournal.entries.filter(entry => entry.startsWith('close:'))).toEqual([
      'close:HangingDataSource',
      'close:OrdersDataSource',
    ]);
    expect(
      logger.calls
        .filter(call => call.message.startsWith('Close timed out'))
        .map(call => ({ level: call.level, key: call.args[0], timeoutMs: call.args[1] })),
    ).toEqual([{ level: 'error', key: 'datasources.HangingDataSource', timeoutMs: 50 }]);
    expect(
      logger.calls
        .filter(call => call.message.startsWith('Closed datasource'))
        .map(call => call.args[0]),
    ).toEqual(['datasources.OrdersDataSource']);
  });
});
