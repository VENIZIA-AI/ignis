// Import order guard: see route-registration.test.ts.
import '@/base/applications';

import { describe, expect, test } from 'bun:test';
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';

import { CrudRoutes, ControllerFactory } from '@venizia/ignis-kernel';
import { controller, model, repository } from '@/base/metadata';
import { SchemaTypes } from '@venizia/ignis-kernel';
import {
  BasePostgresDataSource,
  BasePostgresEntity,
  DefaultCRUDRepository,
} from '@venizia/ignis-connectors/postgres';
import type { TAnyObjectSchema, TCrudRoutes } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { fakeCrudRepository } from './fixtures';

class CrudFactoryDataSource extends BasePostgresDataSource<{}> {
  configure(): void {
    // no-op: this fixture never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

/** Numeric primary key - `getIdType()` resolves to 'number', the path-param branch under test. */
@model({ type: 'entity', settings: { properties: { hidden: ['secret'] } } })
class CrudFactoryAccount extends BasePostgresEntity<typeof CrudFactoryAccount.schema> {
  static override schema = pgTable('crud_factory_account', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }),
    secret: varchar('secret', { length: 255 }),
  });
}

/** Text primary key - `getIdType()` resolves to 'string'. */
@model({ type: 'entity' })
class CrudFactoryDocument extends BasePostgresEntity<typeof CrudFactoryDocument.schema> {
  static override schema = pgTable('crud_factory_document', {
    id: text('id').primaryKey(),
    title: varchar('title', { length: 255 }),
  });
}

@repository({ model: CrudFactoryAccount, dataSource: CrudFactoryDataSource })
class CrudFactoryAccountRepository extends DefaultCRUDRepository<
  typeof CrudFactoryAccount.schema
> {}

@repository({ model: CrudFactoryDocument, dataSource: CrudFactoryDataSource })
class CrudFactoryDocumentRepository extends DefaultCRUDRepository<
  typeof CrudFactoryDocument.schema
> {}

const mountedRoutes = (opts: { router: { routes: Array<{ method: string; path: string }> } }) => {
  return new Set(opts.router.routes.map((route) => `${route.method} ${route.path}`));
};

describe('ControllerFactory.crud - generated routes', () => {
  test('mounts the nine CRUD routes, with /count and /find-one ahead of the /:id param route', async () => {
    const AccountCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      routes: {
        ...CrudRoutes.READ,
        create: true,
        updateById: true,
        updateBy: true,
        deleteById: true,
        deleteBy: true,
      },
    });

    @controller({ path: '/accounts' })
    class AccountController extends AccountCrudController {}

    const restController = new AccountController(fakeCrudRepository({ records: [] }));
    await restController.configure();

    expect(mountedRoutes({ router: restController.getRouter() })).toEqual(
      new Set([
        'GET /count',
        'GET /',
        'GET /find-one',
        'GET /:id',
        'POST /',
        'PATCH /:id',
        'PATCH /',
        'DELETE /:id',
        'DELETE /',
      ]),
    );

    const paths = restController.getRouter().routes.map((route) => route.path);
    expect(paths.indexOf('/count')).toBeLessThan(paths.indexOf('/:id'));
    expect(paths.indexOf('/find-one')).toBeLessThan(paths.indexOf('/:id'));
  });

  test('CrudRoutes.READ registers only the four read routes', async () => {
    const ReadCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      routes: CrudRoutes.READ,
    });

    @controller({ path: '/accounts' })
    class ReadController extends ReadCrudController {}

    const restController = new ReadController(fakeCrudRepository({ records: [] }));
    await restController.configure();

    expect(mountedRoutes({ router: restController.getRouter() })).toEqual(
      new Set(['GET /count', 'GET /', 'GET /find-one', 'GET /:id']),
    );
  });

  test('a listed route exists and an unlisted one does not', async () => {
    const ListedCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      routes: { count: true, create: true },
    });

    @controller({ path: '/accounts' })
    class ListedController extends ListedCrudController {}

    const restController = new ListedController(fakeCrudRepository({ records: [] }));
    await restController.configure();

    expect(mountedRoutes({ router: restController.getRouter() })).toEqual(
      new Set(['GET /count', 'POST /']),
    );
  });

  test('no routes map mounts no route', async () => {
    const BareCrudController = ControllerFactory.crud({ repository: CrudFactoryAccountRepository });

    @controller({ path: '/accounts' })
    class BareController extends BareCrudController {}

    const restController = new BareController(fakeCrudRepository({ records: [] }));
    await restController.configure();

    expect(mountedRoutes({ router: restController.getRouter() }).size).toBe(0);
  });

  test('defining the controller twice for one repository yields independent classes and routers', async () => {
    const routes = { count: true, create: true } satisfies TCrudRoutes;

    const FirstCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      routes,
    });
    const SecondCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      routes,
    });

    expect(FirstCrudController).not.toBe(SecondCrudController);

    @controller({ path: '/accounts' })
    class FirstController extends FirstCrudController {}

    @controller({ path: '/accounts' })
    class SecondController extends SecondCrudController {}

    const first = new FirstController(fakeCrudRepository({ records: [] }));
    const second = new SecondController(fakeCrudRepository({ records: [] }));
    await first.configure();
    await second.configure();

    // The second definition must not re-mount its routes onto the first controller's router.
    expect(first.getRouter().routes.length).toBe(second.getRouter().routes.length);
    expect(mountedRoutes({ router: first.getRouter() })).toEqual(
      mountedRoutes({ router: second.getRouter() }),
    );
  });
});

describe('ControllerFactory.crud - request schemas', () => {
  test('GET /:id accepts a numeric id from the path (params arrive as strings)', async () => {
    const AccountCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      routes: { findById: true },
    });

    @controller({ path: '/accounts' })
    class AccountController extends AccountCrudController {}

    const restController = new AccountController(
      fakeCrudRepository({ records: [{ id: 7, email: 'a@b.c' }] }),
    );
    await restController.configure();

    const response = await restController.getRouter().request('/7');
    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);

    const result = await response.json();
    const body = result as { data: { resolvedId: number } };
    expect(body.data.resolvedId).toBe(7);
  });

  test('GET /:id accepts a string id when the entity id is text', async () => {
    const DocumentCrudController = ControllerFactory.crud({
      repository: CrudFactoryDocumentRepository,
      routes: { findById: true },
    });

    @controller({ path: '/documents' })
    class DocumentController extends DocumentCrudController {}

    const restController = new DocumentController(
      fakeCrudRepository({ records: [{ id: 'doc-1', title: 'x' }] }),
    );
    await restController.configure();

    const response = await restController.getRouter().request('/doc-1');
    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);

    const result = await response.json();
    const body = result as { data: { resolvedId: string } };
    expect(body.data.resolvedId).toBe('doc-1');
  });

  test('a per-route request.params override is honored on the id routes', async () => {
    const paramsSchema = z.object({
      id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
    });

    const OverriddenCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      routes: { findById: { request: { params: paramsSchema } } },
    });

    @controller({ path: '/accounts' })
    class OverriddenController extends OverriddenCrudController {}

    const restController = new OverriddenController(
      fakeCrudRepository({ records: [{ id: 'ext-1', email: 'a@b.c' }] }),
    );
    await restController.configure();

    const response = await restController.getRouter().request('/ext-1');
    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);

    const result = await response.json();
    const body = result as { data: { resolvedId: string } };
    expect(body.data.resolvedId).toBe('ext-1');
  });

  test('the count route honors isStrict.requestSchema for its where param', async () => {
    const StrictCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      isStrict: { path: true, requestSchema: true },
      routes: { count: true },
    });
    const LooseCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      isStrict: { path: true, requestSchema: false },
      routes: { count: true },
    });

    @controller({ path: '/accounts' })
    class StrictController extends StrictCrudController {}

    @controller({ path: '/accounts' })
    class LooseController extends LooseCrudController {}

    const strict = new StrictController(fakeCrudRepository({ records: [] }));
    const loose = new LooseController(fakeCrudRepository({ records: [] }));
    await strict.configure();
    await loose.configure();

    // `where` is mandatory under the strict schema...
    const strictResponse = await strict.getRouter().request('/count');
    expect(strictResponse.status).not.toBe(HTTP.ResultCodes.RS_2.Ok);

    // ...and optional under the loose one.
    const looseResponse = await loose.getRouter().request('/count');
    expect(looseResponse.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    const result = await looseResponse.json();
    expect(result).toEqual({ count: 0 });
  });

  test('the generated select schema still declares @model hidden properties - they are stripped at SQL level, not by the schema', () => {
    const entity = new CrudFactoryAccount();
    const selectSchema = entity.getSchema<TAnyObjectSchema>({ type: SchemaTypes.SELECT });

    // The response contract advertises `secret`; the repository is what never selects it. Pinned because the OpenAPI document, not the payload, is where the divergence shows up.
    expect(Object.keys(selectSchema.shape)).toContain('secret');
  });
});

describe('ControllerFactory.crud - bulk where in the query or the body', () => {
  const buildBulkController = async () => {
    const calls: Array<{ verb: string; where: unknown; data?: unknown }> = [];
    const recordingRepository = {
      ...fakeCrudRepository({ records: [] }),
      updateBy: async (updateOpts: { where: unknown; data: unknown }) => {
        calls.push({ verb: 'updateBy', where: updateOpts.where, data: updateOpts.data });

        return { count: 1, data: [] };
      },
      deleteBy: async (deleteOpts: { where: unknown }) => {
        calls.push({ verb: 'deleteBy', where: deleteOpts.where });

        return { count: 1, data: [] };
      },
    };

    const BulkCrudController = ControllerFactory.crud({
      repository: CrudFactoryAccountRepository,
      routes: { updateBy: true, deleteBy: true },
    });

    @controller({ path: '/accounts' })
    class BulkController extends BulkCrudController {}

    const restController = new BulkController(recordingRepository);
    await restController.configure();

    return { router: restController.getRouter(), calls };
  };

  const ids = Array.from({ length: 2000 }, (_, index) => index + 1);
  const where = { id: { inq: ids } };
  const json = { 'content-type': 'application/json' };
  const whereQuery = `?where=${encodeURIComponent(JSON.stringify({ id: 1 }))}`;

  test('PATCH / takes where from the body, and it never reaches the data', async () => {
    const { router, calls } = await buildBulkController();

    const response = await router.request('/', {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ where, email: 'x@y.z' }),
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(calls).toEqual([{ verb: 'updateBy', where, data: { email: 'x@y.z' } }]);
  });

  test('PATCH / still takes where from the query', async () => {
    const { router, calls } = await buildBulkController();

    const response = await router.request(`/${whereQuery}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ email: 'x@y.z' }),
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(calls).toEqual([{ verb: 'updateBy', where: { id: 1 }, data: { email: 'x@y.z' } }]);
  });

  test('DELETE / takes where from the body', async () => {
    const { router, calls } = await buildBulkController();

    const response = await router.request('/', {
      method: 'DELETE',
      headers: json,
      body: JSON.stringify({ where }),
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(calls).toEqual([{ verb: 'deleteBy', where }]);
  });

  test('DELETE / still takes where from the query, with no body', async () => {
    const { router, calls } = await buildBulkController();

    const response = await router.request(`/${whereQuery}`, { method: 'DELETE' });

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(calls).toEqual([{ verb: 'deleteBy', where: { id: 1 } }]);
  });

  // A declared body schema gates the media type: a client that sends a content-type and no body then
  // gets 400 where it used to get 200. Measured before the fix: 400 for json, 415 for text/plain.
  test.each([
    [{}, 'no headers'],
    [{ 'content-type': 'application/json' }, 'a json content-type and no body'],
    [{ 'content-type': 'text/plain' }, 'a text content-type and no body'],
  ])('DELETE / with a query where works with %#: %s', async (headers) => {
    const { router, calls } = await buildBulkController();

    const response = await router.request(`/${whereQuery}`, {
      method: 'DELETE',
      headers: headers as Record<string, string>,
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(calls).toEqual([{ verb: 'deleteBy', where: { id: 1 } }]);
  });

  test('where in both places is refused, and nothing is written', async () => {
    const { router, calls } = await buildBulkController();

    const patched = await router.request(`/${whereQuery}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ where, email: 'x@y.z' }),
    });
    const deleted = await router.request(`/${whereQuery}`, {
      method: 'DELETE',
      headers: json,
      body: JSON.stringify({ where }),
    });

    expect(patched.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    expect(deleted.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    const result = await deleted.json();
    expect(result).toMatchObject({ message: expect.stringMatching(/both/) });
    expect(calls).toEqual([]);
  });

  test('where in neither place is refused, and nothing is written', async () => {
    const { router, calls } = await buildBulkController();

    const patched = await router.request('/', {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ email: 'x@y.z' }),
    });
    const deleted = await router.request('/', { method: 'DELETE' });

    expect(patched.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    expect(deleted.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    expect(calls).toEqual([]);
  });
});
