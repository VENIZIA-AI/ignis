import 'reflect-metadata';
import { describe, test, expect, beforeEach } from 'bun:test';
import { BaseApplication } from '@/base/applications';
import { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { BaseComponent } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { BaseRestController, TRouteContext } from '@/base/controllers';
import { controller } from '@/base/metadata';
import { jsonContent, jsonResponse } from '@venizia/ignis-kernel';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP, ValueOrPromise } from '@venizia/ignis-helpers/common';

// === Test Controllers ========================================================

const UsersRouteConfigs = {
  LIST: {
    method: HTTP.Methods.GET,
    path: '/',
    responses: jsonResponse({
      schema: z.object({ users: z.array(z.string()) }),
      description: 'List users',
    }),
  },
};

@controller({ path: '/users' })
class UsersController extends BaseRestController {
  constructor() {
    super({ scope: UsersController.name, path: '/users' });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({ configs: UsersRouteConfigs.LIST }).to({
      handler: (context: TRouteContext) => {
        return context.json({ users: ['alice', 'bob'] }, 200);
      },
    });
  }
}

@controller({ path: '/orders' })
class OrdersController extends BaseRestController {
  constructor() {
    super({ scope: OrdersController.name, path: '/orders' });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({
      configs: {
        method: HTTP.Methods.GET,
        path: '/',
        responses: jsonResponse({
          schema: z.object({ orders: z.array(z.string()) }),
          description: 'List orders',
        }),
      },
    }).to({
      handler: (context: TRouteContext) => {
        return context.json({ orders: ['order-1', 'order-2'] }, 200);
      },
    });
  }
}

@controller({ path: '/products' })
class ProductsController extends BaseRestController {
  constructor() {
    super({ scope: ProductsController.name, path: '/products' });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({
      configs: {
        method: HTTP.Methods.GET,
        path: '/',
        responses: jsonResponse({
          schema: z.object({ products: z.array(z.string()) }),
          description: 'List products',
        }),
      },
    }).to({
      handler: (context: TRouteContext) => {
        return context.json({ products: ['widget', 'gadget'] }, 200);
      },
    });

    this.defineRoute({
      configs: {
        method: HTTP.Methods.POST,
        path: '/',
        request: {
          body: jsonContent({
            description: 'Create product',
            schema: z.object({ name: z.string() }),
          }),
        },
        responses: jsonResponse({
          schema: z.object({ id: z.string(), name: z.string() }),
          description: 'Created product',
        }),
      },
      handler: (context: TRouteContext) => {
        const { name } = context.req.valid<{ name: string }>('json');
        return context.json({ id: 'p-1', name }, 201);
      },
    });
  }
}

@controller({ path: '/invoices' })
class InvoicesController extends BaseRestController {
  constructor() {
    super({ scope: InvoicesController.name, path: '/invoices' });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({
      configs: {
        method: HTTP.Methods.GET,
        path: '/',
        responses: jsonResponse({
          schema: z.object({ invoices: z.array(z.string()) }),
          description: 'List invoices',
        }),
      },
    }).to({
      handler: (context: TRouteContext) => {
        return context.json({ invoices: ['inv-001'] }, 200);
      },
    });
  }
}

@controller({ path: '/status' })
class StatusController extends BaseRestController {
  constructor() {
    super({ scope: StatusController.name, path: '/status' });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({
      configs: {
        method: HTTP.Methods.GET,
        path: '/',
        responses: jsonResponse({
          schema: z.object({ status: z.string() }),
          description: 'App status',
        }),
      },
    }).to({
      handler: (context: TRouteContext) => {
        return context.json({ status: 'running' }, 200);
      },
    });
  }
}

// === Test Components - manually constructed (RestComponent/GrpcComponent pattern) ===

/** ComponentA registers UsersController and OrdersController, constructed manually like RestComponent/GrpcComponent rather than via DI. */
class ComponentA extends BaseComponent {
  constructor(private application: BaseApplication) {
    super({ scope: ComponentA.name });
  }

  override binding(): ValueOrPromise<void> {
    this.application.controller(UsersController);
    this.application.controller(OrdersController);
  }
}

/** ComponentB registers ProductsController and InvoicesController. */
class ComponentB extends BaseComponent {
  constructor(private application: BaseApplication) {
    super({ scope: ComponentB.name });
  }

  override binding(): ValueOrPromise<void> {
    this.application.controller(ProductsController);
    this.application.controller(InvoicesController);
  }
}

// === Test Application ========================================================

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class TestApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'test-app', version: '0.0.0', description: 'Integration test app' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

// === Tests ===================================================================

describe('Component → Controller binding integration', () => {
  let app: TestApplication;

  beforeEach(() => {
    MetadataRegistry.getInstance().clearAll();
    app = new TestApplication({ scope: 'TestApp', config: TEST_CONFIGS });
    app.init();
  });

  /** Simulates registerComponents() + registerControllers() without DI resolution - components are constructed manually. */
  async function configureComponentsAndControllers(
    application: BaseApplication,
    components: BaseComponent[],
  ) {
    for (const component of components) {
      await component.configure();
    }
    await application['registerControllers']();
  }

  // --- Scenario 1: Two components each register their own controllers --------
  describe('nested component binding — ComponentA + ComponentB', () => {
    test('should discover and bind all controllers from both components', async () => {
      const componentA = new ComponentA(app);
      const componentB = new ComponentB(app);

      await configureComponentsAndControllers(app, [componentA, componentB]);

      const rootRouter = app.getRootRouter();

      // ComponentA controllers
      const usersRes = await rootRouter.request('/users');
      expect(usersRes.status).toBe(200);
      const usersBody = (await usersRes.json()) as { users: string[] };
      expect(usersBody.users).toEqual(['alice', 'bob']);

      const ordersRes = await rootRouter.request('/orders');
      expect(ordersRes.status).toBe(200);
      const ordersBody = (await ordersRes.json()) as { orders: string[] };
      expect(ordersBody.orders).toEqual(['order-1', 'order-2']);

      // ComponentB controllers
      const productsRes = await rootRouter.request('/products');
      expect(productsRes.status).toBe(200);
      const productsBody = (await productsRes.json()) as { products: string[] };
      expect(productsBody.products).toEqual(['widget', 'gadget']);

      const invoicesRes = await rootRouter.request('/invoices');
      expect(invoicesRes.status).toBe(200);
      const invoicesBody = (await invoicesRes.json()) as { invoices: string[] };
      expect(invoicesBody.invoices).toEqual(['inv-001']);
    });

    test('POST route from component-registered controller should work', async () => {
      const componentB = new ComponentB(app);
      await configureComponentsAndControllers(app, [componentB]);

      const rootRouter = app.getRootRouter();

      const res = await rootRouter.request('/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'new-product' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { name: string; id: string };
      expect(body.name).toBe('new-product');
      expect(body.id).toBe('p-1');
    });
  });

  // --- Scenario 2: Mix of component-registered + directly-registered controllers ---
  describe('mixed registration — component + direct', () => {
    test('should bind controllers from components and direct registration', async () => {
      const componentA = new ComponentA(app);
      app.controller(StatusController);

      await configureComponentsAndControllers(app, [componentA]);

      const rootRouter = app.getRootRouter();

      // From ComponentA
      const usersRes = await rootRouter.request('/users');
      expect(usersRes.status).toBe(200);

      const ordersRes = await rootRouter.request('/orders');
      expect(ordersRes.status).toBe(200);

      // Directly registered
      const statusRes = await rootRouter.request('/status');
      expect(statusRes.status).toBe(200);
      const statusBody = (await statusRes.json()) as { status: string };
      expect(statusBody.status).toBe('running');
    });

    test('all three sources together — 2 components + direct controller', async () => {
      const componentA = new ComponentA(app);
      const componentB = new ComponentB(app);
      app.controller(StatusController);

      await configureComponentsAndControllers(app, [componentA, componentB]);

      const rootRouter = app.getRootRouter();

      // All 5 controllers should be reachable
      const paths = ['/users', '/orders', '/products', '/invoices', '/status'];
      for (const path of paths) {
        const res = await rootRouter.request(path);
        expect(res.status).toBe(200);
      }
    });
  });

  // --- Scenario 3: Controller binding() is called during registerControllers ---
  describe('controller configuration lifecycle', () => {
    test('controller binding() should be called during registerControllers, not during component binding', async () => {
      let isBindingCalled = false;

      @controller({ path: '/tracked' })
      class TrackedController extends BaseRestController {
        constructor() {
          super({ scope: TrackedController.name, path: '/tracked' });
        }

        override binding(): ValueOrPromise<void> {
          isBindingCalled = true;
          this.bindRoute({
            configs: {
              method: HTTP.Methods.GET,
              path: '/',
              responses: jsonResponse({
                schema: z.object({ tracked: z.boolean() }),
                description: 'Tracked',
              }),
            },
          }).to({
            handler: (context: TRouteContext) => context.json({ tracked: true }, 200),
          });
        }
      }

      class TrackingComponent extends BaseComponent {
        constructor(private application: BaseApplication) {
          super({ scope: TrackingComponent.name });
        }
        override binding(): ValueOrPromise<void> {
          this.application.controller(TrackedController);
        }
      }

      const component = new TrackingComponent(app);
      await component.configure();

      // Controller binding not called yet — only registered in DI container
      expect(isBindingCalled).toBe(false);

      await app['registerControllers']();

      // NOW controller binding() was called by RestComponent
      expect(isBindingCalled).toBe(true);

      const rootRouter = app.getRootRouter();
      const res = await rootRouter.request('/tracked');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { tracked: boolean };
      expect(body.tracked).toBe(true);
    });
  });

  // --- Scenario 4: Dynamic binding - controllers added by components are found ---
  describe('dynamic binding loop', () => {
    test('controllers added during component configure should be discovered by RestComponent', async () => {
      const componentA = new ComponentA(app);
      await configureComponentsAndControllers(app, [componentA]);

      const rootRouter = app.getRootRouter();

      const usersRes = await rootRouter.request('/users');
      expect(usersRes.status).toBe(200);

      const ordersRes = await rootRouter.request('/orders');
      expect(ordersRes.status).toBe(200);
    });
  });

  // --- Scenario 5: Transport filtering - gRPC controllers skipped by RestComponent ---
  describe('transport-aware filtering', () => {
    test('RestComponent should skip controllers with gRPC transport', async () => {
      @controller({ path: '/grpc-service', transport: ControllerTransports.GRPC, service: {} })
      class GrpcOnlyController extends BaseRestController {
        constructor() {
          super({ scope: GrpcOnlyController.name, path: '/grpc-service' });
        }
        override binding(): ValueOrPromise<void> {}
      }

      app.controller(UsersController); // REST
      app.controller(GrpcOnlyController); // gRPC — should be skipped by RestComponent

      await app['registerControllers']();

      const rootRouter = app.getRootRouter();

      // REST controller should work
      const usersRes = await rootRouter.request('/users');
      expect(usersRes.status).toBe(200);

      // gRPC controller path should NOT be mounted by REST
      const grpcRes = await rootRouter.request('/grpc-service');
      expect(grpcRes.status).toBe(404);
    });
  });

  // --- Scenario 6: Controller isolation - routes from different controllers do not conflict ---
  describe('controller isolation', () => {
    test('routes from different controllers should not conflict', async () => {
      // Both have GET / but on different mount paths
      app.controller(UsersController);
      app.controller(OrdersController);

      await app['registerControllers']();

      const rootRouter = app.getRootRouter();

      const usersRes = await rootRouter.request('/users');
      const usersBody = await usersRes.json();
      expect(usersBody).toHaveProperty('users');
      expect(usersBody).not.toHaveProperty('orders');

      const ordersRes = await rootRouter.request('/orders');
      const ordersBody = await ordersRes.json();
      expect(ordersBody).toHaveProperty('orders');
      expect(ordersBody).not.toHaveProperty('users');
    });
  });

  // --- Scenario 7: Multiple controllers with multiple HTTP methods -----------
  describe('multiple HTTP methods', () => {
    test('GET and POST on same controller both work', async () => {
      const componentB = new ComponentB(app);
      await configureComponentsAndControllers(app, [componentB]);

      const rootRouter = app.getRootRouter();

      // GET /products
      const getRes = await rootRouter.request('/products');
      expect(getRes.status).toBe(200);
      const getBody = (await getRes.json()) as { products: string[] };
      expect(getBody.products).toEqual(['widget', 'gadget']);

      // POST /products
      const postRes = await rootRouter.request('/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'gizmo' }),
      });
      expect(postRes.status).toBe(201);
      const postBody = (await postRes.json()) as { name: string };
      expect(postBody.name).toBe('gizmo');
    });
  });

  // --- Scenario 8: Component ordering does not affect route binding ----------
  describe('component ordering', () => {
    test('order of component configuration should not affect route availability', async () => {
      // Configure B first, then A
      const componentB = new ComponentB(app);
      const componentA = new ComponentA(app);

      await configureComponentsAndControllers(app, [componentB, componentA]);

      const rootRouter = app.getRootRouter();

      // All 4 controllers should work regardless of order
      const usersRes = await rootRouter.request('/users');
      expect(usersRes.status).toBe(200);

      const productsRes = await rootRouter.request('/products');
      expect(productsRes.status).toBe(200);

      const ordersRes = await rootRouter.request('/orders');
      expect(ordersRes.status).toBe(200);

      const invoicesRes = await rootRouter.request('/invoices');
      expect(invoicesRes.status).toBe(200);
    });
  });
});
