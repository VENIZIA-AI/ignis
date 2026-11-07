import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import type { TAnyDataSourceSchema } from '@/base/datasources';
import { AbstractDataSource, DataSourceOpenModes } from '@/base/datasources';
import { datasource } from '@/base/metadata';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

/**
 * `@datasource({ open: { on: 'first-use' } })`: the application starts without opening the datasource, the first
 * call that needs it opens it once (concurrent first calls share that open), a failed open rejects every waiter and
 * leaves nothing half-open, and `close()` closes only what was opened.
 */

/** What each fixture did, in order. */
class Journal {
  static entries: Array<string> = [];

  static reset(): void {
    Journal.entries = [];
  }

  static count(entry: string): number {
    return Journal.entries.filter((candidate) => candidate === entry).length;
  }
}

/** A promise the test settles by hand, so an open can be held half-way. */
const gate = () => {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { opened, release };
};

class OpenControl {
  /** The next opens fail while this is above zero. */
  static failures = 0;
  static hold: { opened: Promise<void>; release: () => void } | undefined;
  static seenOptions: Array<unknown> = [];

  static reset(): void {
    OpenControl.failures = 0;
    OpenControl.hold = undefined;
    OpenControl.seenOptions = [];
  }
}

interface ICountingOptions {
  dataDir?: string;
}

abstract class CountingDataSource extends AbstractDataSource<
  ICountingOptions,
  TAnyDataSourceSchema,
  ICountingOptions
> {
  /** Set by the failed `configure()`: what a half-open leaves behind until `discardPartialOpen()` clears it. */
  halfBuilt = false;

  constructor() {
    super({ scope: 'CountingDataSource' });
    this.name = this.constructor.name;
    this.settings = {};
  }

  protected override supportsDeferredOpen(): boolean {
    return true;
  }

  async configure(options?: ICountingOptions): Promise<void> {
    Journal.entries.push(`configure:${this.name}`);
    OpenControl.seenOptions.push(options);
    this.halfBuilt = true;

    if (OpenControl.hold) {
      await OpenControl.hold.opened;
    }

    if (OpenControl.failures > 0) {
      OpenControl.failures -= 1;

      throw getError({ message: 'engine refused to start' });
    }

    this.halfBuilt = false;
  }

  protected override discardPartialOpen(): void {
    Journal.entries.push(`discard:${this.name}`);
    this.halfBuilt = false;
  }

  override async close(): Promise<void> {
    await this.settleOpening();
    Journal.entries.push(`close:${this.name}`);
  }
}

@datasource({ open: { on: 'first-use' } })
class LazyDataSource extends CountingDataSource {}

@datasource({ open: { on: 'start' } })
class EagerDataSource extends CountingDataSource {}

@datasource()
class PlainDataSource extends CountingDataSource {}

/** A family that did not opt in: `first-use` must be refused at boot, not left half-working. */
@datasource({ open: { on: 'first-use' } })
class UnsupportedDataSource extends AbstractDataSource {
  constructor() {
    super({ scope: 'UnsupportedDataSource' });
    this.name = this.constructor.name;
    this.settings = {};
  }

  configure(): void {
    Journal.entries.push(`configure:${this.name}`);
  }
}

class TestApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'open-first-use-app', version: '0.0.0', description: '' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}

  stop(): Promise<void> {
    return this.closeDataSources();
  }
}

const CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

const boot = async (...classes: Array<new () => AbstractDataSource>) => {
  const application = new TestApplication({ scope: TestApplication.name, config: CONFIGS });

  for (const dataSourceClass of classes) {
    application.dataSource(dataSourceClass);
  }

  await application.registerDataSources();

  return application;
};

const lazyOf = (application: TestApplication) =>
  application.get<LazyDataSource>({ key: 'datasources.LazyDataSource' });

beforeEach(() => {
  Journal.reset();
  OpenControl.reset();
});

describe('the application starts without opening a datasource that opens on first use', () => {
  test('configure() does not run at boot, and the datasource says it is not open', async () => {
    const application = await boot(LazyDataSource);

    expect(Journal.count('configure:LazyDataSource')).toBe(0);
    expect(lazyOf(application).isOpenDeferred()).toBe(true);
    expect(lazyOf(application).isOpen()).toBe(false);
    expect(lazyOf(application).getOpenMode()).toBe(DataSourceOpenModes.FIRST_USE);
  });

  test('the default, and an explicit start, are configured at boot as before', async () => {
    await boot(PlainDataSource, EagerDataSource);

    expect(Journal.entries).toEqual(['configure:PlainDataSource', 'configure:EagerDataSource']);
  });

  test('ensureOpen() of a datasource that opens at start resolves at once and opens nothing more', async () => {
    const application = await boot(EagerDataSource);
    const eager = application.get<EagerDataSource>({ key: 'datasources.EagerDataSource' });

    await eager.ensureOpen();
    await eager.ensureOpen();

    expect(Journal.count('configure:EagerDataSource')).toBe(1);
  });

  test('a family that cannot honour first-use refuses it at boot, naming the datasource', async () => {
    await RejectionHelper.expectRejection({
      task: boot(UnsupportedDataSource),
      message: /UnsupportedDataSource.*first-use.*not supported/,
    });
    expect(Journal.entries).toEqual([]);
  });

  test("an unknown 'open.on' is refused where @datasource is written", () => {
    expect(() => {
      @datasource({ open: { on: 'later' as never } })
      class Misspelt extends CountingDataSource {}

      return Misspelt;
    }).toThrow(/Unknown 'open.on': later/);
  });
});

describe('the first use opens the datasource once', () => {
  test('ensureOpen() runs configure() with the options the boot would have given, and the datasource is open', async () => {
    const application = new TestApplication({ scope: TestApplication.name, config: CONFIGS });
    const options: ICountingOptions = { dataDir: 'memory://x' };
    application.dataSource(LazyDataSource, { options });
    await application.registerDataSources();

    await lazyOf(application).ensureOpen();

    expect(Journal.count('configure:LazyDataSource')).toBe(1);
    expect(OpenControl.seenOptions).toEqual([{ dataDir: 'memory://x' }]);
    expect(lazyOf(application).isOpen()).toBe(true);
  });

  test('a second call, after the open, does not open again', async () => {
    const application = await boot(LazyDataSource);

    await lazyOf(application).ensureOpen();
    await lazyOf(application).ensureOpen();

    expect(Journal.count('configure:LazyDataSource')).toBe(1);
  });

  test('concurrent first calls share the one open, and none returns before it ends', async () => {
    const application = await boot(LazyDataSource);
    OpenControl.hold = gate();

    const dataSource = lazyOf(application);
    const settled: Array<number> = [];
    const calls = Array.from({ length: 12 }, (_unused, index) =>
      dataSource.ensureOpen().then(() => settled.push(index)),
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toEqual([]);
    expect(Journal.count('configure:LazyDataSource')).toBe(1);

    OpenControl.hold.release();
    await Promise.all(calls);

    expect(settled).toHaveLength(12);
    expect(Journal.count('configure:LazyDataSource')).toBe(1);
    expect(dataSource.isOpen()).toBe(true);
  });
});

describe('a failed open', () => {
  test('rejects every waiting call with the same error, undoes the half-open and leaves the datasource closed', async () => {
    const application = await boot(LazyDataSource);
    const dataSource = lazyOf(application);
    OpenControl.failures = 1;
    OpenControl.hold = gate();

    const waiting = Array.from({ length: 5 }, () => dataSource.ensureOpen());
    const outcomes = waiting.map((call) =>
      call.then(
        () => 'opened',
        (error: Error) => error.message,
      ),
    );

    OpenControl.hold.release();

    const results = await Promise.all(outcomes);

    expect(results).toEqual(Array(5).fill('engine refused to start'));
    expect(Journal.count('configure:LazyDataSource')).toBe(1);
    expect(Journal.count('discard:LazyDataSource')).toBe(1);
    expect(dataSource.halfBuilt).toBe(false);
    expect(dataSource.isOpen()).toBe(false);
  });

  test('the next call opens afresh and succeeds', async () => {
    const application = await boot(LazyDataSource);
    const dataSource = lazyOf(application);
    OpenControl.failures = 1;

    await RejectionHelper.expectRejection({
      task: dataSource.ensureOpen(),
      message: /engine refused to start/,
    });
    await dataSource.ensureOpen();

    expect(Journal.count('configure:LazyDataSource')).toBe(2);
    expect(dataSource.isOpen()).toBe(true);
  });

  test('two failures in a row are two opens, each undone', async () => {
    const application = await boot(LazyDataSource);
    const dataSource = lazyOf(application);
    OpenControl.failures = 2;

    await RejectionHelper.expectRejection({ task: dataSource.ensureOpen(), message: /refused/ });
    await RejectionHelper.expectRejection({ task: dataSource.ensureOpen(), message: /refused/ });
    await dataSource.ensureOpen();

    expect(Journal.count('configure:LazyDataSource')).toBe(3);
    expect(Journal.count('discard:LazyDataSource')).toBe(2);
  });

  test('a clean-up that also fails is logged and never replaces the open error', async () => {
    @datasource({ open: { on: 'first-use' } })
    class BrokenCleanupDataSource extends CountingDataSource {
      protected override discardPartialOpen(): void {
        throw getError({ message: 'clean-up exploded' });
      }
    }

    const application = new TestApplication({ scope: TestApplication.name, config: CONFIGS });
    application.dataSource(BrokenCleanupDataSource);
    await application.registerDataSources();
    OpenControl.failures = 1;

    const dataSource = application.get<BrokenCleanupDataSource>({
      key: 'datasources.BrokenCleanupDataSource',
    });

    await RejectionHelper.expectRejection({
      task: dataSource.ensureOpen(),
      message: /engine refused to start/,
    });
  });
});

describe('stopping', () => {
  test('a datasource that was never opened is closed without opening anything', async () => {
    const application = await boot(LazyDataSource);

    await application.stop();

    expect(Journal.entries).toEqual(['close:LazyDataSource']);
    expect(Journal.count('configure:LazyDataSource')).toBe(0);
  });

  test('a stop during the first use waits for that open, then closes what it built', async () => {
    const application = await boot(LazyDataSource);
    const dataSource = lazyOf(application);
    OpenControl.hold = gate();

    const opening = dataSource.ensureOpen();
    const stopping = application.stop();

    await Promise.resolve();
    expect(Journal.count('close:LazyDataSource')).toBe(0);

    OpenControl.hold.release();
    await opening;
    await stopping;

    expect(Journal.entries).toEqual(['configure:LazyDataSource', 'close:LazyDataSource']);
  });

  test('a stop during an open that fails closes nothing it did not build, and does not throw', async () => {
    const application = await boot(LazyDataSource);
    const dataSource = lazyOf(application);
    OpenControl.hold = gate();
    OpenControl.failures = 1;

    const opening = dataSource.ensureOpen().catch((error: Error) => error.message);
    const stopping = application.stop();

    OpenControl.hold.release();

    const message = await opening;
    await stopping;

    expect(message).toBe('engine refused to start');
    expect(Journal.count('discard:LazyDataSource')).toBe(1);
  });

  test('after the stop, a first use is refused instead of reopening the datasource', async () => {
    const application = await boot(LazyDataSource);
    const dataSource = lazyOf(application);

    await application.stop();

    await RejectionHelper.expectRejection({
      task: dataSource.ensureOpen(),
      message: /The datasource is closed/,
    });
    expect(Journal.count('configure:LazyDataSource')).toBe(0);
    expect(dataSource.isOpen()).toBe(false);
  });

  test('a datasource that was opened reports closed after the stop', async () => {
    const application = await boot(LazyDataSource);
    const dataSource = lazyOf(application);

    await dataSource.ensureOpen();
    expect(dataSource.isOpen()).toBe(true);

    await application.stop();

    expect(dataSource.isOpen()).toBe(false);
  });
});
