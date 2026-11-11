import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { StaticAssetControllerFactory } from '@/components/static-asset/controller';
import {
  StaticAssetStorageTypes,
  StaticAssetValidation,
  type TMetaLinkConfig,
  type TStaticAssetAuth,
  type TStaticAssetComponentOptions,
  type TStaticAssetRoutes,
} from '@/components/static-asset/common';
import { BaseMetaLinkModel } from '@/components/static-asset/models';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports, MetadataRegistry } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import { buildDirectUploadServices } from './direct-upload-services';
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

const BUCKET_ROUTES_ON: TStaticAssetRoutes = {
  getBuckets: { enabled: true },
  getBucketByName: { enabled: true },
  createBucket: { enabled: true },
  deleteBucket: { enabled: true },
};

const META_LINK: TMetaLinkConfig = {
  model: BaseMetaLinkModel,
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
  auth?: TStaticAssetAuth;
  routes?: TStaticAssetRoutes;
  bucket?: string;
  isDirectUpload?: boolean;
  isMetaLink?: boolean;
}): Promise<OpenAPIHono> => {
  MetadataRegistry.getInstance().clearAll();
  const application = new RouteAuthApplication({ scope: 'RouteAuthApp', config: TEST_CONFIGS });
  application.init();

  const helper = new FakeStorageHelper();
  const controller: TStaticAssetComponentOptions[string]['controller'] = {
    name: 'AuthAssetController',
    basePath: '/assets',
    isStrict: false,
    bucket: opts.bucket,
    routes: opts.routes,
    ...(opts.isDirectUpload
      ? {
          directUpload: {
            authorize: () => true,
            secretKey: 'a-secret-nobody-else-has',
            maxBytes: 1024,
            validation: StaticAssetValidation.define({
              issueSchema: z.object({ message: z.string() }),
              handler: () => ({ isValid: true, issues: [] }),
            }),
          },
        }
      : {}),
  };

  application.controller(
    StaticAssetControllerFactory.build({
      controller,
      storage: StaticAssetStorageTypes.DISK,
      helper: helper as never,
      auth: opts.auth,
      ...(opts.isMetaLink ? { useMetaLink: true, metaLink: META_LINK } : {}),
      ...buildDirectUploadServices({ helper: helper as never, controller }),
    }),
  );
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());

  return server;
};

describe('the bucket-management routes are off by default', () => {
  test('none of the four is registered without an opt-in, even with no bucket configured', async () => {
    const router = await mount({});

    const routes = Object.keys(securityOfRoutes(router));

    expect(routes).not.toContain('GET /assets/buckets');
    expect(routes).not.toContain('GET /assets/buckets/{bucketName}');
    expect(routes).not.toContain('POST /assets/buckets/{bucketName}');
    expect(routes).not.toContain('DELETE /assets/buckets/{bucketName}');
    expect(routes).toContain('POST /assets/buckets/{bucketName}/objects');
  });

  test('each is registered once it is enabled, and only that one', async () => {
    const router = await mount({ routes: { getBuckets: { enabled: true } } });

    const routes = Object.keys(securityOfRoutes(router));

    expect(routes).toContain('GET /assets/buckets');
    expect(routes).not.toContain('GET /assets/buckets/{bucketName}');
    expect(routes).not.toContain('DELETE /assets/buckets/{bucketName}');
  });

  test('all four are present when the application opts in to each', async () => {
    const router = await mount({ routes: BUCKET_ROUTES_ON });

    const routes = Object.keys(securityOfRoutes(router));

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /assets/buckets',
        'GET /assets/buckets/{bucketName}',
        'POST /assets/buckets/{bucketName}',
        'DELETE /assets/buckets/{bucketName}',
      ]),
    );
  });
});

describe('an entry-level auth reaches every built-in route', () => {
  const auth: TStaticAssetAuth = { authenticate: { strategies: ['jwt'] } };

  test('the object, bucket and metalink routes', async () => {
    const router = await mount({ auth, routes: BUCKET_ROUTES_ON, isMetaLink: true });

    const security = securityOfRoutes(router);

    expect(Object.keys(security)).toHaveLength(10);

    for (const [route, declared] of Object.entries(security)) {
      expect({ route, declared }).toEqual({ route, declared: JWT });
    }
  });

  test('the direct-upload routes, validate included', async () => {
    const router = await mount({ auth, bucket: 'uploads', isDirectUpload: true });

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
    const router = await mount({ routes: BUCKET_ROUTES_ON });

    for (const declared of Object.values(securityOfRoutes(router))) {
      expect(declared).toEqual([]);
    }
  });
});

describe('a per-route override replaces the entry auth for that route', () => {
  test('its own strategy wins, and every other route keeps the entry strategy', async () => {
    const router = await mount({
      auth: { authenticate: { strategies: ['jwt'] } },
      routes: { listObjects: { authenticate: { strategies: ['basic'] } } },
    });

    const security = securityOfRoutes(router);

    expect(security['GET /assets/buckets/{bucketName}/objects']).toEqual([{ basic: [] }]);
    expect(security['POST /assets/buckets/{bucketName}/objects']).toEqual(JWT);
  });

  test('skip opens that one route only', async () => {
    const router = await mount({
      auth: { authenticate: { strategies: ['jwt'] } },
      routes: { deleteObject: { authenticate: { skip: true } } },
    });

    const security = securityOfRoutes(router);

    expect(security['DELETE /assets/buckets/{bucketName}/objects/{objectName}']).toEqual([]);
    expect(security['POST /assets/buckets/{bucketName}/objects']).toEqual(JWT);
  });
});

describe('publicRead', () => {
  const auth: TStaticAssetAuth = { authenticate: { strategies: ['jwt'] }, publicRead: true };

  test('opens reading one object and nothing else', async () => {
    const router = await mount({ auth, routes: BUCKET_ROUTES_ON, isMetaLink: true });

    const security = securityOfRoutes(router);

    expect(security['GET /assets/buckets/{bucketName}/objects/{objectName}']).toEqual([]);
    expect(security['GET /assets/buckets/{bucketName}/download/{objectName}']).toEqual([]);

    // Listing a bucket is not reading an object.
    expect(security['GET /assets/buckets/{bucketName}/objects']).toEqual(JWT);
    expect(security['POST /assets/buckets/{bucketName}/objects']).toEqual(JWT);
    expect(security['DELETE /assets/buckets/{bucketName}/objects/{objectName}']).toEqual(JWT);
    expect(security['GET /assets/buckets']).toEqual(JWT);
  });

  test('a route that sets its own auth keeps it', async () => {
    const router = await mount({
      auth,
      routes: { getObjectByName: { authenticate: { strategies: ['basic'] } } },
    });

    const security = securityOfRoutes(router);

    expect(security['GET /assets/buckets/{bucketName}/objects/{objectName}']).toEqual([
      { basic: [] },
    ]);
    expect(security['GET /assets/buckets/{bucketName}/download/{objectName}']).toEqual([]);
  });

  test('is off unless asked for', async () => {
    const router = await mount({ auth: { authenticate: { strategies: ['jwt'] } } });

    const security = securityOfRoutes(router);

    expect(security['GET /assets/buckets/{bucketName}/objects/{objectName}']).toEqual(JWT);
  });
});
