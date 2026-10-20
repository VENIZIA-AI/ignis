import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { AssetControllerFactory } from '@/components/static-asset/controller';
import { MetaLinkRecreateActions, StaticAssetStorageTypes } from '@/components/static-asset/common';
import type {
  TMetaLinkConfig,
  TObjectNameResolver,
  TStaticAssetExtraOptions,
  TStaticAssetsComponentOptions,
} from '@/components/static-asset/common';
import { BaseMetaLinkModel } from '@/components/static-asset/models';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from './fake-storage.helper';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

const OBJECT_NOT_FOUND_CODE = 'core.storage.object_not_found';

class ScopedAssetApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'scoped-asset-app', version: '0.0.0', description: '' };
  }
  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

type TMetaLinkRow = Record<string, AnyType>;

/** The repository calls the component makes: create, and the updates over the (bucket, object) pair. */
class FakeMetaLinkRepository {
  readonly rows: TMetaLinkRow[] = [];
  readonly updateCalls: string[] = [];

  private matchRows(opts: { where: TMetaLinkRow }) {
    return this.rows.filter(row =>
      Object.entries(opts.where).every(([key, value]) => row[key] === value),
    );
  }

  async create(opts: { data: TMetaLinkRow }) {
    const row = { id: String(this.rows.length + 1), ...opts.data };
    this.rows.push(row);
    return { count: 1, data: row };
  }

  async updateById(opts: { id: string; data: TMetaLinkRow }) {
    this.updateCalls.push('updateById');
    const [row] = this.matchRows({ where: { id: opts.id } });
    Object.assign(row, opts.data);
    return { count: 1, data: row };
  }

  async updateAll(opts: { data: TMetaLinkRow; where: TMetaLinkRow }) {
    this.updateCalls.push('updateAll');
    const matched = this.matchRows({ where: opts.where });
    for (const row of matched) {
      Object.assign(row, opts.data);
    }
    return { count: matched.length, data: matched };
  }
}

/** The component reads `repository` through `resolveValueAsync`, so a resolver stands in for the class a fake cannot structurally be. */
const toRepositoryResolver = (opts: {
  repository: FakeMetaLinkRepository;
}): TMetaLinkConfig<AnyType>['repository'] => {
  const resolveRepository = (): AnyType => opts.repository;
  return resolveRepository;
};

const toMetaLinkConfig = (opts: {
  repository: FakeMetaLinkRepository;
  createMetaLink?: TMetaLinkConfig<AnyType>['createMetaLink'];
}): TMetaLinkConfig<AnyType> => ({
  model: BaseMetaLinkModel,
  repository: toRepositoryResolver({ repository: opts.repository }),
  createMetaLink: opts.createMetaLink,
});

const mount = async (opts: {
  helper: FakeStorageHelper;
  controller?: Partial<TStaticAssetsComponentOptions[string]['controller']>;
  metaLink?: TMetaLinkConfig<AnyType>;
  resolveObjectName?: TObjectNameResolver;
  options?: TStaticAssetExtraOptions;
}): Promise<OpenAPIHono> => {
  MetadataRegistry.getInstance().clearAll();
  const application = new ScopedAssetApplication({
    scope: 'ScopedAssetApp',
    config: TEST_CONFIGS,
  });
  application.init();

  application.controller(
    AssetControllerFactory.defineAssetController({
      controller: {
        name: 'ScopedAssetController',
        basePath: '/assets',
        isStrict: false,
        bucket: 'images',
        ...opts.controller,
      },
      storage: StaticAssetStorageTypes.DISK,
      helper: opts.helper,
      useMetaLink: opts.metaLink !== undefined,
      metaLink: opts.metaLink,
      resolveObjectName: opts.resolveObjectName,
      options: opts.options,
    }),
  );
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());
  return server;
};

const upload = (opts: {
  router: OpenAPIHono;
  fileName?: string;
  labels?: Record<string, string>;
}) => {
  const form = new FormData();
  form.append('files', new File(['hello'], opts.fileName ?? 'photo.jpg', { type: 'image/jpeg' }));
  for (const [key, value] of Object.entries(opts.labels ?? {})) {
    form.append(key, value);
  }

  return opts.router.request('/assets/objects', { method: 'POST', body: form });
};

const objectPath = (opts: { route: string; key: string }) =>
  `/assets/${opts.route}/${encodeURIComponent(opts.key)}`;

const storageMethods = (helper: FakeStorageHelper) => helper.calls.map(call => call.method);

describe('a route can be switched off one by one', () => {
  test('enabled: false leaves the route unregistered, and the storage is never asked', async () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'images', key: 'photo.jpg' });
    const router = await mount({
      helper,
      controller: { routes: { deleteObject: { enabled: false } } },
    });

    const response = await router.request(objectPath({ route: 'objects', key: 'photo.jpg' }), {
      method: 'DELETE',
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.NotFound);
    expect(storageMethods(helper)).not.toContain('removeObject');
    expect(helper.hasObject({ bucket: { name: 'images' }, object: { key: 'photo.jpg' } })).toBe(
      true,
    );
  });

  test('the other routes stay registered, and enabled: true changes nothing', async () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'images', key: 'photo.jpg', mimetype: 'image/jpeg' });
    const router = await mount({
      helper,
      controller: {
        routes: { deleteObject: { enabled: false }, getObjectByName: { enabled: true } },
      },
    });

    const response = await router.request(objectPath({ route: 'objects', key: 'photo.jpg' }));

    expect(response.status).toBe(200);
  });

  test('every switchable route honours it, bucket routes and recreate included', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({
      helper,
      metaLink: toMetaLinkConfig({ repository: new FakeMetaLinkRepository() }),
      controller: {
        bucket: undefined,
        routes: {
          getBuckets: { enabled: false },
          listObjects: { enabled: false },
          upload: { enabled: false },
          recreateMetaLink: { enabled: false },
        },
      },
    });

    const buckets = await router.request('/assets/buckets');
    const list = await router.request('/assets/buckets/images/objects');
    const uploaded = await router.request('/assets/buckets/images/objects', {
      method: 'POST',
      body: new FormData(),
    });
    const recreated = await router.request('/assets/buckets/images/meta-links/a.png', {
      method: 'PUT',
    });

    expect([buckets.status, list.status, uploaded.status, recreated.status]).toEqual([
      404, 404, 404, 404,
    ]);
    expect(helper.calls).toEqual([]);
  });
});

describe('controller.keyPrefix scopes every key the controller touches', () => {
  const seedBoth = (helper: FakeStorageHelper) => {
    helper.seedObject({ bucket: 'images', key: 'tenant-a/photo.jpg', mimetype: 'image/jpeg' });
    helper.seedObject({ bucket: 'images', key: 'tenant-b/photo.jpg', mimetype: 'image/jpeg' });
    helper.seedObject({ bucket: 'images', key: 'tenant-ab/photo.jpg', mimetype: 'image/jpeg' });
  };

  for (const [route, method] of [
    ['objects', 'GET'],
    ['download', 'GET'],
    ['objects', 'DELETE'],
    ['meta-links', 'PUT'],
  ] as const) {
    test(`${method} /${route} answers 404 for a key outside the prefix, never touching storage`, async () => {
      const helper = new FakeStorageHelper();
      seedBoth(helper);
      const router = await mount({
        helper,
        controller: { keyPrefix: 'tenant-a' },
        metaLink: toMetaLinkConfig({ repository: new FakeMetaLinkRepository() }),
      });

      const response = await router.request(objectPath({ route, key: 'tenant-b/photo.jpg' }), {
        method,
      });

      expect(response.status).toBe(HTTP.ResultCodes.RS_4.NotFound);
      expect(JSON.stringify(await response.json())).toContain(OBJECT_NOT_FOUND_CODE);
      expect(helper.calls).toEqual([]);
      expect(
        helper.hasObject({ bucket: { name: 'images' }, object: { key: 'tenant-b/photo.jpg' } }),
      ).toBe(true);
    });
  }

  test('a prefix without its slash does not own a sibling that merely starts the same', async () => {
    const helper = new FakeStorageHelper();
    seedBoth(helper);
    const router = await mount({ helper, controller: { keyPrefix: 'tenant-a' } });

    const response = await router.request(
      objectPath({ route: 'objects', key: 'tenant-ab/photo.jpg' }),
    );

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.NotFound);
  });

  test('a key inside the prefix is served as before', async () => {
    const helper = new FakeStorageHelper();
    seedBoth(helper);
    const router = await mount({ helper, controller: { keyPrefix: '/tenant-a/' } });

    const response = await router.request(
      objectPath({ route: 'objects', key: 'tenant-a/photo.jpg' }),
    );

    expect(response.status).toBe(200);
  });

  test('the prefix does not count against maxFolderDepth: the caller keeps its own depth', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, controller: { keyPrefix: 'inventory/material-images' } });

    const uploaded = await upload({ router, labels: { folderPath: 'shop/2024' } });
    const [result] = (await uploaded.json()) as Array<{ object: { key: string } }>;
    const served = await router.request(objectPath({ route: 'objects', key: result.object.key }));

    expect(result.object.key).toBe('inventory/material-images/shop/2024/photo.jpg');
    expect(served.status).toBe(200);
  });

  test('listObjects without a prefix lists only the scope', async () => {
    const helper = new FakeStorageHelper();
    seedBoth(helper);
    const router = await mount({ helper, controller: { keyPrefix: 'tenant-a' } });

    const response = await router.request('/assets/objects');
    const names = ((await response.json()) as Array<{ name: string }>).map(item => item.name);

    expect(names).toEqual(['tenant-a/photo.jpg']);
  });

  test('listObjects narrows a wider prefix to the scope and keeps a narrower one', async () => {
    const helper = new FakeStorageHelper();
    seedBoth(helper);
    const router = await mount({ helper, controller: { keyPrefix: 'tenant-a' } });

    await router.request('/assets/objects?prefix=tenant');
    await router.request(`/assets/objects?prefix=${encodeURIComponent('tenant-a/pho')}`);

    const prefixes = helper.calls
      .filter(call => call.method === 'listObjects')
      .map(call => call.args['prefix']);
    expect(prefixes).toEqual(['tenant-a/', 'tenant-a/pho']);
  });

  test('listObjects outside the scope is empty, and the storage is never asked', async () => {
    const helper = new FakeStorageHelper();
    seedBoth(helper);
    const router = await mount({ helper, controller: { keyPrefix: 'tenant-a' } });

    const response = await router.request('/assets/objects?prefix=tenant-b/');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(helper.calls).toEqual([]);
  });

  test('the default upload key is placed under the prefix', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, controller: { keyPrefix: 'tenant-a' } });

    const response = await upload({ router, labels: { folderPath: 'photos' } });
    const [result] = (await response.json()) as Array<{ object: { key: string } }>;

    expect(result.object.key).toBe('tenant-a/photos/photo.jpg');
  });

  test('resolveObjectName is offered the scoped default and may return a key inside the prefix', async () => {
    const helper = new FakeStorageHelper();
    const offered: string[] = [];
    const router = await mount({
      helper,
      controller: { keyPrefix: 'tenant-a' },
      resolveObjectName: ({ defaultKey }) => {
        offered.push(defaultKey);
        return 'tenant-a/generated.jpg';
      },
    });

    const response = await upload({ router });
    const [result] = (await response.json()) as Array<{ object: { key: string } }>;

    expect(offered).toEqual(['tenant-a/photo.jpg']);
    expect(result.object.key).toBe('tenant-a/generated.jpg');
  });

  test('a resolveObjectName key outside the prefix is refused, and nothing is written', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({
      helper,
      controller: { keyPrefix: 'tenant-a' },
      resolveObjectName: () => 'tenant-b/escaped.jpg',
    });

    const response = await upload({ router });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    expect(JSON.stringify(await response.json())).toContain(
      'core.static_asset.object_key_out_of_scope',
    );
    expect(storageMethods(helper)).not.toContain('writeObject');
  });

  test('a batch with one key inside and one outside the prefix stores nothing', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({
      helper,
      controller: { keyPrefix: 'tenant-a' },
      resolveObjectName: ({ file, defaultKey }) =>
        file.originalName === 'second.jpg' ? 'tenant-b/second.jpg' : defaultKey,
    });

    const form = new FormData();
    form.append('files', new File(['one'], 'first.jpg', { type: 'image/jpeg' }));
    form.append('files', new File(['two'], 'second.jpg', { type: 'image/jpeg' }));
    const response = await router.request('/assets/objects', { method: 'POST', body: form });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    expect(JSON.stringify(await response.json())).toContain(
      'core.static_asset.object_key_out_of_scope',
    );
    expect(storageMethods(helper)).not.toContain('writeObject');
    expect(
      helper.hasObject({ bucket: { name: 'images' }, object: { key: 'tenant-a/first.jpg' } }),
    ).toBe(false);
  });

  test('an extra.normalizeNameFn key outside the prefix is refused the same way', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({
      helper,
      controller: { keyPrefix: 'tenant-a' },
      options: { normalizeNameFn: () => 'elsewhere.jpg' },
    });

    const response = await upload({ router });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    expect(storageMethods(helper)).not.toContain('writeObject');
  });

  test('a direct upload lands under the prefix, and the policy only covers it', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({
      helper,
      controller: {
        keyPrefix: 'tenant-a',
        directUpload: { authorize: () => true, secretKey: 'a-secret', maxBytes: 1024 },
      },
    });

    const policyResponse = await router.request('/assets/upload-policy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ fileName: 'a.png' }] }),
    });
    const [policy] = (await policyResponse.json()) as Array<{
      objectName: string;
      commitToken: string;
    }>;
    helper.seedObject({ bucket: 'images', key: policy.objectName });

    const commitResponse = await router.request('/assets/upload-commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commitToken: policy.commitToken }),
    });
    const committed = (await commitResponse.json()) as { object: { key: string } };

    expect(policy.objectName).toStartWith('pending/tenant-a/');
    expect(helper.calls.find(call => call.method === 'presignPost')?.args['keyPrefix']).toBe(
      'pending/tenant-a/',
    );
    expect(committed.object.key).toStartWith('tenant-a/');
  });

  test('with the default naming, a name carrying a slash is refused exactly as without a prefix', async () => {
    const answers: Array<{ status: number; text: string; methods: string[] }> = [];

    for (const controller of [{ keyPrefix: 'tenant-a' }, {}]) {
      const helper = new FakeStorageHelper();
      const router = await mount({ helper, controller });

      const response = await upload({ router, fileName: 'evil/x.jpg' });
      answers.push({
        status: response.status,
        text: JSON.stringify(await response.json()),
        methods: storageMethods(helper),
      });
    }

    for (const answer of answers) {
      expect(answer.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
      expect(answer.text).toContain('Invalid original file name');
      expect(answer.methods).not.toContain('writeObject');
    }
  });

  test('a naming hook still decides the key from a name carrying a slash', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({
      helper,
      controller: { keyPrefix: 'tenant-a' },
      resolveObjectName: () => 'tenant-a/generated.jpg',
    });

    const response = await upload({ router, fileName: 'evil/x.jpg' });

    expect(response.status).toBe(200);
  });

  test('keyPrefix without controller.bucket is refused when the controller is defined', () => {
    expect(() =>
      AssetControllerFactory.defineAssetController({
        controller: { name: 'UnboundScope', basePath: '/assets', keyPrefix: 'tenant-a' },
        storage: StaticAssetStorageTypes.DISK,
        helper: new FakeStorageHelper(),
      }),
    ).toThrow('keyPrefix needs controller.bucket');
  });

  /** A tenant-b object is seeded under both; the scope must never let a request reach it. */
  const touchesTenantB = (helper: FakeStorageHelper) =>
    helper.calls.some(call => JSON.stringify(call.args).includes('tenant-b'));

  for (const [path, status] of [
    ['tenant-a/photo.jpg', 200],
    ['tenant-a%2Fphoto.jpg', 200],
    ['tenant-b/photo.jpg', 404],
    ['tenant-a/../tenant-b/photo.jpg', 404],
    ['tenant-a/%2e%2e/tenant-b/photo.jpg', 404],
    ['/tenant-a/photo.jpg', 404],
    ['TENANT-A/photo.jpg', 404],
    ['tenant-a%2F..%2Ftenant-b%2Fphoto.jpg', 400],
    ['tenant-a//photo.jpg', 400],
  ] as const) {
    test(`rawObjectPath: GET /objects/${path} answers ${status}, never reaching another tenant`, async () => {
      const helper = new FakeStorageHelper();
      seedBoth(helper);
      const router = await mount({
        helper,
        controller: { keyPrefix: 'tenant-a', rawObjectPath: true },
      });

      const response = await router.request(`/assets/objects/${path}`);

      expect(response.status).toBe(status);
      expect(touchesTenantB(helper)).toBe(false);
    });
  }

  for (const [key, status] of [
    ['tenant-a/../tenant-b/photo.jpg', 400],
    ['/tenant-a/photo.jpg', 404],
    ['tenant-a/%2F../tenant-b/photo.jpg', 400],
  ] as const) {
    test(`encoded path: the key ${key} answers ${status}, never reaching another tenant`, async () => {
      const helper = new FakeStorageHelper();
      seedBoth(helper);
      const router = await mount({ helper, controller: { keyPrefix: 'tenant-a' } });

      const response = await router.request(objectPath({ route: 'objects', key }));

      expect(response.status).toBe(status);
      expect(touchesTenantB(helper)).toBe(false);
    });
  }

  for (const keyPrefix of ['', '/', 'a/../b', 'tenant;a']) {
    test(`an unusable keyPrefix '${keyPrefix}' is refused when the controller is defined`, () => {
      expect(() =>
        AssetControllerFactory.defineAssetController({
          controller: { name: 'BadScope', basePath: '/assets', bucket: 'images', keyPrefix },
          storage: StaticAssetStorageTypes.DISK,
          helper: new FakeStorageHelper(),
        }),
      ).toThrow('controller.keyPrefix');
    });
  }
});

describe('extra.maxBytes refuses a declared length before the body is read', () => {
  /** A body that counts how often it was pulled: zero means nothing buffered it. */
  const countingBody = () => {
    const state = { pulled: 0 };
    // highWaterMark 0: the stream pulls only when something reads it, never to fill its own queue.
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          state.pulled += 1;
          controller.enqueue(new TextEncoder().encode('--b\r\n\r\n--b--\r\n'));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    return { state, body };
  };

  test('an oversized content-length is a 413 and the body is never pulled', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, options: { maxBytes: 16 } });
    const { state, body } = countingBody();

    const response = await router.request('/assets/objects', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=b', 'content-length': '999999' },
      body,
      duplex: 'half',
    } satisfies RequestInit & { duplex: 'half' });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    expect(JSON.stringify(await response.json())).toContain('core.static_asset.upload_too_large');
    expect(state.pulled).toBe(0);
  });

  test("the application's own upload middleware still runs first", async () => {
    const helper = new FakeStorageHelper();
    const seen: string[] = [];
    const router = await mount({
      helper,
      options: { maxBytes: 16 },
      controller: {
        routes: {
          upload: {
            middleware: async (_context, next) => {
              seen.push('application');
              await next();
            },
          },
        },
      },
    });

    const response = await router.request('/assets/objects', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=b', 'content-length': '999999' },
      body: 'x',
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    expect(seen).toEqual(['application']);
  });
});

describe('recreate-metalink refreshes every row of the pair, or creates one the upload way', () => {
  const seedRows = (repository: FakeMetaLinkRepository) => {
    for (const principalId of ['product-1', 'variant-7']) {
      repository.rows.push({
        id: principalId,
        bucketName: 'images',
        objectName: 'photo.jpg',
        link: '/old-link',
        mimetype: 'application/octet-stream',
        size: 1,
        etag: 'old-etag',
        storageType: 's3',
        isSynced: false,
        principalType: 'Product',
        principalId,
        variant: 'thumbnail',
        sequence: 3,
      });
    }
  };

  test('every row gets the stored-object facts and keeps its own labels and storage type', async () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'images', key: 'photo.jpg', mimetype: 'image/jpeg' });
    const repository = new FakeMetaLinkRepository();
    seedRows(repository);
    const router = await mount({ helper, metaLink: toMetaLinkConfig({ repository }) });

    const response = await router.request('/assets/meta-links/photo.jpg', { method: 'PUT' });
    const body = (await response.json()) as Record<string, AnyType>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      action: MetaLinkRecreateActions.REFRESHED,
      count: 2,
    });
    expect(body.metaLinks).toHaveLength(2);
    for (const row of repository.rows) {
      expect(row).toMatchObject({
        link: '/assets/objects/photo.jpg',
        mimetype: 'image/jpeg',
        size: 'seeded'.length,
        etag: 'fake-etag',
        isSynced: true,
        storageType: 's3',
        principalType: 'Product',
        variant: 'thumbnail',
        sequence: 3,
      });
    }
    expect(repository.rows.map(row => row.principalId)).toEqual(['product-1', 'variant-7']);
  });

  test('a stat without a content type falls back to the name, as the upload does', async () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'images', key: 'photo.jpg' });
    helper.statMetadataOverride = {};
    const repository = new FakeMetaLinkRepository();
    seedRows(repository);
    const router = await mount({ helper, metaLink: toMetaLinkConfig({ repository }) });

    await router.request('/assets/meta-links/photo.jpg', { method: 'PUT' });

    expect(repository.rows[0].mimetype).toBe('image/jpeg');
  });

  test('with no row, the createMetaLink hook writes it, exactly as on upload', async () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'images', key: 'photo.jpg', mimetype: 'image/jpeg' });
    const repository = new FakeMetaLinkRepository();
    const hookCalls: AnyType[] = [];
    const router = await mount({
      helper,
      metaLink: toMetaLinkConfig({
        repository,
        createMetaLink: async hookOptions => {
          hookCalls.push(hookOptions);
          return repository.create({
            data: { objectName: hookOptions.uploadResult.object.key, storageType: 's3' },
          });
        },
      }),
    });

    const response = await router.request('/assets/meta-links/photo.jpg', { method: 'PUT' });
    const body = (await response.json()) as Record<string, AnyType>;

    expect(body).toMatchObject({
      success: true,
      action: MetaLinkRecreateActions.CREATED,
      count: 1,
      metaLink: { storageType: 's3' },
    });
    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]).toMatchObject({
      uploadResult: {
        bucket: { name: 'images' },
        object: { key: 'photo.jpg', size: 'seeded'.length, contentType: 'image/jpeg' },
        link: '/assets/objects/photo.jpg',
      },
      fileStat: { size: 'seeded'.length },
      query: {},
    });
  });

  test('with a createMetaLink hook, the refresh keeps the link and metadata the hook wrote', async () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'images', key: 'photo.jpg', mimetype: 'image/jpeg' });
    const repository = new FakeMetaLinkRepository();
    seedRows(repository);
    for (const row of repository.rows) {
      row.link = 'https://cdn.example.com/photo.jpg';
      row.metadata = { width: 640, height: 480, placeholder: 'LKO2?U%2Tw=w' };
    }
    const router = await mount({
      helper,
      metaLink: toMetaLinkConfig({
        repository,
        createMetaLink: async hookOptions =>
          repository.create({ data: { objectName: hookOptions.uploadResult.object.key } }),
      }),
    });

    const response = await router.request('/assets/meta-links/photo.jpg', { method: 'PUT' });

    expect(response.status).toBe(200);
    expect(repository.updateCalls).toEqual(['updateAll']);
    for (const row of repository.rows) {
      expect(row).toMatchObject({
        link: 'https://cdn.example.com/photo.jpg',
        metadata: { width: 640, height: 480, placeholder: 'LKO2?U%2Tw=w' },
        mimetype: 'image/jpeg',
        size: 'seeded'.length,
        etag: 'fake-etag',
        isSynced: true,
      });
    }
  });

  test('without a hook, each row keeps its own metadata keys under the fresh stat', async () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'images', key: 'photo.jpg', mimetype: 'image/jpeg' });
    const repository = new FakeMetaLinkRepository();
    seedRows(repository);
    repository.rows[0].metadata = { width: 640, mimetype: 'application/octet-stream' };
    repository.rows[1].metadata = { caption: 'variant' };
    const router = await mount({ helper, metaLink: toMetaLinkConfig({ repository }) });

    const response = await router.request('/assets/meta-links/photo.jpg', { method: 'PUT' });
    const body = (await response.json()) as Record<string, AnyType>;

    expect(body).toMatchObject({ action: MetaLinkRecreateActions.REFRESHED, count: 2 });
    expect(repository.updateCalls).toEqual(['updateAll', 'updateById', 'updateById']);
    expect(repository.rows[0].metadata).toEqual({
      width: 640,
      mimetype: 'image/jpeg',
      'content-type': 'image/jpeg',
    });
    expect(repository.rows[1].metadata).toEqual({
      caption: 'variant',
      mimetype: 'image/jpeg',
      'content-type': 'image/jpeg',
    });
    expect(repository.rows.map(row => row.link)).toEqual([
      '/assets/objects/photo.jpg',
      '/assets/objects/photo.jpg',
    ]);
  });

  test('the OpenAPI document lists the two recreate actions, not any string', async () => {
    const router = await mount({
      helper: new FakeStorageHelper(),
      metaLink: toMetaLinkConfig({ repository: new FakeMetaLinkRepository() }),
    });

    const document = JSON.stringify(
      router.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'assets', version: '1' } }),
    );

    expect(document).toContain(
      JSON.stringify({
        type: 'string',
        enum: [MetaLinkRecreateActions.REFRESHED, MetaLinkRecreateActions.CREATED],
      }).slice(1, -1),
    );
  });

  test('with no row and no hook, the default row carries the configured storage type', async () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'images', key: 'photo.jpg', mimetype: 'image/jpeg' });
    const repository = new FakeMetaLinkRepository();
    const router = await mount({ helper, metaLink: toMetaLinkConfig({ repository }) });

    const response = await router.request('/assets/meta-links/photo.jpg', { method: 'PUT' });

    expect(response.status).toBe(200);
    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0]).toMatchObject({
      bucketName: 'images',
      objectName: 'photo.jpg',
      storageType: StaticAssetStorageTypes.DISK,
      mimetype: 'image/jpeg',
      isSynced: true,
    });
  });
});
