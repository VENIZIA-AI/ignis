import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { AssetControllerFactory } from '@/components/static-asset/controller';
import {
  buildCommitToken,
  META_LINK_CREATE_FAILED,
  StaticAssetStorageTypes,
} from '@/components/static-asset/common';
import { BaseMetaLinkModel } from '@/components/static-asset/models';
import type {
  TDirectUploadOptions,
  TMetaLinkConfig,
  TStaticAssetsComponentOptions,
} from '@/components/static-asset/common';
import type { IAuthorizationSpec } from '@/base';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from './fake-storage.helper';

const SECRET = 'a-secret-nobody-else-has';
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

const mount = async (opts: {
  helper: FakeStorageHelper;
  directUpload: TDirectUploadOptions;
  metaLink?: TMetaLinkConfig;
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
      },
      storage: StaticAssetStorageTypes.DISK,
      helper: opts.helper as never,
      useMetaLink: opts.metaLink !== undefined,
      metaLink: opts.metaLink,
    }),
  );
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());
  return server;
};

const ALLOW: TDirectUploadOptions = { authorize: () => true, secretKey: SECRET, maxBytes: 1024 };

const askPolicy = (router: OpenAPIHono, files: unknown[]) =>
  router.request('/assets/upload-policy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files }),
  });

const commit = (router: OpenAPIHono, commitToken: string, labels: Record<string, unknown> = {}) =>
  router.request('/assets/upload-commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // The labels sit beside the token in the body, not in the URL.
    body: JSON.stringify({ commitToken, ...labels }),
  });

describe('the upload-policy route', () => {
  test('it hands back one policy per file, each with the token its commit is claimed with', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, directUpload: ALLOW });

    const response = await askPolicy(router, [{ fileName: 'a.png' }, { fileName: 'b.png' }]);
    const policies = (await response.json()) as Array<{ objectName: string; commitToken: string }>;

    expect(response.status).toBe(200);
    expect(policies).toHaveLength(2);
    expect(policies[0].commitToken).toContain('.');
    expect(policies[0].objectName).toStartWith('pending/');
  });

  /** The key is generated, never taken from the caller - a key the caller picks is a key it can collide with. */
  test('the policy only ever authorizes the pending prefix', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, directUpload: ALLOW });

    await askPolicy(router, [{ fileName: 'a.png' }]);

    expect(helper.calls.filter(call => call.method === 'presignPost')).toEqual([
      { method: 'presignPost', args: { bucket: 'uploads', keyPrefix: 'pending/', maxBytes: 1024 } },
    ]);
  });

  test('a refused caller gets nothing, and the storage is never asked', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, authorize: () => false },
    });

    const response = await askPolicy(router, [{ fileName: 'a.png' }]);

    expect(response.status).toBe(403);
    expect(helper.calls).toHaveLength(0);
  });

  test('a file over the ceiling is refused before a policy is signed', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, directUpload: ALLOW });

    const response = await askPolicy(router, [{ fileName: 'big.bin', size: 1025 }]);

    // 413, the same code and status the ordinary upload answers - one condition, one branch.
    expect(response.status).toBe(413);
    expect(helper.calls).toHaveLength(0);
  });
});

describe('the upload-commit route', () => {
  test('it copies out of the pending prefix and removes the temporary object', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, directUpload: ALLOW });

    const policies = (await (await askPolicy(router, [{ fileName: 'a.png' }])).json()) as Array<{
      objectName: string;
      commitToken: string;
    }>;
    helper.calls.length = 0;

    helper.seedObject({ bucket: 'uploads', key: policies[0].objectName });
    const response = await commit(router, policies[0].commitToken);

    expect(response.status).toBe(200);
    const copy = helper.calls.find(call => call.method === 'copyObject');
    expect(copy?.args).toMatchObject({
      bucket: 'uploads',
      source: policies[0].objectName,
      destination: policies[0].objectName.slice('pending/'.length),
    });
    expect(helper.calls.find(call => call.method === 'removeObject')?.args).toMatchObject({
      name: policies[0].objectName,
    });
  });

  /** A forged token must fail BEFORE any storage call, or the route becomes a name prober. */
  test('a forged token is refused without a single storage call', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, directUpload: ALLOW });
    const forged = buildCommitToken({
      payload: { bucket: 'uploads', key: 'pending/x/a.png', expiresAt: Date.now() + 60_000 },
      secretKey: 'not-the-secret',
    });
    helper.calls.length = 0;

    const response = await commit(router, forged);

    expect(response.status).toBe(400);
    expect(helper.calls).toHaveLength(0);
  });

  /** onCommit runs BEFORE the copy, so a throwing hook leaves the object under the pending prefix. */
  test('a hook that throws leaves nothing at the final key', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({
      helper,
      directUpload: {
        ...ALLOW,
        onCommit: () => {
          throw new Error('hook refused');
        },
      },
    });

    const policies = (await (await askPolicy(router, [{ fileName: 'a.png' }])).json()) as Array<{
      commitToken: string;
    }>;
    helper.calls.length = 0;

    const response = await commit(router, policies[0].commitToken);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(helper.calls.filter(call => call.method === 'copyObject')).toHaveLength(0);
    expect(helper.calls.filter(call => call.method === 'removeObject')).toHaveLength(0);
  });
});

describe('a direct upload lands a MetaLink row, like every other upload', () => {
  /**
   * Without this the two upload paths disagree: the ordinary one writes a row, the direct one does
   * not, and a client that reads `metaLink` off the response renders an empty state with no error.
   */
  test('commit creates the row through the configured repository', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const router = await mount({
      helper,
      directUpload: ALLOW,
      metaLink: {
        model: BaseMetaLinkModel,
        repository: {
          create: async (opts: { data: Record<string, unknown> }) => {
            created.push(opts.data);
            return { count: 1, data: { id: 'meta-1', ...opts.data } };
          },
        } as never,
      },
    });

    const policies = (await (await askPolicy(router, [{ fileName: 'a.png' }])).json()) as Array<{
      objectName: string;
      commitToken: string;
    }>;
    helper.seedObject({ bucket: 'uploads', key: policies[0].objectName });

    const response = await commit(router, policies[0].commitToken);

    expect(response.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      bucketName: 'uploads',
      objectName: policies[0].objectName.slice('pending/'.length),
    });
    expect(await response.json()).toHaveProperty('metaLink');
  });

  test('a label in the commit query is a 400, and nothing is recorded', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const router = await mount({
      helper,
      directUpload: ALLOW,
      metaLink: {
        model: BaseMetaLinkModel,
        repository: {
          create: async (opts: { data: Record<string, unknown> }) => {
            created.push(opts.data);
            return { count: 1, data: { id: 'meta-1', ...opts.data } };
          },
        } as never,
      },
    });

    const policies = (await (await askPolicy(router, [{ fileName: 'a.png' }])).json()) as Array<{
      objectName: string;
      commitToken: string;
    }>;
    helper.seedObject({ bucket: 'uploads', key: policies[0].objectName });

    const response = await router.request('/assets/upload-commit?principalId=42', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commitToken: policies[0].commitToken }),
    });

    expect(response.status).toBe(400);
    expect(created).toEqual([]);
  });

  test('labels in the commit body reach the row, so a direct upload can be attributed too', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const router = await mount({
      helper,
      directUpload: ALLOW,
      metaLink: {
        model: BaseMetaLinkModel,
        repository: {
          create: async (opts: { data: Record<string, unknown> }) => {
            created.push(opts.data);
            return { count: 1, data: { id: 'meta-1', ...opts.data } };
          },
        } as never,
      },
    });

    const policies = (await (await askPolicy(router, [{ fileName: 'a.png' }])).json()) as Array<{
      objectName: string;
      commitToken: string;
    }>;
    helper.seedObject({ bucket: 'uploads', key: policies[0].objectName });

    const response = await commit(router, policies[0].commitToken, {
      principalType: 'User',
      principalId: '42',
      variant: 'thumbnail',
    });

    expect(response.status).toBe(200);
    expect(created[0]).toMatchObject({
      principalType: 'User',
      principalId: '42',
      variant: 'thumbnail',
    });
  });

  /**
   * The bytes are already at the final key and the pending copy is gone by the time the row is
   * written. Answering 500 would send the caller back with a token whose source no longer exists.
   */
  test('a repository failure still answers 200, with the code in the body', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({
      helper,
      directUpload: ALLOW,
      metaLink: {
        model: BaseMetaLinkModel,
        repository: {
          create: async () => {
            throw new Error('duplicate key value violates unique constraint "MetaLink_pkey"');
          },
        } as never,
      },
    });

    const policies = (await (await askPolicy(router, [{ fileName: 'a.png' }])).json()) as Array<{
      objectName: string;
      commitToken: string;
    }>;
    helper.seedObject({ bucket: 'uploads', key: policies[0].objectName });

    const response = await commit(router, policies[0].commitToken);
    const body = (await response.json()) as { metaLink: { error: string }; link: string };

    expect(response.status).toBe(200);
    expect(body.metaLink).toEqual({ error: META_LINK_CREATE_FAILED });
    // The object IS committed - the response still describes it.
    expect(body.link).toBeTruthy();
  });

  test('with no metaLink configured the commit still succeeds', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, directUpload: ALLOW });

    const policies = (await (await askPolicy(router, [{ fileName: 'a.png' }])).json()) as Array<{
      objectName: string;
      commitToken: string;
    }>;
    helper.seedObject({ bucket: 'uploads', key: policies[0].objectName });

    expect((await commit(router, policies[0].commitToken)).status).toBe(200);
  });
});

describe('the routes exist only when directUpload is configured', () => {
  test('without it, neither route is mounted', async () => {
    const helper = new FakeStorageHelper();
    MetadataRegistry.getInstance().clearAll();
    const application = new DirectUploadApplication({
      scope: 'NoDirectUploadApp',
      config: TEST_CONFIGS,
    });
    application.init();
    application.controller(
      AssetControllerFactory.defineAssetController({
        controller: { name: 'PlainAssetController', basePath: '/assets', bucket: 'uploads' },
        storage: StaticAssetStorageTypes.DISK,
        helper: helper as never,
      }),
    );
    await application['registerControllers']();

    const server = application.getServer() as OpenAPIHono;
    server.route(TEST_CONFIGS.path.base, application.getRootRouter());

    expect((await askPolicy(server, [{ fileName: 'a.png' }])).status).toBe(404);
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
          uploadPolicy: { authorize: spec },
          uploadCommit: { authorize: spec },
        },
      },
      storage: StaticAssetStorageTypes.DISK,
      helper: undefined as never,
    },
  };

  return options;
};
