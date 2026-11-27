// What a registered route publishes: the framework's own `authenticate` and `authorize` stay on the controller's side.
import { BaseRestController } from '@/base/controllers';
import { OpenApiResponses } from '@/base/models';
import { z } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

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

describe('a registered route', () => {
  test('publishes neither authenticate nor authorize, and keeps its security', async () => {
    const controller = new OrderController();
    const router = await controller.configure();
    const document = router.getOpenAPI31Document({
      openapi: '3.1.0',
      info: { title: 'orders', version: '1' },
    });

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
