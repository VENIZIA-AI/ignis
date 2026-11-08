import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  BaseAppErrorMiddleware,
  ControllerFactory,
  controller,
  CrudRoutes,
  datasource,
  model,
  repository as repositoryDecorator,
} from '@venizia/ignis-kernel';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import { isoTimestamp } from '@/relational/sqlite/models/common/columns';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import { TIMESTAMP_TABLE, TimestampWhereCases } from './timestamp-where-cases';

const eventTable = sqliteTable(TIMESTAMP_TABLE, {
  id: integer('id').primaryKey(),
  at: integer('at', { mode: 'timestamp_ms' }),
  atSeconds: integer('at_seconds', { mode: 'timestamp' }),
  atIso: isoTimestamp('at_iso'),
  label: text('label'),
});

@model({ type: 'entity' })
class TimestampEvent extends BaseSqliteEntity {
  static override TABLE_NAME = TIMESTAMP_TABLE;
  static override schema = eventTable;
}

@datasource({ driver: LibSqlDriver })
class TimestampDataSource extends BaseSqliteDataSource<{ url: string }, AnyType, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: TimestampDataSource.name,
      config: { url: ':memory:' },
      schema: { [TIMESTAMP_TABLE]: eventTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}
}

@repositoryDecorator({ model: TimestampEvent, dataSource: 'TimestampDataSource' })
class TimestampEventRepository extends DefaultSqliteRepository<AnyType> {}

let client: Client;
let repository: AnyType;

beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  await client.executeMultiple(`
    CREATE TABLE ${TIMESTAMP_TABLE} (
      id integer primary key,
      at integer,
      at_seconds integer,
      at_iso text,
      label text
    );
    INSERT INTO ${TIMESTAMP_TABLE} (id, at, at_seconds, at_iso) VALUES
      (1, ${Date.parse('2026-11-06T00:00:00Z')}, ${Date.parse('2026-11-06T00:00:00Z') / 1000}, '2026-11-06T00:00:00.000Z'),
      (2, ${Date.parse('2026-11-07T00:00:00Z')}, ${Date.parse('2026-11-07T00:00:00Z') / 1000}, '2026-11-07T00:00:00.000Z'),
      (3, ${Date.parse('2026-11-08T12:30:00Z')}, ${Date.parse('2026-11-08T12:30:00Z') / 1000}, '2026-11-08T12:30:00.000Z'),
      (4, NULL, NULL, NULL);
  `);

  repository = new TimestampEventRepository(new TimestampDataSource({ client }), {
    entityClass: TimestampEvent,
  });
});

afterAll(() => {
  client.close();
});

const find = (where: object): Promise<Array<{ id: number }>> =>
  repository.find({ filter: { where } });

TimestampWhereCases.register({ engine: 'SQLite', columns: ['at', 'atSeconds'], find });

describe('SQLite - a seconds-resolution column', () => {
  test('compares an instant inside the second at the second', async () => {
    const rows = await find({ atSeconds: '2026-11-07T00:00:00.999Z' });

    expect(rows.map((row) => row.id)).toEqual([2]);
  });
});

describe('SQLite - a column that takes a string natively', () => {
  test('keeps accepting a string, unconverted', async () => {
    const rows = await find({ atIso: { gt: '2026-11-07T00:00:00.000Z' } });

    expect(rows.map((row) => row.id)).toEqual([3]);
  });

  test('keeps a plain text column out of the conversion', async () => {
    const rows = await find({ label: 'not a date' });

    expect(rows).toEqual([]);
  });

  test('refuses a bad value with a 400 that names the column', async () => {
    await RejectionHelper.expectRejection({ task: find({ at: 'someday' }), message: /'at'/ });
  });
});

describe('SQLite - a generated CRUD route', () => {
  let router: AnyType;

  beforeAll(async () => {
    const RouteController = ControllerFactory.crud({
      repository: TimestampEventRepository,
      routes: CrudRoutes.READ,
    });

    @controller({ path: '/events' })
    class EventsController extends RouteController {}

    const eventsController = new EventsController(repository);
    await eventsController.configure();
    router = eventsController.getRouter();
    router.onError(new BaseAppErrorMiddleware().value());
  });

  const get = (where: object) => {
    const query = new URLSearchParams({ filter: JSON.stringify({ where }) });

    return router.request(`/?${query.toString()}`);
  };

  test('filters a timestamp column with a date string', async () => {
    const response = await get({ at: { gt: '2026-11-07' } });
    const body: { data: Array<{ id: number }> } = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.map((row) => row.id)).toEqual([3]);
  });

  test('answers 400, not 500, for a value that is no timestamp', async () => {
    const response = await get({ at: { gt: 'tomorrow' } });
    const json = await response.json();
    const body = JSON.stringify(json);

    expect(response.status).toBe(400);
    expect(body).toContain(`'at'`);
  });
});
