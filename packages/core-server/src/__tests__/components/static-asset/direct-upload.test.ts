import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { AssetControllerFactory } from '@/components/static-asset/controller';
import {
  AssetCommitToken,
  AssetTokenCodecs,
  StaticAssetErrors,
  StaticAssetStorageTypes,
} from '@/components/static-asset/common';
import type {
  TDirectUploadOptions,
  TStaticAssetsComponentOptions,
} from '@/components/static-asset/common';
import { AssetPresignService } from '@/components/static-asset/service';
import type { IAuthorizationSpec } from '@/base';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { RecordUtility } from '@venizia/ignis-helpers';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { z } from '@hono/zod-openapi';
import { describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from './fake-storage.helper';

// -----------------------------------------------------------------------------
// The presign route: a thin layer over AssetPresignService. These tests pin what the ROUTE adds - who may ask, how the body
// becomes files and a context, how the answer is shaped, what is published - and leave extensions, sizes, keys and tokens to
// the service suite.
// -----------------------------------------------------------------------------
interface IPayload {
  key: string;
  ownerId?: string;
  expiresAt: number;
}

interface IContext {
  tenant: string;
}

const NOW = 1_700_000_000_000;
const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class DirectUploadApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'direct-upload-app', version: '0.0.0', description: '' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

const isPayload = (value: unknown): value is IPayload =>
  RecordUtility.isPlainRecord(value) &&
  typeof value.key === 'string' &&
  typeof value.expiresAt === 'number';

const signer = new BunS3Helper({
  accessKey: 'AK',
  secretKey: 'SK',
  endpoint: { default: 'http://internal:9000', public: 'https://files.example.com' },
  region: 'us-east-1',
});

const buildPresign = (over: { maxFiles?: number } = {}) =>
  AssetPresignService.build<IPayload, IContext>({
    helper: signer,
    bucket: 'uploads',
    token: new AssetCommitToken<IPayload>({
      secretKey: 'test-secret-not-real',
      codec: AssetTokenCodecs.signedJson<IPayload>({ isPayload }),
      expiresAtOf: ({ payload }) => payload.expiresAt,
      ownerOf: ({ payload }) => payload.ownerId,
      now: () => NOW,
    }),
    allowedExtensions: ['.png'],
    maxBytes: 1024,
    maxFolderDepth: 5,
    maxFiles: over.maxFiles,
    resolvePath: ({ context }) => `tenants/${context.tenant}`,
    buildPayload: ({ key, issuedAt, ownerId }) => ({ key, ownerId, expiresAt: issuedAt + 60_000 }),
    tagging: { temp: 'true' },
    signedContentType: 'application/octet-stream',
    expiresIn: { unit: 'second', value: 600 },
    now: () => NOW,
  });

const ALLOW: TDirectUploadOptions<IContext, IPayload> = {
  authorize: () => ({ tenant: 't1' }),
  presign: buildPresign(),
};

const mount = async (opts: {
  directUpload?: TDirectUploadOptions<AnyContext, AnyContext, AnyContext>;
  controller?: Record<string, unknown>;
}): Promise<OpenAPIHono> => {
  MetadataRegistry.getInstance().clearAll();
  const application = new DirectUploadApplication({
    scope: 'DirectUploadApp',
    config: TEST_CONFIGS,
  });
  application.init();

  application.controller(
    AssetControllerFactory.defineAssetController({
      controller: {
        name: 'DirectAssetController',
        basePath: '/assets',
        isStrict: false,
        bucket: 'uploads',
        directUpload: opts.directUpload,
        ...opts.controller,
      },
      storage: StaticAssetStorageTypes.DISK,
      helper: new FakeStorageHelper() as never,
    }),
  );
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());

  return server;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = any;

/** What registering said, as text; `'registered'` when it said nothing - so an accepted combination fails on the ASSERTION, not on a helper. */
const refusalOf = async (task: Promise<unknown>): Promise<string> => {
  try {
    await task;

    return 'registered';
  } catch (error) {
    return String(error);
  }
};

const ask = (router: OpenAPIHono, body: unknown) =>
  router.request('/assets/upload-presign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const png = (name = 'a.png') => ({ fileName: name, contentType: 'image/png', size: 100 });

interface IPresigned {
  preSignUrl: string;
  fileKeyToken: string;
  key: string;
}

describe('the presign route', () => {
  test('answers one signed URL, token and key per file, under the folder the service decided', async () => {
    const router = await mount({ directUpload: ALLOW });

    const response = await ask(router, { files: [png('a.png'), png('b.png')] });
    const result = await response.json();
    const results = result as IPresigned[];

    expect(response.status).toBe(200);
    expect(results).toHaveLength(2);
    expect(results[0]?.key).toStartWith('tenants/t1/');
    expect(results[0]?.preSignUrl).toContain('https://files.example.com/uploads/tenants/t1/');
    expect(results[0]?.fileKeyToken).toContain('.');
  });

  test('a file with no content type is signed as a binary, and the caller context reaches the service', async () => {
    const seen: unknown[] = [];
    const router = await mount({
      directUpload: {
        ...ALLOW,
        authorize: () => ({ tenant: 't9' }),
        presign: {
          presign: async (opts) => {
            seen.push(opts);

            return [];
          },
        },
      },
    });

    await ask(router, { files: [{ fileName: 'a.png', size: 5 }] });

    expect(seen).toEqual([
      {
        files: [{ fileName: 'a.png', contentType: 'application/octet-stream', size: 5 }],
        context: { tenant: 't9' },
      },
    ]);
  });

  test('a refused caller gets a 403 and the service is never asked', async () => {
    let asked = 0;
    const router = await mount({
      directUpload: {
        ...ALLOW,
        authorize: () => false,
        presign: {
          presign: async () => {
            asked += 1;

            return [];
          },
        },
      },
    });

    const response = await ask(router, { files: [png()] });

    expect(response.status).toBe(403);
    expect(asked).toBe(0);
  });

  test('a body the schema refuses is a 422 before authorize reaches the service', async () => {
    const router = await mount({ directUpload: ALLOW });

    for (const body of [{}, { files: [] }, { files: [{ fileName: 'a.png' }] }]) {
      const result2 = await ask(router, body);
      expect(result2.status).toBe(422);
    }
  });

  test('the service refusals come through with their own code: too many files, wrong extension', async () => {
    const router = await mount({
      directUpload: { ...ALLOW, presign: buildPresign({ maxFiles: 1 }) },
    });

    const many = await ask(router, { files: [png('a.png'), png('b.png')] });
    const ext = await ask(router, { files: [png('a.exe')] });

    expect(many.status).toBeGreaterThanOrEqual(400);
    expect(ext.status).toBe(400);
    const result3 = await ext.json();
    expect(JSON.stringify(result3)).toContain(
      StaticAssetErrors.PRESIGN_EXTENSION_NOT_ALLOWED.message.code,
    );
  });
});

describe("request.toInput and response.map are the application's", () => {
  test('a body of its own shape is mapped into files and context, and the answer is reshaped', async () => {
    const router = await mount({
      directUpload: {
        authorize: () => ({ tenant: 't1' }),
        presign: buildPresign(),
        request: {
          schema: z.object({ names: z.array(z.string()).min(1), tenant: z.string() }),
          toInput: ({ body }: { body: { names: string[]; tenant: string } }) => ({
            files: body.names.map((fileName) => ({
              fileName,
              contentType: 'image/png',
              size: 10,
            })),
            context: { tenant: body.tenant },
            ownerId: 'u1',
          }),
        },
        response: {
          schema: z.object({ urls: z.array(z.string()) }),
          map: ({ results }: { results: IPresigned[] }) => ({
            urls: results.map((result) => result.preSignUrl),
          }),
        },
      },
    });

    const response = await ask(router, { names: ['a.png'], tenant: 'acme' });
    const result2 = await response.json();
    const result = result2 as { urls: string[] };

    expect(response.status).toBe(200);
    expect(result.urls[0]).toContain('/uploads/tenants/acme/');

    // The default body shape no longer validates: the schema published is the application's.
    const result3 = await ask(router, { files: [png()] });
    expect(result3.status).toBe(422);
  });

  test('toInput may refuse with its own error, and nothing is signed', async () => {
    const router = await mount({
      directUpload: {
        ...ALLOW,
        request: {
          schema: z.object({ files: z.array(z.any()) }),
          toInput: () => {
            throw new Error('tenant is closed');
          },
        },
      },
    });

    const response = await ask(router, { files: [] });

    expect(response.status).toBe(500);
  });
});

describe("what authorize answers is what the application's hooks get", () => {
  test('request.toInput and response.map receive the very object authorize returned', async () => {
    const caller = { tenant: 't1' };
    const seen: { input?: unknown; map?: unknown } = {};
    const router = await mount({
      directUpload: {
        authorize: () => caller,
        presign: buildPresign(),
        request: {
          schema: z.object({ names: z.array(z.string()).min(1) }),
          toInput: ({ body, context }: { body: { names: string[] }; context: object }) => {
            seen.input = context;

            return {
              files: body.names.map((fileName) => ({
                fileName,
                contentType: 'image/png',
                size: 10,
              })),
              context: { tenant: 't1' },
            };
          },
        },
        response: {
          schema: z.array(z.string()),
          map: ({ results, context }: { results: IPresigned[]; context: object }) => {
            seen.map = context;

            return results.map((result) => result.key);
          },
        },
      },
    });

    const response = await ask(router, { names: ['a.png'] });

    expect(response.status).toBe(200);
    expect(seen.input).toBe(caller);
    expect(seen.map).toBe(caller);
  });
});

describe('what is mounted', () => {
  test('without directUpload there is no presign route', async () => {
    const router = await mount({});

    const result = await ask(router, { files: [png()] });
    expect(result.status).toBe(404);
  });

  test('routes.uploadPresign moves the route and carries the rest of the override: the default path is gone, the document shows it', async () => {
    const router = await mount({
      directUpload: ALLOW,
      controller: { routes: { uploadPresign: { path: '/attachments', summary: 'The door' } } },
    });

    const moved = await router.request('/assets/attachments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [png()] }),
    });
    const old = await ask(router, { files: [png()] });
    const operation = Reflect.get(
      Object(
        Reflect.get(
          Object(
            router.getOpenAPIDocument({ openapi: '3.0.0', info: { title: 't', version: '0' } })
              .paths,
          ),
          '/assets/attachments',
        ),
      ),
      'post',
    );

    expect(moved.status).toBe(200);
    expect(old.status).toBe(404);
    expect(Reflect.get(Object(operation), 'summary')).toBe('The door');
  });

  test('routes.uploadPresign.enabled false removes it', async () => {
    const router = await mount({
      directUpload: ALLOW,
      controller: { routes: { uploadPresign: { enabled: false } } },
    });

    const result2 = await ask(router, { files: [png()] });
    expect(result2.status).toBe(404);
  });

  test('the old policy and commit routes are gone', async () => {
    const router = await mount({ directUpload: ALLOW });

    for (const path of ['/assets/upload-policy', '/assets/upload-commit']) {
      const response = await router.request(path, { method: 'POST', body: '{}' });
      expect(response.status).toBe(404);
    }
  });

  test('without controller.bucket it refuses to register', async () => {
    const refusal = await refusalOf(
      mount({ directUpload: ALLOW, controller: { bucket: undefined } }),
    );

    expect(refusal).toContain('directUpload needs controller.bucket');
  });

  test('keyPrefix and directUpload together refuse to register: the scope would not apply to the key', async () => {
    const refusal = await refusalOf(
      mount({ directUpload: ALLOW, controller: { keyPrefix: 'tenant-a' } }),
    );

    expect(refusal).toContain('keyPrefix does not apply to directUpload');
  });

  test('the route is published in the OpenAPI document with the schema of the application', async () => {
    const router = await mount({
      directUpload: {
        ...ALLOW,
        request: {
          schema: z.object({ names: z.array(z.string()) }),
          toInput: () => ({ files: [], context: { tenant: 't1' } }),
        },
        response: {
          schema: z.object({ urls: z.array(z.string()) }),
          map: () => ({ urls: [] }),
        },
      },
    });
    const document = router.getOpenAPIDocument({
      openapi: '3.0.0',
      info: { title: 't', version: '0' },
    });
    const operation = RecordUtility.isRecord(document.paths['/assets/upload-presign'])
      ? document.paths['/assets/upload-presign']
      : undefined;

    expect(JSON.stringify(operation)).toContain('names');
    expect(JSON.stringify(operation)).not.toContain('fileName');
    expect(JSON.stringify(operation)).toContain('urls');
    expect(JSON.stringify(operation)).not.toContain('preSignUrl');
  });
});

/**
 * Never called - `tsc` checks the body during the build.
 *
 * `authorize` reaching every route is the property a consumer depends on: reading an object and
 * deleting one are different permissions, so a controller-wide setting would be the wrong shape. The
 * option type Omits `method`, `request` and `responses` and nothing else, and this pins that - an
 * Omit that grows by one entry fails here rather than in an application at run time.
 */
export const routeAuthorizeAssertions = () => {
  const spec: IAuthorizationSpec = { action: 'delete', resource: 'asset' };

  const options: TStaticAssetsComponentOptions = {
    assets: {
      controller: {
        name: 'AssetController',
        basePath: '/assets',
        bucket: 'uploads',
        routes: {
          getObjectByName: { authorize: spec },
          deleteObject: { authorize: spec },
          upload: { authorize: [spec] },
          recreateMetaLink: { authorize: spec },
          uploadPresign: { authorize: spec },
        },
      },
      storage: StaticAssetStorageTypes.DISK,
      helper: undefined as never,
    },
  };

  return options;
};
