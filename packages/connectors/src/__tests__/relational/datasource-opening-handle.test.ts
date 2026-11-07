import { PGlite } from '@electric-sql/pglite';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { datasource, model } from '@venizia/ignis-kernel';
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

  static reset(): void {
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
class ShortTimeoutOpeningDataSource extends OpeningBaseDataSource {}

@datasource({ driver: PGliteDriver })
class StartOpeningDataSource extends OpeningBaseDataSource {}

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

  test('at start: the boot passes the same handles, and the body works unchanged', async () => {
    const dataSource = new StartOpeningDataSource();
    const opening = dataSource.getOpening();

    // What the boot does for a datasource that opens at start.
    await dataSource.configure({}, opening);

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
    await waitUntil({ until: () => Probe.clients[0]?.closed === true });
    // The abandoned attempt clears its slot just after it closed the client.
    await new Promise((resolve) => setTimeout(resolve, 50));
    Probe.hold = undefined;

    const found = await repository.find({ filter: {} });
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
