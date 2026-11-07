import { PGlite } from '@electric-sql/pglite';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { datasource, model } from '@venizia/ignis-kernel';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { TTableInsert, TTableObject } from '@/relational/core/models';
import { RelationalMigrationRunner } from '@/relational/core/migrations';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';

/**
 * A relational datasource that opens on first use, on a real PGlite: the application starts without it, the first
 * repository call opens it once (concurrent first calls share that open), the migrations run inside that open, a
 * failed open rejects every waiter and leaves nothing half-open, and `close()` closes only what was opened.
 */

const TABLE_NAME = 'first_use_notes';

const noteTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  rank: integer('rank'),
});

@model({ type: 'entity' })
class FirstUseNote extends BasePostgresEntity<typeof noteTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = noteTable;
}

/** What the datasources of this file did, and what the next open is told to do. */
class Probe {
  static opens = 0;
  static clients: Array<PGlite> = [];
  static failAfterClient = 0;
  static hold: { opened: Promise<void>; release: () => void } | undefined;

  static reset(): void {
    Probe.opens = 0;
    Probe.clients = [];
    Probe.failAfterClient = 0;
    Probe.hold = undefined;
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

const MIGRATIONS = [
  {
    name: '0001_notes',
    sql: 'CREATE TABLE first_use_notes (id serial primary key, title text not null, rank integer)',
  },
];

interface ISettings {
  password?: string;
}

@datasource({ driver: PGliteDriver, open: { on: 'first-use' } })
class FirstUseDataSource extends BasePostgresDataSource<ISettings, {}, {}, PGlite> {
  constructor() {
    super({
      name: FirstUseDataSource.name,
      config: {},
      schema: { [TABLE_NAME]: noteTable },
    });
  }

  override async configure(): Promise<void> {
    Probe.opens += 1;

    const client = new PGlite();
    Probe.clients.push(client);
    await client.waitReady;
    this.client = client;

    if (Probe.hold) {
      await Probe.hold.opened;
    }

    // The migrations run inside the open: a repository call never sees a database without its tables.
    const runner = new RelationalMigrationRunner({ driver: this.resolveDriver() });
    await runner.run({ migrations: MIGRATIONS });

    if (Probe.failAfterClient > 0) {
      Probe.failAfterClient -= 1;

      throw new Error('migration refused');
    }
  }

  override getConnectionString(): string {
    return 'pglite://memory';
  }
}

type TNoteRepository = DefaultCRUDRepository<
  typeof noteTable,
  TTableObject<typeof noteTable>,
  TTableInsert<typeof noteTable>,
  IDatabaseExtraOptions,
  FirstUseDataSource
>;

const build = () => {
  const dataSource = new FirstUseDataSource();
  // What the boot does for a datasource that opens on first use.
  dataSource.deferOpen({});

  const repository: TNoteRepository = new DefaultCRUDRepository(dataSource, {
    entityClass: FirstUseNote,
  });

  return { dataSource, repository };
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

describe('before the first use', () => {
  test('nothing is opened: no PGlite is built, and the datasource says it is not open', () => {
    const { dataSource } = build();

    expect(Probe.opens).toBe(0);
    expect(Probe.clients).toHaveLength(0);
    expect(dataSource.isOpenDeferred()).toBe(true);
    expect(dataSource.isOpen()).toBe(false);
  });

  test('getConnector() and getClient() say it is not open, instead of "no driver and no client"', () => {
    const { dataSource } = build();

    expect(() => dataSource.getConnector()).toThrow(/opens on first use and is not open/);
    expect(() => dataSource.getClient()).toThrow(/opens on first use and is not open/);
  });

  test('close() of a datasource that was never opened opens and builds nothing', async () => {
    const { dataSource } = build();

    await dataSource.close();

    expect(Probe.opens).toBe(0);
    expect(Probe.clients).toHaveLength(0);
  });

  test('a rotated secret waits in the settings for the first use, and opens nothing', async () => {
    const { dataSource } = build();

    await dataSource.onSecretRotated({ key: 'db', secret: { username: 'u', password: 'rotated' } });

    expect(Probe.opens).toBe(0);
    expect(dataSource.getSettings()).toMatchObject({ password: 'rotated' });
  });
});

describe('the first repository call opens the datasource', () => {
  test('a create opens it once, the migrations have run inside the open, and the row is written', async () => {
    const { dataSource, repository } = build();

    const created = await repository.create({ data: { title: 'first' } });

    expect(created.data?.title).toBe('first');
    expect(Probe.opens).toBe(1);
    expect(dataSource.isOpen()).toBe(true);

    const found = await repository.find({ filter: {} });
    expect(found).toHaveLength(1);
  });

  test.each([
    ['find', (repository: TNoteRepository) => repository.find({ filter: {} })],
    ['findOne', (repository: TNoteRepository) => repository.findOne({ filter: {} })],
    ['count', (repository: TNoteRepository) => repository.count({ where: {} })],
    ['create', (repository: TNoteRepository) => repository.create({ data: { title: 'x' } })],
    [
      'updateAll',
      (repository: TNoteRepository) =>
        repository.updateAll({ data: { rank: 1 }, where: { title: 'x' } }),
    ],
    ['deleteAll', (repository: TNoteRepository) => repository.deleteAll({ where: { title: 'x' } })],
    ['findById', (repository: TNoteRepository) => repository.findById({ id: 1 })],
  ])('%s as the very first call opens it, once', async (_name, firstCall) => {
    const { dataSource, repository } = build();

    await firstCall(repository);

    expect(Probe.opens).toBe(1);
    expect(dataSource.isOpen()).toBe(true);
  });

  test('findEvery as the very first call opens it on the first page, once, and pages the rows', async () => {
    const { dataSource, repository } = build();
    const titles: Array<string> = [];

    for await (const row of repository.findEvery({ filter: { fields: ['title'] }, pageSize: 2 })) {
      titles.push(row.title);
    }

    expect(titles).toEqual([]);
    expect(Probe.opens).toBe(1);
    expect(dataSource.isOpen()).toBe(true);

    await repository.createAll({ data: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] });

    for await (const row of repository.findEvery({ filter: { fields: ['title'] }, pageSize: 2 })) {
      titles.push(row.title);
    }

    expect(titles).toEqual(['a', 'b', 'c']);
    expect(Probe.opens).toBe(1);
  });

  test('beginTransaction() as the first call opens it, and the transaction works', async () => {
    const { dataSource, repository } = build();

    const transaction = await dataSource.beginTransaction();
    await repository.create({ data: { title: 'in a transaction' }, options: { transaction } });
    await transaction.commit();

    expect(Probe.opens).toBe(1);
    const total = await repository.count({ where: {} });

    expect(total).toEqual({ count: 1 });
  });

  test('concurrent first calls share the one open: one PGlite, the migrations once, every row written', async () => {
    const { dataSource, repository } = build();
    const gate = Probe.gate();

    const calls = Array.from({ length: 8 }, (_unused, index) =>
      repository.create({ data: { title: `row ${index}` } }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(Probe.opens).toBe(1);
    expect(dataSource.isOpen()).toBe(false);

    gate.release();
    await Promise.all(calls);

    expect(Probe.opens).toBe(1);
    expect(Probe.clients).toHaveLength(1);
    const total = await repository.count({ where: {} });

    expect(total).toEqual({ count: 8 });
  });
});

describe('a failed open', () => {
  test('rejects every waiting call with the error, closes the half-built PGlite and forgets the client', async () => {
    const { dataSource, repository } = build();
    Probe.failAfterClient = 1;
    const gate = Probe.gate();

    const outcomes = Array.from({ length: 4 }, () =>
      repository.find({ filter: {} }).then(
        () => 'opened',
        (error: Error) => error.message,
      ),
    );

    gate.release();

    const results = await Promise.all(outcomes);

    expect(results).toEqual(Array(4).fill('migration refused'));
    expect(Probe.opens).toBe(1);
    expect(Probe.clients[0]?.closed).toBe(true);
    expect(dataSource.isOpen()).toBe(false);
    expect(() => dataSource.getClient()).toThrow(/opens on first use and is not open/);
  });

  test('the next call opens afresh on a new PGlite, and the datasource works', async () => {
    const { dataSource, repository } = build();
    Probe.failAfterClient = 1;

    await RejectionHelper.expectRejection({
      task: repository.find({ filter: {} }),
      message: /migration refused/,
    });
    const created = await repository.create({ data: { title: 'after the retry' } });

    expect(created.data?.title).toBe('after the retry');
    expect(Probe.opens).toBe(2);
    expect(Probe.clients).toHaveLength(2);
    expect(Probe.clients[0]?.closed).toBe(true);
    expect(Probe.clients[1]?.closed).toBe(false);
    expect(dataSource.isOpen()).toBe(true);
  });

  test('a datasource that failed to open can still be closed, and that closes nothing twice', async () => {
    const { dataSource, repository } = build();
    Probe.failAfterClient = 1;

    await RejectionHelper.expectRejection({
      task: repository.find({ filter: {} }),
      message: /migration refused/,
    });
    await dataSource.close();
    await dataSource.close();

    expect(Probe.clients[0]?.closed).toBe(true);
  });
});

describe('stopping', () => {
  test('close() after the first use ends the PGlite', async () => {
    const { dataSource, repository } = build();

    await repository.count({ where: {} });
    await dataSource.close();

    expect(Probe.clients[0]?.closed).toBe(true);
    expect(dataSource.isOpen()).toBe(false);
  });

  test('a stop during the first use waits for the open and closes what it built; the call that raced it is refused', async () => {
    const { dataSource, repository } = build();
    const gate = Probe.gate();

    const raced = repository.count({ where: {} }).then(
      () => 'served',
      (error: Error) => error.message,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const stopping = dataSource.close();

    gate.release();
    await stopping;

    const racedMessage = await raced;

    expect(racedMessage).toMatch(/The datasource is closed/);

    expect(Probe.opens).toBe(1);
    expect(Probe.clients[0]?.closed).toBe(true);
  });

  test('a call after the stop is refused, and does not reopen the datasource', async () => {
    const { dataSource, repository } = build();

    await dataSource.close();

    await RejectionHelper.expectRejection({
      task: repository.find({ filter: {} }),
      message: /The datasource is closed/,
    });
    expect(Probe.opens).toBe(0);
  });
});
