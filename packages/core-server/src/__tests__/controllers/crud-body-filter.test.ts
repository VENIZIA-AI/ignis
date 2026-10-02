// Import order guard: see route-registration.test.ts.
import '@/base/applications';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { ControllerFactory, datasource, model } from '@venizia/ignis-kernel';
import type { TRouteContext, TWhere } from '@venizia/ignis-kernel';
import { BasePostgresDataSource, BasePostgresEntity } from '@venizia/ignis-connectors/postgres';
import { PGliteDriver } from '@venizia/ignis-connectors/postgres/pglite';
import { DefaultRelationalRepository } from '@venizia/ignis-connectors/relational';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { Logger } from '@venizia/ignis-helpers/winston';
import { Hono } from 'hono';
import { repository } from '@/base/metadata';
import { AppErrorMiddleware } from '@/base/middlewares';

const logger = Logger.get('crud-body-filter-test');
logger.error = () => undefined;
logger.log = () => undefined;

/**
 * A long id list does not fit in a GET query string, so every generated CRUD controller also reads
 * through `POST /find` (the filter in the body) and `POST /count` (the where in the body). They
 * answer what the GET routes answer, under the same enable flag, permission and base where.
 */

const TABLE_NAME = 'crud_body_filter_item';

const table = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  tenant: text('tenant').notNull(),
});

type TItem = { id: number; name: string; tenant: string };

@model({ type: 'entity' })
class BodyFilterItem extends BasePostgresEntity<typeof table> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = table;
}

@datasource({ driver: PGliteDriver, autoDiscovery: false })
class BodyFilterDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({ name: BodyFilterDataSource.name, config: {}, schema: { [TABLE_NAME]: table } });
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

@repository({ model: BodyFilterItem, dataSource: BodyFilterDataSource })
class BodyFilterItemRepository {}

const ROW_COUNT = 300;
const json = { 'content-type': 'application/json' };

let dataSource: BodyFilterDataSource;
let itemRepository: DefaultRelationalRepository<typeof table>;

const buildRouter = async (opts: {
  name: string;
  options?: Partial<Parameters<typeof ControllerFactory.defineCrudController>[0]>;
  baseWhere?: TWhere<TItem>;
}) => {
  const Generated = ControllerFactory.defineCrudController({
    entity: BodyFilterItem,
    repository: { name: BodyFilterItemRepository.name },
    controller: { name: opts.name, basePath: '/items', ...opts.options?.controller },
    routes: opts.options?.routes,
  });

  const baseWhere = opts.baseWhere;
  const Scoped = class extends Generated {
    override async getBaseWhere(_opts: { context: TRouteContext }) {
      return baseWhere;
    }
  };

  const controller = new Scoped(itemRepository);
  await controller.configure();

  // Behind the framework's error handler, as an application mounts it: a validation failure then
  // renders its real status instead of Hono's bare 500.
  const app = new Hono();
  app.route('/', controller.getRouter());
  app.onError(new AppErrorMiddleware({ logger }).value());
  return app;
};

const readJson = async (response: Response): Promise<any> => response.json();

beforeAll(async () => {
  const client = new PGlite();
  await client.waitReady;
  await client.exec(
    `CREATE TABLE ${TABLE_NAME} (id serial primary key, name text not null, tenant text not null);`,
  );

  dataSource = new BodyFilterDataSource({ client });
  itemRepository = new DefaultRelationalRepository<typeof table>(dataSource, {
    entityClass: BodyFilterItem,
  });

  await itemRepository.createAll({
    data: Array.from({ length: ROW_COUNT }, (_, index) => ({
      name: `item-${index + 1}`,
      tenant: index % 2 === 0 ? 'north' : 'south',
    })),
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

describe('POST /find answers what GET / answers, with the filter in the body', () => {
  test('the same rows, the same Content-Range', async () => {
    const router = await buildRouter({ name: 'BodyFilterSameController' });
    const filter = { where: { tenant: 'north' }, order: ['id ASC'], limit: 5, skip: 10 };

    const viaGet = await router.request(`/?filter=${encodeURIComponent(JSON.stringify(filter))}`);
    const viaPost = await router.request('/find', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ filter }),
    });

    expect(viaPost.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(await readJson(viaPost)).toEqual(await readJson(viaGet));
    expect(viaPost.headers.get('content-range')).toBe(viaGet.headers.get('content-range'));
  });

  test('a 2000-id inq that no URL would carry', async () => {
    const router = await buildRouter({ name: 'BodyFilterLongController' });
    const ids = Array.from({ length: 2000 }, (_, index) => index + 1);

    const response = await router.request('/find', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ filter: { where: { id: { inq: ids } }, limit: 1000 } }),
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    const body = await readJson(response);
    expect(body.data).toHaveLength(ROW_COUNT);
  });

  test('a malformed filter is a validation error, not a missing route or a 500', async () => {
    const router = await buildRouter({ name: 'BodyFilterMalformedController' });

    const response = await router.request('/find', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ filter: { limit: 'many' } }),
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.UnprocessableEntity);
  });
});

describe('POST /count answers what GET /count answers, with the where in the body', () => {
  test('the same count', async () => {
    const router = await buildRouter({ name: 'BodyCountSameController' });
    const where = { tenant: 'south' };

    const viaGet = await router.request(
      `/count?where=${encodeURIComponent(JSON.stringify(where))}`,
    );
    const viaPost = await router.request('/count', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ where }),
    });

    expect(viaPost.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(await readJson(viaPost)).toEqual(await readJson(viaGet));
    expect(
      await readJson(
        await router.request(`/count?where=${encodeURIComponent(JSON.stringify(where))}`),
      ),
    ).toEqual({
      count: ROW_COUNT / 2,
    });
  });
});

describe('the POST twins inherit the GET routes rules', () => {
  test('the base where scopes both', async () => {
    const router = await buildRouter({
      name: 'BodyFilterScopedController',
      baseWhere: { tenant: 'north' },
    });

    const found = await router.request('/find', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ filter: { where: { tenant: 'south' } } }),
    });
    const counted = await router.request('/count', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ where: { tenant: 'south' } }),
    });

    expect((await readJson(found)).data).toEqual([]);
    expect(await readJson(counted)).toEqual({ count: 0 });
  });

  test('disabling find disables POST /find; disabling count disables POST /count', async () => {
    const router = await buildRouter({
      name: 'BodyFilterDisabledController',
      options: { routes: { find: { enabled: false }, count: { enabled: false } } },
    });

    const found = await router.request('/find', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ filter: {} }),
    });
    const counted = await router.request('/count', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ where: {} }),
    });

    expect(found.status).toBe(HTTP.ResultCodes.RS_4.NotFound);
    expect(counted.status).toBe(HTTP.ResultCodes.RS_4.NotFound);
  });

  test('a readonly controller keeps both, since they only read', async () => {
    const router = await buildRouter({
      name: 'BodyFilterReadonlyController',
      options: {
        controller: { name: 'BodyFilterReadonlyController', basePath: '/items', readonly: true },
      },
    });

    const found = await router.request('/find', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ filter: { limit: 1 } }),
    });

    expect(found.status).toBe(HTTP.ResultCodes.RS_2.Ok);
  });
});
