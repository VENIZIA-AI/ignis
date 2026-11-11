import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { StaticAssetControllerFactory } from '@/components/static-asset/controller';
import {
  StaticAssetValidation,
  type TMetaLinkConfig,
  type TStaticAssetAuth,
  type TStaticAssetEntry,
  type TStaticAssetRoutes,
} from '@/components/static-asset/common';
import type { IAuthorizationSpec, IAuthorizeOptions } from '@venizia/ignis-kernel';
import {
  Authentication,
  AuthorizationEnforcerTypes,
  AuthorizeBindingKeys,
  Container,
} from '@venizia/ignis-kernel';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports, MetadataRegistry } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import { buildDirectUploadServices } from './direct-upload-services';
import { createFreshRegistry, TestAuthorizationEnforcer } from '../../authorize/helpers';
import { FakeStorageHelper } from './fake-storage.helper';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class RouteAuthApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'route-auth-app', version: '0.0.0', description: '' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

const META_LINK: TMetaLinkConfig = {
  repository: {} as never,
};

type TOperationSecurity = Array<Record<string, string[]>>;

/** `METHOD path` to the security the route declares: a strategy per entry, none for an open route. */
const securityOfRoutes = (router: OpenAPIHono): Record<string, TOperationSecurity> => {
  const document = router.getOpenAPIDocument({
    openapi: '3.1.0',
    info: { title: 'assets', version: '1.0.0' },
  });
  const result: Record<string, TOperationSecurity> = {};

  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'delete'] as const) {
      const operation = item[method];

      if (operation) {
        result[`${method.toUpperCase()} ${path}`] = operation.security ?? [];
      }
    }
  }

  return result;
};

const JWT: TOperationSecurity = [{ jwt: [] }];

const mount = async (opts: {
  onServer?: (server: OpenAPIHono) => void;
  auth?: TStaticAssetAuth;
  routes?: TStaticAssetRoutes;
  bucket?: string;
  isDirectUpload?: boolean;
  isMetaLink?: boolean;
  isServerUpload?: boolean;
}): Promise<OpenAPIHono> => {
  const { bucket = 'uploads', isServerUpload = true } = opts;

  MetadataRegistry.getInstance().clearAll();
  const application = new RouteAuthApplication({ scope: 'RouteAuthApp', config: TEST_CONFIGS });
  application.init();

  const helper = new FakeStorageHelper();
  const validation = StaticAssetValidation.define({
    issueSchema: z.object({ message: z.string() }),
    handler: () => ({ isValid: true, issues: [] }),
  });
  const base = {
    basePath: '/assets',
    bucket,
    auth: opts.auth,
    routes: opts.routes,
    serverUpload: isServerUpload ? { use: true as const } : { use: false as const },
    metaLink: opts.isMetaLink ? { use: true as const, ...META_LINK } : { use: false as const },
    helper: helper as never,
  };
  // Direct upload needs a scope of its own, so the entry that takes it carries a keyPrefix.
  const entry: TStaticAssetEntry = opts.isDirectUpload
    ? {
        ...base,
        keyPrefix: 'uploads/',
        directUpload: {
          use: true,
          secretKey: 'a-secret-nobody-else-has',
          maxBytes: 1024,
          validation,
        },
      }
    : { ...base, directUpload: { use: false } };

  application.controller(
    StaticAssetControllerFactory.build({
      key: 'authed',
      entry,
      ...buildDirectUploadServices({ key: 'authed', entry }),
    }),
  );
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  opts.onServer?.(server);
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());

  return server;
};

describe('serverUpload off and a route off', () => {
  test('the Excel-import setup: no upload route, no commit route, the rest stays', async () => {
    const router = await mount({
      isDirectUpload: true,
      auth: { authenticate: { strategies: ['jwt'] } },
      isServerUpload: false,
      routes: { uploadCommit: { use: false } },
    });

    const routes = Object.keys(securityOfRoutes(router));

    expect(routes).not.toContain('POST /assets/objects');
    expect(routes).not.toContain('POST /assets/upload-commit');
    expect(routes).toEqual(
      expect.arrayContaining([
        'POST /assets/upload-policy',
        'POST /assets/upload-validate',
        'GET /assets/objects/{objectName}',
      ]),
    );
  });
});

describe('an entry-level auth reaches every built-in route', () => {
  const auth: TStaticAssetAuth = { authenticate: { strategies: ['jwt'] } };

  test('the object and metalink routes', async () => {
    const router = await mount({ auth, isMetaLink: true });

    const security = securityOfRoutes(router);

    expect(Object.keys(security)).toHaveLength(6);

    for (const [route, declared] of Object.entries(security)) {
      expect({ route, declared }).toEqual({ route, declared: JWT });
    }
  });

  test('the direct-upload routes, validate included', async () => {
    const router = await mount({ auth, isDirectUpload: true });

    const security = securityOfRoutes(router);

    expect(Object.keys(security)).toEqual(
      expect.arrayContaining([
        'POST /assets/upload-policy',
        'POST /assets/upload-commit',
        'POST /assets/upload-validate',
      ]),
    );

    for (const [route, declared] of Object.entries(security)) {
      expect({ route, declared }).toEqual({ route, declared: JWT });
    }
  });

  test('without auth the routes stay as open as before', async () => {
    const router = await mount({});

    for (const declared of Object.values(securityOfRoutes(router))) {
      expect(declared).toEqual([]);
    }
  });
});

describe('a per-route override replaces the entry auth for that route', () => {
  test('its own strategy wins, and every other route keeps the entry strategy', async () => {
    const router = await mount({
      auth: { authenticate: { strategies: ['jwt'] } },
      routes: { listObjects: { use: true, authenticate: { strategies: ['basic'] } } },
    });

    const security = securityOfRoutes(router);

    expect(security['GET /assets/objects']).toEqual([{ basic: [] }]);
    expect(security['POST /assets/objects']).toEqual(JWT);
  });

  test('skip opens that one route only', async () => {
    const router = await mount({
      auth: { authenticate: { strategies: ['jwt'] } },
      routes: { deleteObject: { use: true, authenticate: { skip: true } } },
    });

    const security = securityOfRoutes(router);

    expect(security['DELETE /assets/objects/{objectName}']).toEqual([]);
    expect(security['POST /assets/objects']).toEqual(JWT);
  });
});

describe('publicRead', () => {
  const auth: TStaticAssetAuth = {
    authenticate: { strategies: ['jwt'] },
    publicRead: { use: true },
  };

  test('opens reading one object and nothing else', async () => {
    const router = await mount({ auth, isMetaLink: true });

    const security = securityOfRoutes(router);

    expect(security['GET /assets/objects/{objectName}']).toEqual([]);
    expect(security['GET /assets/download/{objectName}']).toEqual([]);

    // Listing a bucket is not reading an object.
    expect(security['GET /assets/objects']).toEqual(JWT);
    expect(security['POST /assets/objects']).toEqual(JWT);
    expect(security['DELETE /assets/objects/{objectName}']).toEqual(JWT);
  });

  test('a route that sets its own auth keeps it', async () => {
    const router = await mount({
      auth,
      routes: { getObjectByName: { use: true, authenticate: { strategies: ['basic'] } } },
    });

    const security = securityOfRoutes(router);

    expect(security['GET /assets/objects/{objectName}']).toEqual([{ basic: [] }]);
    expect(security['GET /assets/download/{objectName}']).toEqual([]);
  });

  test('is off unless asked for', async () => {
    const router = await mount({ auth: { authenticate: { strategies: ['jwt'] } } });

    const security = securityOfRoutes(router);

    expect(security['GET /assets/objects/{objectName}']).toEqual(JWT);
  });
});

describe('an entry-level auth.authorize runs through a real authorization enforcer', () => {
  const READ: IAuthorizationSpec = { action: 'read', resource: 'asset' };
  const DELETE: IAuthorizationSpec = { action: 'delete', resource: 'asset' };

  /** The signed-in user is whoever `x-user` names: what the authentication step would have put on the context. */
  const mountAuthorized = async (opts: { routes?: TStaticAssetRoutes }) => {
    const registry = createFreshRegistry();
    const container = new Container({ scope: 'route-auth-test' });
    container
      .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
      .toValue({ defaultDecision: 'deny' });
    registry.register({
      container,
      enforcers: [
        {
          enforcer: TestAuthorizationEnforcer,
          name: 'test',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });
    // Reads are granted; nothing grants a delete.
    TestAuthorizationEnforcer.rules = [{ action: 'read', resource: 'asset', effect: 'allow' }];

    return mount({
      auth: { authorize: READ },
      routes: opts.routes,
      onServer: (server) => {
        server.use('*', async (context, next) => {
          const userId = context.req.header('x-user');

          if (userId) {
            context.set(Authentication.CURRENT_USER, { userId, principalType: 'user' });
          }

          await next();
        });
      },
    });
  };

  test('a granted spec reaches the handler, a spec nothing grants is a 403, and no user is a 401', async () => {
    const router = await mountAuthorized({
      routes: { deleteObject: { use: true, authorize: DELETE } },
    });

    const granted = await router.request('/assets/objects/photo.jpg', {
      headers: { 'x-user': '7' },
    });
    const denied = await router.request('/assets/objects/photo.jpg', {
      method: 'DELETE',
      headers: { 'x-user': '7' },
    });
    const anonymous = await router.request('/assets/objects/photo.jpg');

    // The object does not exist, so a granted request reaches the handler and answers 404.
    expect(granted.status).toBe(404);
    expect(denied.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  test('the entry spec covers a route that sets nothing, and skip opens one route', async () => {
    const router = await mountAuthorized({
      routes: { getObjectByName: { use: true, authorize: { skip: true } } },
    });

    const skipped = await router.request('/assets/objects/photo.jpg');
    const covered = await router.request('/assets/objects', { headers: {} });

    expect(skipped.status).toBe(404);
    expect(covered.status).toBe(401);
  });
});
