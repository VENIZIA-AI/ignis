import { PGlite } from '@electric-sql/pglite';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { datasource, model, RestApplication } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { IRelationalDataSourceOpening } from '@/relational/core/datasources/common';
import type { TTableInsert, TTableObject } from '@/relational/core/models';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import type { TRelationalConnector } from '@/relational/postgres/datasources/common';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';

/**
 * Inside the open of a datasource that opens on first use, `configure()` does its database work through the `opening` handles:
 * the connector, the client and a transaction. The public gated API waits for the open, so it cannot be used there, and every
 * other caller still waits for the open to finish.
 */

const TABLE_NAME = 'opening_handle_notes';

const noteTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
});

@model({ type: 'entity' })
class OpeningHandleNote extends BasePostgresEntity<typeof noteTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = noteTable;
}

class Probe {
  static clients: Array<PGlite> = [];
  static hold: { opened: Promise<void>; release: () => void } | undefined;
  /** What a datasource of this file does inside `configure()`: the right way, or one of the two wrong ones. */
  static mode: 'handles' | 'public-connector' | 'repository' = 'handles';
  static repository: { find(opts: { filter: object }): Promise<unknown> } | undefined;
  /** The open timeout of `ShortTimeoutOpeningDataSource`: short for the attempt that must time out, `0` (none) for the one that must finish. */
  static openTimeoutMs = 80;

  static reset(): void {
    Probe.openTimeoutMs = 80;
    Probe.clients = [];
    Probe.hold = undefined;
    Probe.mode = 'handles';
    Probe.repository = undefined;
  }

  static gate() {
    let release!: () => void;
    const opened = new Promise<void>((resolve) => {
      release = resolve;
    });

    Probe.hold = { opened, release };

    return Probe.hold;
  }
}

type TOpening = IRelationalDataSourceOpening<TRelationalConnector, PGlite>;

/** The same body at start and on first use: it only touches `opening`. */
const migrateAndSeed = async (opening: TOpening): Promise<void> => {
  // Typed by the datasource's own client: a PGlite, not unknown.
  const client: PGlite = opening.getClient();

  // @ts-expect-error opening.getClient() of a PGlite datasource is not a string
  const wrong: string = opening.getClient();

  expect(wrong).toBe(client as never);

  await client.exec(`CREATE TABLE ${TABLE_NAME} (id serial primary key, title text not null)`);

  const transaction = await opening.beginTransaction();
  await transaction.connector.execute(
    sql.raw(`INSERT INTO ${TABLE_NAME} (title) VALUES ('seeded')`),
  );
  await transaction.commit();

  const rows = await opening
    .getConnector()
    .execute(sql.raw(`SELECT count(*)::int AS n FROM ${TABLE_NAME}`));

  expect(rows).toBeDefined();
};

abstract class OpeningBaseDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor() {
    super({ name: 'OpeningHandleDataSource', config: {}, schema: { [TABLE_NAME]: noteTable } });
  }

  override async configure(_options?: object, opening?: TOpening): Promise<void> {
    const client = new PGlite();
    Probe.clients.push(client);
    await client.waitReady;
    this.client = client;

    if (Probe.hold) {
      await Probe.hold.opened;
    }

    if (Probe.mode === 'public-connector') {
      // The wrong way: the public getter is gated while the datasource is opening.
      this.getConnector();

      return;
    }

    if (Probe.mode === 'repository') {
      // The other wrong way: a repository waits for the open that is waiting for this configure().
      await Probe.repository?.find({ filter: {} });

      return;
    }

    await migrateAndSeed(opening!);
  }

  override getConnectionString(): string {
    return 'pglite://memory';
  }
}

@datasource({ driver: PGliteDriver, open: { on: 'first-use' } })
class FirstUseOpeningDataSource extends OpeningBaseDataSource {}

@datasource({ driver: PGliteDriver, open: { on: 'first-use', timeoutMs: 80 } })
class ShortTimeoutOpeningDataSource extends OpeningBaseDataSource {
  override getOpenTimeoutMs(): number {
    return Probe.openTimeoutMs;
  }
}

@datasource({ driver: PGliteDriver })
class StartOpeningDataSource extends OpeningBaseDataSource {}

/** The real application boot: it is the only thing that hands a datasource that opens at start its handles. */
class OpeningApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'opening-handle-app', version: '0.0.0', description: '' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

const bootApplication = async (dataSourceClass: new () => OpeningBaseDataSource) => {
  const config: IApplicationConfigs = { path: { base: '/', isStrict: false } };
  const application = new OpeningApplication({ scope: OpeningApplication.name, config });

  application.init();
  application.dataSource(dataSourceClass);
  await application.registerDataSources();

  return application;
};

type TNoteRepository<TDataSource extends OpeningBaseDataSource> = DefaultCRUDRepository<
  typeof noteTable,
  TTableObject<typeof noteTable>,
  TTableInsert<typeof noteTable>,
  IDatabaseExtraOptions,
  TDataSource
>;

const repositoryOf = <TDataSource extends OpeningBaseDataSource>(dataSource: TDataSource) => {
  const repository: TNoteRepository<TDataSource> = new DefaultCRUDRepository(dataSource, {
    entityClass: OpeningHandleNote,
  });

  return repository;
};

/** Waits for a condition the code under test reaches on its own clock (an abandoned configure ending late), up to a bound. */
const waitUntil = async (opts: { until: () => boolean; timeoutMs?: number }): Promise<void> => {
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);

  while (!opts.until() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

/** Calls again while the datasource says the abandoned open is still running, up to a bound: it ends on its own clock. */
const retryWhileAbandoned = async <T>(opts: {
  call: () => Promise<T>;
  timeoutMs?: number;
}): Promise<T> => {
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  let attempt: { value?: T; error?: unknown; isDone: boolean } = { isDone: false };

  while (!attempt.isDone) {
    try {
      // eslint-disable-next-line no-await-in-loop -- each try must finish before the next one starts
      const value = await opts.call();

      attempt = { value, isDone: true };
      // eslint-disable-next-line venizia/no-silent-catch -- only the "still running" refusal is retried; anything else is rethrown below
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (!/previous open is still running/.test(message) || Date.now() > deadline) {
        throw error;
      }

      // eslint-disable-next-line no-await-in-loop -- a pause between tries
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  return attempt.value as T;
};

beforeEach(() => {
  Probe.reset();
});

afterEach(async () => {
  for (const client of Probe.clients) {
    if (!client.closed) {
      await client.close();
    }
  }
});

describe('the same configure() body at start and on first use', () => {
  test('on first use: the opening handles migrate and seed, and the first call sees the seeded row', async () => {
    const dataSource = new FirstUseOpeningDataSource();
    dataSource.deferOpen({});
    const repository = repositoryOf(dataSource);

    const found = await repository.find({ filter: {} });
    const rows = found as Array<{ title: string }>;

    expect(rows.map((row) => row.title)).toEqual(['seeded']);
    expect(dataSource.isOpen()).toBe(true);
  });

  test('at start: the real boot passes the same handles, and the body works unchanged', async () => {
    const application = await bootApplication(StartOpeningDataSource);
    const dataSource = application.get<StartOpeningDataSource>({
      key: 'datasources.StartOpeningDataSource',
    });
    const repository = repositoryOf(dataSource);

    const found = await repository.find({ filter: {} });
    const rows = found as Array<{ title: string }>;

    expect(rows.map((row) => row.title)).toEqual(['seeded']);
    expect(dataSource.isOpen()).toBe(true);
  });

  test('requests that arrive during the open wait for the migration and the seed: none sees an empty database', async () => {
    const dataSource = new FirstUseOpeningDataSource();
    dataSource.deferOpen({});
    const repository = repositoryOf(dataSource);
    const gate = Probe.gate();

    const calls = Array.from({ length: 5 }, () => repository.find({ filter: {} }));

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(dataSource.isOpen()).toBe(false);

    gate.release();
    const settled = await Promise.all(calls);
    const results = settled as Array<Array<{ title: string }>>;

    for (const rows of results) {
      expect(rows.map((row) => row.title)).toEqual(['seeded']);
    }

    expect(Probe.clients).toHaveLength(1);
  });
});

describe('the wrong ways to use the datasource inside configure()', () => {
  test('the public getConnector() says it is still opening and names the opening argument; nothing is left half-open', async () => {
    Probe.mode = 'public-connector';
    const dataSource = new FirstUseOpeningDataSource();
    dataSource.deferOpen({});

    await RejectionHelper.expectRejection({
      task: repositoryOf(dataSource).find({ filter: {} }),
      message: /still opening.*opening argument/,
    });

    expect(dataSource.isOpen()).toBe(false);
    expect(Probe.clients[0]?.closed).toBe(true);
  });

  test('a repository inside configure() hits the timeout with a named error, and close() does not hang', async () => {
    Probe.mode = 'repository';
    const dataSource = new ShortTimeoutOpeningDataSource();
    dataSource.deferOpen({});
    const repository = repositoryOf(dataSource);
    Probe.repository = repository;

    await RejectionHelper.expectRejection({
      task: repository.find({ filter: {} }),
      message: /did not finish within 80 ms.*opening argument/,
    });

    const started = Date.now();
    await dataSource.close();

    expect(Date.now() - started).toBeLessThan(1000);
    expect(dataSource.isOpen()).toBe(false);
  });
});

describe('an open that is abandoned after its timeout', () => {
  test('a configure() that finishes late has its PGlite closed and never published', async () => {
    const dataSource = new ShortTimeoutOpeningDataSource();
    dataSource.deferOpen({});
    const repository = repositoryOf(dataSource);
    const gate = Probe.gate();

    await RejectionHelper.expectRejection({
      task: repository.find({ filter: {} }),
      message: /did not finish within 80 ms/,
    });

    expect(dataSource.isOpen()).toBe(false);

    // The first configure() ends late, after the datasource gave up on it.
    gate.release();
    await waitUntil({ until: () => Probe.clients[0]?.closed === true });

    expect(dataSource.isOpen()).toBe(false);
    expect(Probe.clients[0]?.closed).toBe(true);
  });

  test('the next call, once the abandoned configure has settled, opens afresh and works', async () => {
    const dataSource = new ShortTimeoutOpeningDataSource();
    dataSource.deferOpen({});
    const repository = repositoryOf(dataSource);
    const gate = Probe.gate();

    await RejectionHelper.expectRejection({
      task: repository.find({ filter: {} }),
      message: /did not finish/,
    });
    await RejectionHelper.expectRejection({
      task: repository.find({ filter: {} }),
      message: /previous open is still running/,
    });

    gate.release();
    Probe.hold = undefined;
    // The attempt that must finish boots a PGlite: no timeout, so a loaded machine cannot time it out.
    Probe.openTimeoutMs = 0;
    // The abandoned attempt closes its client, then clears its slot: retry until a call is no longer refused for it.
    const found = await retryWhileAbandoned({ call: () => repository.find({ filter: {} }) });
    const rows = found as Array<{ title: string }>;

    expect(rows.map((row) => row.title)).toEqual(['seeded']);
    expect(Probe.clients).toHaveLength(2);
    expect(Probe.clients[0]?.closed).toBe(true);
    expect(Probe.clients[1]?.closed).toBe(false);
  });
});

describe('stopping while the open fails', () => {
  test('a close() that waits for a failing open, and a second close(), end the connection once', async () => {
    Probe.mode = 'public-connector';
    const dataSource = new FirstUseOpeningDataSource();
    dataSource.deferOpen({});
    const repository = repositoryOf(dataSource);
    const gate = Probe.gate();

    const failing = repository.find({ filter: {} }).then(
      () => 'opened',
      (error: Error) => error.message,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const closing = dataSource.close();

    gate.release();
    const message = await failing;

    // The failed open's clean-up must not clear the slot of the close() that is waiting for it.
    expect(dataSource.close()).toBe(closing);

    await closing;
    await dataSource.close();

    expect(message).toMatch(/The datasource is closed/);
    expect(Probe.clients[0]?.closed).toBe(true);
  });
});

describe('the handles are not reachable from outside configure()', () => {
  test('there is no getOpening on the datasource: a request cannot take the handles during the open and query before the migrations', async () => {
    const dataSource = new FirstUseOpeningDataSource();
    dataSource.deferOpen({});
    const repository = repositoryOf(dataSource);
    const gate = Probe.gate();

    const opening = repository.find({ filter: {} });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // @ts-expect-error the handles are not on the type: only configure() receives them
    const accessor: unknown = dataSource.getOpening;

    expect(accessor).toBeUndefined();
    expect('getOpening' in dataSource).toBe(false);

    // The public API still waits for the open and refuses while it is in flight.
    expect(() => dataSource.getConnector()).toThrow(/still opening/);
    expect(() => dataSource.getClient()).toThrow(/still opening/);

    gate.release();
    await opening;
  });
});
