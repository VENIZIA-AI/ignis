// Import order guard: see controllers/route-registration.test.ts.
import '@/base/applications';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { Hono } from 'hono';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { ControllerFactory, datasource, model } from '@venizia/ignis-kernel';
import { BasePostgresDataSource, BasePostgresEntity } from '@venizia/ignis-connectors/postgres';
import { PGliteDriver } from '@venizia/ignis-connectors/postgres/pglite';
import { DefaultRelationalRepository } from '@venizia/ignis-connectors/relational';
import { HttpDataSource, HttpRepository } from '@venizia/ignis-connectors/http';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { Logger } from '@venizia/ignis-helpers/winston';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { repository } from '@/base/metadata';
import { AppErrorMiddleware } from '@/base/middlewares';

/**
 * The http connector against a real IGNIS server: a generated CRUD controller over PGlite, served on
 * a real port, read and written through `HttpRepository`. Every write lands in the database the
 * server owns, and a server error comes back as the server's own status and message.
 */

const TABLE_NAME = 'http_round_trip_note';

const table = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('open'),
});

type TNote = { id: number; title: string; status: string };

@model({ type: 'entity' })
class HttpRoundTripNote extends BasePostgresEntity<typeof table> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = table;
}

@datasource({ driver: PGliteDriver, autoDiscovery: false })
class HttpRoundTripDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({ name: HttpRoundTripDataSource.name, config: {}, schema: { [TABLE_NAME]: table } });
    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

@repository({ model: HttpRoundTripNote, dataSource: HttpRoundTripDataSource })
class HttpRoundTripNoteRepository {}

const logger = Logger.get('http-round-trip-test');
logger.error = () => undefined;
logger.log = () => undefined;

let dataSource: HttpRoundTripDataSource;
let server: Bun.Server<undefined>;
let wrappedServer: Bun.Server<undefined>;
let notes: HttpRepository<TNote>;
let wrappedNotes: HttpRepository<TNote>;

beforeAll(async () => {
  const client = new PGlite();
  await client.waitReady;
  await client.exec(
    `CREATE TABLE ${TABLE_NAME} (id serial primary key, title text not null, status text not null default 'open');`,
  );

  dataSource = new HttpRoundTripDataSource({ client });
  const noteRepository = new DefaultRelationalRepository<typeof table>(dataSource, {
    entityClass: HttpRoundTripNote,
  });

  const NoteController = ControllerFactory.defineCrudController({
    entity: HttpRoundTripNote,
    repository: { name: HttpRoundTripNoteRepository.name },
    controller: { name: 'HttpRoundTripNoteController', basePath: '/notes' },
  });
  const controller = new NoteController(noteRepository);
  await controller.configure();

  const app = new Hono();
  app.route('/notes', controller.getRouter());
  app.onError(new AppErrorMiddleware({ logger }).value());

  server = Bun.serve({ port: 0, fetch: app.fetch });

  // The same routes behind a server that wraps its error envelope under `error.rootKey`.
  const wrappedApp = new Hono();
  wrappedApp.route('/notes', controller.getRouter());
  wrappedApp.onError(new AppErrorMiddleware({ logger, rootKey: 'error' }).value());
  wrappedServer = Bun.serve({ port: 0, fetch: wrappedApp.fetch });

  notes = new HttpRepository<TNote>({
    dataSource: new HttpDataSource({ baseUrl: `http://127.0.0.1:${server.port}` }),
    resource: 'notes',
  });

  wrappedNotes = new HttpRepository<TNote>({
    dataSource: new HttpDataSource({
      baseUrl: `http://127.0.0.1:${wrappedServer.port}`,
      errorRootKey: 'error',
    }),
    resource: 'notes',
  });
});

afterAll(async () => {
  await server.stop(true);
  await wrappedServer.stop(true);
  await dataSource.endDriver();
});

describe('HttpRepository writes through a real IGNIS CRUD controller', () => {
  test('create, update, bulk update, delete and bulk delete all land on the server', async () => {
    const first = await notes.create({ data: { title: 'first' } });
    const second = await notes.create({ data: { title: 'second' } });
    const third = await notes.create({ data: { title: 'third' } });

    expect(first).toMatchObject({ count: 1, data: { title: 'first', status: 'open' } });
    const ids = [first.data.id, second.data.id, third.data.id];

    const updated = await notes.updateById({ id: first.data.id, data: { title: 'first, edited' } });
    expect(updated).toMatchObject({
      count: 1,
      data: { id: first.data.id, title: 'first, edited' },
    });
    expect(await notes.findById({ id: first.data.id })).toMatchObject({ title: 'first, edited' });

    const closed = await notes.updateBy({
      where: { id: { inq: [second.data.id, third.data.id] } },
      data: { status: 'closed' },
    });
    expect(closed.count).toBe(2);
    expect(await notes.count({ where: { status: 'closed' } })).toEqual({ count: 2 });

    const removed = await notes.deleteById({ id: first.data.id });
    expect(removed).toMatchObject({ count: 1, data: { id: first.data.id } });

    const purged = await notes.deleteBy({ where: { id: { inq: ids } } });
    expect(purged.count).toBe(2);
    expect(await notes.count({ where: {} })).toEqual({ count: 0 });
  });

  test('a server validation error comes back with the server status and message', async () => {
    let caught: unknown;
    try {
      // `title` is required by the generated create schema, so the server refuses the body.
      await notes.create({ data: {} });
    } catch (error) {
      caught = error;
    }

    if (!isApplicationError(caught)) {
      throw new Error(`expected an ApplicationError, got: ${String(caught)}`);
    }

    expect(caught.statusCode).toBe(422);
    expect(caught.message).toContain('[http][write] 422');
    expect(caught.message).toContain('/notes');
    expect(caught.message).toContain('Invalid input');
    expect(await notes.count({ where: {} })).toEqual({ count: 0 });
  });

  test("a 422's per-field issues are the error's cause, naming the field", async () => {
    const caught = await notes.create({ data: {} }).catch((error: unknown) => error);

    if (!isApplicationError(caught)) {
      throw new Error(`expected an ApplicationError, got: ${String(caught)}`);
    }

    const issues = caught.cause as Array<{ path: string }> | undefined;
    expect(issues?.map(entry => entry.path)).toContain('title');
  });

  test("an envelope under the server's rootKey keeps the server's code and text", async () => {
    const caught = await wrappedNotes.create({ data: {} }).catch((error: unknown) => error);

    if (!isApplicationError(caught)) {
      throw new Error(`expected an ApplicationError, got: ${String(caught)}`);
    }

    expect(caught.statusCode).toBe(422);
    expect(caught.normalized.code).not.toBe('core.system_error');
    expect(caught.normalized.text).toStartWith('Invalid input');
  });
});

describe('HttpRepository reads through a real IGNIS CRUD controller', () => {
  test('a ranged find, findOne and existsWith read what the server holds', async () => {
    const created = await Promise.all(
      ['r1', 'r2', 'r3'].map(title => notes.create({ data: { title } })),
    );
    const ids = created.map(entry => entry.data.id);

    const page = await notes.find({
      filter: { where: { id: { inq: ids } }, order: ['id ASC'], limit: 2, skip: 1 },
      options: { shouldQueryRange: true },
    });
    expect(page.data.map(row => row.title)).toEqual(['r2', 'r3']);
    expect(page.range).toMatchObject({ start: 1, end: 2, total: 3 });

    expect(await notes.findOne({ filter: { where: { title: 'r2' } } })).toMatchObject({
      title: 'r2',
    });
    expect(await notes.existsWith({ where: { title: 'r3' } })).toBe(true);
    expect(await notes.existsWith({ where: { title: 'nope' } })).toBe(false);

    await notes.deleteBy({ where: { id: { inq: ids } } });
  });
});
