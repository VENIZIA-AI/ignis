// Must precede the controllers import below: import order avoids a circular-import TDZ error
// (BaseRestController not yet defined when health-check's controller extends it) - same guard the
// search factory tests use.
import '@/base/applications';

import { describe, expect, test } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import type { TRouteContext } from '@/base/controllers';
import { BaseRestController } from '@/base/controllers';
import { ControllerFactory } from '@/base/controllers/factory';
import { api, controller, del, get, model, patch, post, put, repository } from '@/base/metadata';
import { jsonContent, jsonResponse } from '@/base/models';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import { z } from '@hono/zod-openapi';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers';
import { HTTP } from '@venizia/ignis-helpers';
import { getDroppedRouteDecorators } from '@/base/metadata/routes/common';
import { applyMethodDecorator, fakeCrudRepository } from './fixtures';

const okResponse = jsonResponse({ schema: z.object({ hit: z.string() }), description: 'ok' });

// ---------------------------------------------------------------------------------------------
// 1. The three route APIs
// ---------------------------------------------------------------------------------------------

@controller({ path: '/decorated' })
class DecoratedRoutesController extends BaseRestController {
  constructor() {
    super({ scope: DecoratedRoutesController.name });
  }

  override binding(): ValueOrPromise<void> {
    // Routes come exclusively from the decorators applied below.
  }

  getRoute(context: TRouteContext) {
    return context.json({ hit: 'get' }, HTTP.ResultCodes.RS_2.Ok);
  }

  postRoute(context: TRouteContext) {
    return context.json({ hit: 'post' }, HTTP.ResultCodes.RS_2.Ok);
  }

  putRoute(context: TRouteContext) {
    return context.json({ hit: 'put' }, HTTP.ResultCodes.RS_2.Ok);
  }

  patchRoute(context: TRouteContext) {
    return context.json({ hit: 'patch' }, HTTP.ResultCodes.RS_2.Ok);
  }

  deleteRoute(context: TRouteContext) {
    return context.json({ hit: 'delete' }, HTTP.ResultCodes.RS_2.Ok);
  }

  apiRoute(context: TRouteContext) {
    return context.json({ hit: 'api' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

applyMethodDecorator({
  decorator: get({ configs: { path: '/get-route', responses: okResponse } }),
  target: DecoratedRoutesController.prototype,
  methodName: 'getRoute',
});
applyMethodDecorator({
  decorator: post({ configs: { path: '/post-route', responses: okResponse } }),
  target: DecoratedRoutesController.prototype,
  methodName: 'postRoute',
});
applyMethodDecorator({
  decorator: put({ configs: { path: '/put-route', responses: okResponse } }),
  target: DecoratedRoutesController.prototype,
  methodName: 'putRoute',
});
applyMethodDecorator({
  decorator: patch({ configs: { path: '/patch-route', responses: okResponse } }),
  target: DecoratedRoutesController.prototype,
  methodName: 'patchRoute',
});
applyMethodDecorator({
  decorator: del({ configs: { path: '/delete-route', responses: okResponse } }),
  target: DecoratedRoutesController.prototype,
  methodName: 'deleteRoute',
});
applyMethodDecorator({
  decorator: api({
    configs: { method: HTTP.Methods.GET, path: '/api-route', responses: okResponse },
  }),
  target: DecoratedRoutesController.prototype,
  methodName: 'apiRoute',
});

@controller({ path: '/mixed' })
class MixedRoutesController extends BaseRestController {
  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: {
        method: HTTP.Methods.GET,
        path: '/imperative',
        responses: okResponse,
      },
      handler: (context: TRouteContext) => {
        return context.json({ hit: 'imperative' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    this.bindRoute({
      configs: {
        method: HTTP.Methods.POST,
        path: '/fluent',
        request: {
          body: jsonContent({ description: 'body', schema: z.object({ id: z.string() }) }),
        },
        responses: okResponse,
      },
    }).to({
      handler: (context: TRouteContext) => {
        const body = context.req.valid<{ id: string }>('json');
        return context.json({ hit: `fluent:${body.id}` }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }

  decoratedRoute(context: TRouteContext) {
    return context.json({ hit: 'decorated' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

applyMethodDecorator({
  decorator: get({ configs: { path: '/decorated', responses: okResponse } }),
  target: MixedRoutesController.prototype,
  methodName: 'decoratedRoute',
});

@controller({ path: '/duplicated' })
class DuplicateRouteController extends BaseRestController {
  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: { method: HTTP.Methods.GET, path: '/dup', responses: okResponse },
      handler: (context: TRouteContext) => context.json({ hit: 'first' }, HTTP.ResultCodes.RS_2.Ok),
    });

    this.defineRoute({
      configs: { method: HTTP.Methods.GET, path: '/dup', responses: okResponse },
      handler: (context: TRouteContext) =>
        context.json({ hit: 'second' }, HTTP.ResultCodes.RS_2.Ok),
    });
  }
}

// ---------------------------------------------------------------------------------------------
// 2. A decorator route on a subclass of a generated CRUD controller (the shape consumer apps use)
// ---------------------------------------------------------------------------------------------

class RouteOrderDataSource extends BasePostgresDataSource<{}> {
  configure(): void {
    // no-op: this fixture never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

@model({ type: 'entity' })
class RouteOrderSubscriber extends BasePostgresEntity<typeof RouteOrderSubscriber.schema> {
  static override schema = pgTable('route_order_subscriber', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }),
  });
}

// Registered purely for the @repository decorator's side effect (binding registration).
@repository({ model: RouteOrderSubscriber, dataSource: RouteOrderDataSource })
class RouteOrderSubscriberRepository {}

const SubscriberCrudController = ControllerFactory.defineCrudController({
  entity: RouteOrderSubscriber,
  repository: { name: RouteOrderSubscriberRepository.name },
  controller: { name: 'RouteOrderSubscriberController', basePath: '/subscribers' },
});

@controller({ path: '/subscribers' })
class RouteOrderSubscriberController extends SubscriberCrudController {
  unsubscribe(context: TRouteContext) {
    return context.json({ hit: 'unsubscribe' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

applyMethodDecorator({
  decorator: get({ configs: { path: '/unsubscribe', responses: okResponse } }),
  target: RouteOrderSubscriberController.prototype,
  methodName: 'unsubscribe',
});

// The shape consumer apps use to hand-write an id endpoint: the generated findById is disabled and
// a decorator route takes its place, while the generated static routes (/count) stay enabled.
const CountOnlyCrudController = ControllerFactory.defineCrudController({
  entity: RouteOrderSubscriber,
  repository: { name: RouteOrderSubscriberRepository.name },
  controller: {
    name: 'RouteOrderCountOnlyController',
    basePath: '/subscribers',
    enabledRoutes: ['count'],
  },
});

@controller({ path: '/subscribers' })
class RouteOrderCountOnlyController extends CountOnlyCrudController {
  customFindById(context: TRouteContext) {
    return context.json({ hit: 'customFindById' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

applyMethodDecorator({
  decorator: get({ configs: { path: '/{id}', responses: okResponse } }),
  target: RouteOrderCountOnlyController.prototype,
  methodName: 'customFindById',
});

// ---------------------------------------------------------------------------------------------

describe('Route registration - decorator, imperative, fluent', () => {
  test('every route decorator (@get/@post/@put/@patch/@del/@api) mounts its route on the router', async () => {
    const restController = new DecoratedRoutesController();
    await restController.configure();

    const mounted = new Set(
      restController.getRouter().routes.map(route => `${route.method} ${route.path}`),
    );

    expect(mounted).toContain('GET /get-route');
    expect(mounted).toContain('POST /post-route');
    expect(mounted).toContain('PUT /put-route');
    expect(mounted).toContain('PATCH /patch-route');
    expect(mounted).toContain('DELETE /delete-route');
    expect(mounted).toContain('GET /api-route');

    const response = await restController.getRouter().request('/get-route');
    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(await response.json()).toEqual({ hit: 'get' });
  });

  test('a TC39-shaped decorator call registers nothing on the method and is recorded, not swallowed', () => {
    const decorate = api({
      configs: { method: HTTP.Methods.GET, path: '/tc39', responses: okResponse },
    }) as AnyType;

    const handler = function tc39Handler() {};
    decorate(handler, { kind: 'method', name: 'tc39Handler' });

    // The config must never be attached to the method function: nothing reads metadata from there.
    expect(Reflect.getMetadataKeys(handler)).toEqual([]);
    expect(getDroppedRouteDecorators()).toContain('@api tc39Handler');
  });

  test('decorator, defineRoute and bindRoute routes coexist in one controller and all dispatch', async () => {
    const restController = new MixedRoutesController({ scope: 'MixedRoutesController' });
    await restController.configure();

    const mounted = new Set(
      restController.getRouter().routes.map(route => `${route.method} ${route.path}`),
    );
    expect(mounted).toContain('GET /imperative');
    expect(mounted).toContain('POST /fluent');
    expect(mounted).toContain('GET /decorated');

    const imperative = await restController.getRouter().request('/imperative');
    expect(await imperative.json()).toEqual({ hit: 'imperative' });

    const fluent = await restController.getRouter().request('/fluent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'abc' }),
    });
    expect(await fluent.json()).toEqual({ hit: 'fluent:abc' });

    const decorated = await restController.getRouter().request('/decorated');
    expect(await decorated.json()).toEqual({ hit: 'decorated' });
  });

  test('configure() is idempotent - a second call does not re-register routes', async () => {
    const restController = new DecoratedRoutesController();
    await restController.configure();
    const afterFirst = restController.getRouter().routes.length;

    await restController.configure();
    expect(restController.getRouter().routes.length).toBe(afterFirst);
  });

  test('a duplicate path+method is NOT rejected - both mount, the first registered wins', async () => {
    const restController = new DuplicateRouteController({ scope: 'DuplicateRouteController' });
    await restController.configure();

    const duplicates = restController
      .getRouter()
      .routes.filter(route => route.method === 'GET' && route.path === '/dup');
    expect(duplicates.length).toBeGreaterThan(1);

    const response = await restController.getRouter().request('/dup');
    expect(await response.json()).toEqual({ hit: 'first' });
  });

  test('a static decorator route wins over an inherited CRUD param route on the same path segment', async () => {
    const restController = new RouteOrderSubscriberController(
      fakeCrudRepository({ records: [{ id: 1, email: 'a@b.c' }] }),
    );
    await restController.configure();

    const response = await restController.getRouter().request('/unsubscribe');

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(await response.json()).toEqual({ hit: 'unsubscribe' });
  });

  test('a decorator PARAM route does NOT swallow the generated static routes of its CRUD base', async () => {
    const restController = new RouteOrderCountOnlyController(
      fakeCrudRepository({ records: [{ id: 1, email: 'a@b.c' }] }),
    );
    await restController.configure();

    const count = await restController.getRouter().request('/count?where=%7B%7D');
    expect(count.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(await count.json()).toEqual({ count: 1 });

    const byId = await restController.getRouter().request('/9');
    expect(byId.status).toBe(HTTP.ResultCodes.RS_2.Ok);
    expect(await byId.json()).toEqual({ hit: 'customFindById' });
  });
});
