import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import { AbstractDataSource } from '@venizia/ignis-kernel';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import type { IWorkerMessageScope } from '@/applications/worker';
import { WorkerApplication } from '@/applications/worker';

/** What ran at stop, in order. */
class StopJournal {
  static entries: string[] = [];

  static reset(): void {
    StopJournal.entries = [];
  }
}

/** Stands in for a PGlite datasource holding the OPFS exclusive lock until it is closed. */
class LockHoldingDataSource extends AbstractDataSource {
  constructor() {
    super({ scope: LockHoldingDataSource.name });
    this.name = LockHoldingDataSource.name;
    this.settings = {};
  }

  configure(): void {}

  override async close(): Promise<void> {
    StopJournal.entries.push(`close:${this.name}`);
  }
}

class DataSourceWorkerApplication extends WorkerApplication {
  getAppInfo(): IApplicationInfo {
    return {
      name: 'core-worker-stop-test',
      version: '0.0.0',
      description: 'Proves WorkerApplication.stop() closes its datasources',
    };
  }

  preConfigure() {}
  postConfigure() {}
  staticConfigure() {}
  setupMiddlewares() {}

  override async initialize(): Promise<void> {
    this.dataSource(LockHoldingDataSource);
    await this.registerDataSources();
  }
}

class SilentScope implements IWorkerMessageScope {
  postMessage(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

const buildConfigs = (): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
});

describe('WorkerApplication.stop() closes its datasources', () => {
  beforeEach(() => {
    StopJournal.reset();
  });

  test('every datasource the boot configured is closed, after the post-stop hooks', async () => {
    const app = new DataSourceWorkerApplication({
      scope: 'DataSourceWorkerApplication',
      config: buildConfigs(),
    });
    app.registerPostStopHook({
      identifier: 'test.hook',
      hook: () => {
        StopJournal.entries.push('hook');
      },
    });

    await app.listen({ scope: new SilentScope() });
    await app.stop();

    expect(StopJournal.entries).toEqual(['hook', 'close:LockHoldingDataSource']);
  });

  test('a second stop() is harmless', async () => {
    const app = new DataSourceWorkerApplication({
      scope: 'DataSourceWorkerApplication',
      config: buildConfigs(),
    });

    await app.listen({ scope: new SilentScope() });
    await app.stop();

    expect(await app.stop()).toBeUndefined();
  });
});
