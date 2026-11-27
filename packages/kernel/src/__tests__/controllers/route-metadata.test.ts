// What a registered route publishes: the framework's own `authenticate` and `authorize` stay on the controller's side.
// This test is the guard of that; the `Omit` on `RouteConfigUtility.toHono` accepts a config that still carries them.
import { BaseRestController } from '@/base/controllers';
import type { TRouteContext } from '@/base/controllers';
import { CrudControllerFactory } from '@/base/controllers/factory/controller';
import { controller as controllerDecorator, get, repository } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, Container } from '@/helpers/inversion';
import { OpenApiResponses } from '@/base/models';
import { z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { untyped } from '../support/untyped';
import { StubRepository } from './stub-repository';

const responses = OpenApiResponses.jsonResponse({ schema: z.object({ ok: z.boolean() }) });
const guarded = {
  authenticate: { strategies: ['jwt'] },
  authorize: { action: 'read', resource: 'order' },
};

class OrderController extends BaseRestController {
  constructor() {
    super({ scope: OrderController.name, path: '/orders' });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: { method: 'get', path: '/defined', responses, ...guarded },
      handler: (context) => context.json({ ok: true }),
    });
    this.bindRoute({ configs: { method: 'get', path: '/bound', responses, ...guarded } }).to({
      handler: (context) => context.json({ ok: true }),
    });
    this.defineJSXRoute({
      configs: { method: 'get', path: '/page', responses: {}, ...guarded },
      handler: (context) => context.html('<p></p>'),
    });
  }
}

const itemSchema = z.object({ id: z.string() });

class MetadataItem extends AbstractEntity<typeof itemSchema> {
  constructor() {
    super({ name: MetadataItem.name });
  }

  getSchema<T>(): T {
    return untyped<T>({ item: itemSchema }.item);
  }
}

@repository({ model: MetadataItem, dataSource: 'ProbeDataSource' })
class MetadataRepository extends StubRepository {}

@controllerDecorator({ path: '/items' })
class ItemController extends CrudControllerFactory.build({
  repository: MetadataRepository,
  routes: { count: guarded },
}) {
  @get({ configs: { path: '/decorated', responses, ...guarded } })
  decorated(context: TRouteContext) {
    return context.json({ ok: true });
  }
}

const documentOf = (router: OpenAPIHono) =>
  router.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'routes', version: '1' } });

describe('a registered route', () => {
  test('a CRUD route and a decorator route publish neither member', async () => {
    const container = new Container();
    container
      .bind({
        key: BindingKeys.build<unknown>({
          namespace: BindingNamespaces.REPOSITORY,
          key: MetadataRepository.name,
        }),
      })
      .toValue(new MetadataRepository('x'));
    const router = await container.resolve(ItemController).configure();
    const document = documentOf(router);

    for (const path of ['/count', '/decorated']) {
      const operation = document.paths?.[path]?.get;

      expect(operation).toBeDefined();
      expect(Object.keys(operation ?? {})).not.toContain('authenticate');
      expect(Object.keys(operation ?? {})).not.toContain('authorize');
      expect(operation?.security).toEqual([{ jwt: [] }]);
    }
  });

  test('publishes neither authenticate nor authorize, and keeps its security', async () => {
    const controller = new OrderController();
    const router = await controller.configure();
    const document = documentOf(router);

    for (const path of ['/defined', '/bound', '/page']) {
      const operation = document.paths?.[path]?.get;

      expect(operation).toBeDefined();
      expect(Object.keys(operation ?? {})).not.toContain('authenticate');
      expect(Object.keys(operation ?? {})).not.toContain('authorize');
      expect(operation?.security).toEqual([{ jwt: [] }]);
    }
  });

  test('answers configs without the two members', () => {
    const controller = new OrderController();
    const registered = controller.getRouteConfigs({
      configs: { method: 'get', path: '/direct', responses, ...guarded },
    });
    const page = controller.getJSXRouteConfigs({
      configs: { method: 'get', path: '/direct-page', responses: {}, ...guarded },
    });

    for (const configs of [registered, page]) {
      expect(Object.keys(configs)).not.toContain('authenticate');
      expect(Object.keys(configs)).not.toContain('authorize');
    }
  });
});
