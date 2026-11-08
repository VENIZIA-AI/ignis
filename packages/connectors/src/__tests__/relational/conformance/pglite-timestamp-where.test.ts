import { PGlite } from '@electric-sql/pglite';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  BaseAppErrorMiddleware,
  CrudControllerFactory,
  controller,
  CrudRoutes,
  datasource,
  model,
  repository as repositoryDecorator,
} from '@venizia/ignis-kernel';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { date, integer, pgTable, timestamp } from 'drizzle-orm/pg-core';
import type { TTableInsert, TTableObject } from '@/relational/core/models';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { isoTimestamp } from '@/relational/postgres/models/common/columns';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import { TIMESTAMP_TABLE, TimestampWhereCases } from './timestamp-where-cases';

const eventTable = pgTable(TIMESTAMP_TABLE, {
  id: integer('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }),
  atNaive: timestamp('at_naive'),
  atIso: isoTimestamp('at_iso', { withTimezone: true }),
  onDay: date('on_day', { mode: 'date' }),
});

@model({ type: 'entity' })
class TimestampEvent extends BasePostgresEntity<typeof eventTable> {
  static override TABLE_NAME = TIMESTAMP_TABLE;
  static override schema = eventTable;
}

@datasource({ driver: PGliteDriver })
class TimestampDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: TimestampDataSource.name,
      config: {},
      schema: { TimestampEvent: eventTable },
    });

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

let client: PGlite;
let dataSource: TimestampDataSource;

@repositoryDecorator({ model: TimestampEvent, dataSource: 'TimestampDataSource' })
class TimestampEventRepository extends DefaultCRUDRepository<
  typeof eventTable,
  TTableObject<typeof eventTable>,
  TTableInsert<typeof eventTable>,
  IDatabaseExtraOptions,
  TimestampDataSource
> {}

let repository: TimestampEventRepository;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE ${TIMESTAMP_TABLE} (
      id integer primary key,
      at timestamptz,
      at_naive timestamp,
      at_iso timestamptz,
      on_day date
    );
    INSERT INTO ${TIMESTAMP_TABLE} (id, at, at_naive, at_iso, on_day) VALUES
      (1, '2026-11-06T00:00:00Z', '2026-11-06 00:00:00', '2026-11-06T00:00:00Z', '2026-11-06'),
      (2, '2026-11-07T00:00:00Z', '2026-11-07 00:00:00', '2026-11-07T00:00:00Z', '2026-11-07'),
      (3, '2026-11-08T12:30:00Z', '2026-11-08 12:30:00', '2026-11-08T12:30:00Z', '2026-11-08'),
      (4, NULL, NULL, NULL, NULL);
  `);

  dataSource = new TimestampDataSource({ client });
  repository = new TimestampEventRepository(dataSource, { entityClass: TimestampEvent });
});

afterAll(async () => {
  await dataSource.endDriver();
});

const find = (where: object) => repository.find({ filter: { where } });

TimestampWhereCases.register({ engine: 'Postgres', columns: ['at', 'atNaive'], find });

describe('Postgres - a date column', () => {
  test('is filtered with a date string', async () => {
    const rows = await find({ onDay: { gt: '2026-11-07' } });

    expect(rows.map((row) => row.id)).toEqual([3]);
  });

  test('is filtered with a date-time string and an in list', async () => {
    const rows = await find({ onDay: { in: ['2026-11-06', '2026-11-08T00:00:00Z'] } });

    expect(rows.map((row) => row.id).sort()).toEqual([1, 3]);
  });

  test('refuses a bad value with a 400 that names the column', async () => {
    await RejectionHelper.expectRejection({ task: find({ onDay: 'someday' }), message: /'onDay'/ });
  });
});

describe('Postgres - a column that takes a string natively', () => {
  test('keeps accepting a string, unconverted', async () => {
    const rows = await find({ atIso: { gt: '2026-11-07T00:00:00.000Z' } });

    expect(rows.map((row) => row.id)).toEqual([3]);
  });
});

describe('Postgres - a generated CRUD route', () => {
  let router: AnyType;

  beforeAll(async () => {
    const RouteController = CrudControllerFactory.build({
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
