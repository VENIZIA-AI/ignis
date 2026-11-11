import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { StaticAssetControllerFactory } from '@/components/static-asset/controller';
import type {
  TMetaLinkConfig,
  TStaticAssetEntry,
  TStaticAssetObjectKeyResolver,
  TStaticAssetRoutes,
  TStaticAssetServerUploadOptions,
} from '@/components/static-asset/common';
import { OpenApiResponses } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { AppErrorMiddleware } from '@/base/middlewares';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { beforeEach, describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from './fake-storage.helper';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  // The controller always routes strictly: `objects/..` stays a 404 instead of normalizing.
  path: { base: '/', isStrict: true },
  transports: [ControllerTransports.REST],
};

class TestApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'test-app', version: '0.0.0', description: 'Static asset component test app' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

const readJson = async (response: Response): Promise<Record<string, any>> => {
  const result = await response.json();

  return result as Record<string, any>;
};

/** Minimal in-memory stand-in for the MetaLink repository (create/findOne/findById/updateById/updateBy/deleteBy). */
class FakeMetaLinkRepository {
  readonly rows: Array<Record<string, AnyType>> = [];
  private sequence = 0;

  async create(opts: { data: Record<string, AnyType> }) {
    this.sequence += 1;
    const row = { id: String(this.sequence), ...opts.data };
    this.rows.push(row);

    return { count: 1, data: row };
  }

  async findOne(opts: { filter?: { where?: Record<string, AnyType> } }) {
    const where = opts.filter?.where ?? {};

    return (
      this.rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ??
      null
    );
  }

  async findById(opts: { id: string }) {
    return this.rows.find((row) => row['id'] === opts.id) ?? null;
  }

  async updateById(opts: { id: string; data: Record<string, AnyType> }) {
    const row = this.rows.find((item) => item['id'] === opts.id);

    if (!row) {
      return { count: 0, data: null };
    }

    Object.assign(row, opts.data);

    return { count: 1, data: row };
  }

  /** recreate-metalink refreshes every row of a pair through this, not findOne + updateById. */
  async updateBy(opts: { data: Record<string, AnyType>; where: Record<string, AnyType> }) {
    const matched = this.rows.filter((row) =>
      Object.entries(opts.where).every(([key, value]) => row[key] === value),
    );

    for (const row of matched) {
      Object.assign(row, opts.data);
    }

    return { count: matched.length, data: matched };
  }

  async deleteBy(opts: { where?: Record<string, AnyType> }) {
    const where = opts.where ?? {};
    const kept = this.rows.filter(
      (row) => !Object.entries(where).every(([key, value]) => row[key] === value),
    );
    const count = this.rows.length - kept.length;
    this.rows.length = 0;
    this.rows.push(...kept);

    return { count, data: null };
  }
}

/** Mounts a generated static-asset controller on a fresh application and returns the server router wired as start() does - root router under the app base path plus the real application error handler. */
const mountAssetController = async (opts: {
  helper: FakeStorageHelper;
  serverUpload?: TStaticAssetServerUploadOptions;
  extend?: TStaticAssetEntry['extend'];
  metaLink?: TMetaLinkConfig;
  bucket?: string | (() => string);
  rawObjectPath?: boolean;
  routes?: TStaticAssetRoutes;
}): Promise<OpenAPIHono> => {
  const { helper, serverUpload, extend, metaLink, bucket = 'images', rawObjectPath, routes } = opts;

  MetadataRegistry.getInstance().clearAll();
  const application = new TestApplication({ scope: 'StaticAssetTestApp', config: TEST_CONFIGS });
  application.init();

  const entry: TStaticAssetEntry = {
    basePath: '/assets',
    bucket,
    rawObjectPath,
    routes,
    serverUpload: { use: true, ...serverUpload },
    directUpload: { use: false },
    metaLink: metaLink ? { use: true, ...metaLink } : { use: false },
    extend,
    helper: helper as never,
  };
  const AssetController = StaticAssetControllerFactory.build({ key: 'test', entry });

  application.controller(AssetController);
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());

  return server;
};

/** Uploads `files` through the multipart endpoint. */
const uploadFiles = async (opts: {
  router: OpenAPIHono;
  files: File[];
  /** The labels, as they now travel: form fields beside the file, not a query string. */
  labels?: Record<string, string>;
  fieldName?: string;
  uploadPath?: string;
}): Promise<Response> => {
  const { router, files, labels, fieldName = 'files', uploadPath = '/assets/objects' } = opts;
  const formData = new FormData();

  for (const file of files) {
    formData.append(fieldName, file);
  }

  const labelsEntries = Object.entries(labels ?? {});

  for (const [key, value] of labelsEntries) {
    formData.append(key, value);
  }

  return router.request(uploadPath, {
    method: 'POST',
    body: formData,
  });
};

describe('StaticAsset controller — path traversal hardening', () => {
  let helper: FakeStorageHelper;
  let router: OpenAPIHono;

  beforeEach(async () => {
    helper = new FakeStorageHelper();
    const result = await mountAssetController({ helper });
    router = result;
    await uploadFiles({
      router,
      files: [new File(['hello'], 'photo.jpg', { type: 'image/jpeg' })],
    });
    helper.reset();
  });

  const maliciousObjectNames = [
    ['encoded traversal', '%2e%2e%2f%2e%2e%2fetc%2fpasswd'],
    ['null byte', 'photo%00.jpg'],
    ['windows traversal', '..%5C..%5Cwindows%5Cwin.ini'],
    ['dot-dot segment', '..'],
    ['hidden file', '.env'],
    ['shell metacharacters', 'photo.jpg%3Brm%20-rf'],
  ] as const;

  test.each([
    ['a name over 255 bytes', encodeURIComponent(`${'é'.repeat(126)}.jpg`)],
    ['a key ending with a slash', encodeURIComponent('photos/photo.jpg/')],
  ])('GET object answers %s with a 400 without reaching storage', async (_label, objectName) => {
    const response = await router.request(`/assets/objects/${objectName}`);
    expect(response.status).toBe(400);

    const body = await readJson(response);
    expect(body.normalized?.code).toBe('core.static_asset.object_name_invalid');
    expect(helper.calls.filter((call) => ['getObject', 'getStat'].includes(call.method))).toEqual(
      [],
    );
  });

  for (const [label, objectName] of maliciousObjectNames) {
    test(`GET object rejects ${label} without reaching storage`, async () => {
      const response = await router.request(`/assets/objects/${objectName}`);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);

      const reachedStorage = helper.calls.filter((call) =>
        ['getObject', 'getStat'].includes(call.method),
      );
      expect(reachedStorage).toEqual([]);
    });

    test(`DELETE object rejects ${label} without reaching storage`, async () => {
      const response = await router.request(`/assets/objects/${objectName}`, {
        method: 'DELETE',
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(helper.calls.filter((call) => call.method === 'removeObject')).toEqual([]);
    });

    test(`DOWNLOAD object rejects ${label} without reaching storage`, async () => {
      const response = await router.request(`/assets/download/${objectName}`);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(helper.calls.filter((call) => ['getObject', 'getStat'].includes(call.method))).toEqual(
        [],
      );
    });
  }

  /** The controller decodes NOTHING - Hono already did, and a second decode made `report_100%.pdf` permanently unfetchable. A double-encoded payload is therefore a literal filename containing percent signs, not a traversal: it must neither escape the bucket nor be mistaken for `../`. */
  test('a double-encoded traversal payload is a LITERAL name, not a traversal', async () => {
    const response = await router.request('/assets/objects/%252e%252e%252fetc%252fpasswd');

    // Not found, because no such object exists - not a 200, and not an escape.
    expect(response.status).toBeGreaterThanOrEqual(400);

    const storageCalls = helper.calls.filter((call) =>
      ['getObject', 'getStat'].includes(call.method),
    );

    for (const call of storageCalls) {
      const name = String((call as AnyType).args?.name ?? '');

      // The name that reached storage is the literal, still-encoded string: no `..`, no separator.
      expect(name).not.toContain('..');
      expect(name).not.toContain('/etc/');
    }
  });

  test('valid object name is served', async () => {
    const response = await router.request('/assets/objects/photo.jpg');
    expect(response.status).toBe(200);
    const result = await response.text();
    expect(result).toBe('hello');
  });
});

describe('StaticAsset controller — download headers', () => {
  test('content-disposition filename is sanitized (no CRLF / quote injection)', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });
    await uploadFiles({
      router,
      files: [new File(['payload'], 'report.pdf', { type: 'application/pdf' })],
    });

    const response = await router.request('/assets/download/report.pdf');
    expect(response.status).toBe(200);

    const disposition = response.headers.get('content-disposition') ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('filename="report.pdf"');
    expect(disposition).not.toContain('\r');
    expect(disposition).not.toContain('\n');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('StaticAsset controller - a missing object is a 404, and only a missing object', () => {
  const readRoutes = [
    ['GET', '/assets/objects/absent.jpg'],
    ['DOWNLOAD', '/assets/download/absent.jpg'],
  ] as const;

  test.each(readRoutes)('%s answers 404 with the catalogued code', async (_label, path) => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    const response = await router.request(path);
    expect(response.status).toBe(404);

    const body = await readJson(response);
    expect(body.normalized?.code).toBe('core.storage.object_not_found');
  });

  /** The discrimination is the point: a backend that is merely broken must not read as a missing file. */
  test('a storage failure that is not a missing object still answers 500', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    helper.getStat = async () => {
      throw new Error('connection reset by peer');
    };

    const response = await router.request('/assets/objects/photo.jpg');
    expect(response.status).toBe(500);
  });

  test('an object that exists still answers 200', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });
    await uploadFiles({ router, files: [new File(['hello'], 'photo.jpg')] });

    const response = await router.request('/assets/objects/photo.jpg');
    expect(response.status).toBe(200);
  });

  /** Deliberately unchanged: S3 deletes idempotently and consumers already depend on the 200. */
  test('DELETE of an object that was never there still answers 200', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    const response = await router.request('/assets/objects/absent.jpg', {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);
    expect(helper.calls.filter((call) => call.method === 'removeObject')).toHaveLength(1);
  });
});

describe('StaticAsset controller - a stored object never renders on the API origin', () => {
  /**
   * Serving an uploaded file as a renderable type on the API's own origin is stored XSS: the script
   * runs with the application's cookies. `nosniff` cannot help, because the type is declared here.
   */
  const renderableExtensions = ['payload.html', 'payload.svg', 'payload.xhtml', 'payload.xml'];

  test.each(renderableExtensions)('%s is not served as a renderable type', async (fileName) => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });
    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['<script>alert(1)</script>'], fileName)],
    });
    expect(uploadResponse.status).toBe(200);

    const response = await router.request(`/assets/objects/${fileName}`);
    expect(response.status).toBe(200);

    const served = response.headers.get('content-type') ?? '';
    expect(served).toContain(HTTP.HeaderValues.APPLICATION_OCTET_STREAM);
    expect(response.headers.get('content-disposition') ?? '').toContain('attachment');
  });

  test('an image is still served with its own type, so the fix does not break display', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });
    await uploadFiles({ router, files: [new File(['binary'], 'photo.png')] });

    const response = await router.request('/assets/objects/photo.png');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type') ?? '').toContain('image/png');
  });

  /** The served type is decided from the object name, so a backend reporting nothing still serves right. */
  test('the type comes from the object name, not from what the backend reports', async () => {
    const helper = new FakeStorageHelper();
    helper.statMetadataOverride = { 'content-type': 'text/html' };
    const router = await mountAssetController({ helper });
    await uploadFiles({ router, files: [new File(['binary'], 'photo.png')] });

    const response = await router.request('/assets/objects/photo.png');
    expect(response.headers.get('content-type') ?? '').toContain('image/png');
  });
});

describe('StaticAsset controller — multipart upload edge cases', () => {
  let helper: FakeStorageHelper;
  let router: OpenAPIHono;

  beforeEach(async () => {
    helper = new FakeStorageHelper();
    const result = await mountAssetController({ helper });
    router = result;
  });

  test('empty file (0 bytes) is a clean 400, not a 500', async () => {
    const response = await uploadFiles({
      router,
      files: [new File([], 'empty.txt', { type: 'text/plain' })],
    });

    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(String(body.message)).not.toContain('Invalid file size');
    expect(helper.calls.filter((call) => call.method === 'writeObject')).toEqual([]);
  });

  test('missing file field is a clean 4xx, not a silent empty 200', async () => {
    const response = await router.request('/assets/objects', {
      method: 'POST',
      body: new FormData(),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  test('file with a traversal name never reaches the storage backend', async () => {
    const response = await uploadFiles({
      router,
      files: [new File(['x'], '../../etc/passwd', { type: 'text/plain' })],
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(helper.calls.filter((call) => call.method === 'writeObject')).toEqual([]);
  });

  test('storage failure mid-upload surfaces an error (no partial success payload)', async () => {
    helper.failWriteOnName = 'bad.txt';
    const response = await uploadFiles({
      router,
      files: [
        new File(['ok'], 'good.txt', { type: 'text/plain' }),
        new File(['bad'], 'bad.txt', { type: 'text/plain' }),
      ],
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(helper.hasObject({ bucket: { name: 'images' }, object: { key: 'bad.txt' } })).toBe(
      false,
    );
  });

  test('the objectKey hook receives the requested folderPath', async () => {
    const seen: Array<{ originalName: string; folderPath?: string }> = [];
    const localHelper = new FakeStorageHelper();
    const localRouter = await mountAssetController({
      helper: localHelper,
      serverUpload: {
        objectKey: ({ file }) => {
          seen.push({ originalName: file.originalName, folderPath: file.folderPath });

          return file.folderPath ? `${file.folderPath}/${file.originalName}` : file.originalName;
        },
      },
    });

    const response = await uploadFiles({
      router: localRouter,
      files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'photos/2024' },
    });

    expect(response.status).toBe(200);
    expect(seen).toEqual([{ originalName: 'photo.jpg', folderPath: 'photos/2024' }]);
  });
});

describe('StaticAsset controller — list objects query handling', () => {
  let helper: FakeStorageHelper;
  let router: OpenAPIHono;

  beforeEach(async () => {
    helper = new FakeStorageHelper();
    const result = await mountAssetController({ helper });
    router = result;
    await uploadFiles({ router, files: [new File(['a'], 'a.txt', { type: 'text/plain' })] });
    helper.reset();
  });

  test('non numeric maxKeys is rejected instead of silently becoming NaN', async () => {
    const response = await router.request('/assets/objects?maxKeys=abc');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    const listCalls = helper.calls.filter((call) => call.method === 'listObjects');
    expect(listCalls).toEqual([]);
  });

  test('maxKeys=0 is not silently treated as unlimited', async () => {
    const response = await router.request('/assets/objects?maxKeys=0');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(helper.calls.filter((call) => call.method === 'listObjects')).toEqual([]);
  });

  test('valid maxKeys is forwarded as a number', async () => {
    const response = await router.request('/assets/objects?maxKeys=5');
    expect(response.status).toBe(200);

    const listCall = helper.calls.find((call) => call.method === 'listObjects');
    expect(listCall?.args['maxKeys']).toBe(5);
  });
});

describe('StaticAsset controller — nested folder objects', () => {
  test('an object uploaded into a folder is retrievable via its encoded path', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['nested'], 'photo.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'photos/2024' },
    });
    expect(uploadResponse.status).toBe(200);

    const result = await uploadResponse.json();
    const uploaded = result as Array<{ object: { key: string } }>;
    expect(uploaded[0].object.key).toBe('photos/2024/photo.jpg');

    const getResponse = await router.request(
      `/assets/objects/${encodeURIComponent(uploaded[0].object.key)}`,
    );
    expect(getResponse.status).toBe(200);
    const result2 = await getResponse.text();
    expect(result2).toBe('nested');

    // The URL contract: `{objectName}` is ONE segment, so a RAW nested path 404s and only the
    // percent-encoded form resolves. A consumer whose stored links carry the raw form needs its own route.
    const rawResponse = await router.request(`/assets/objects/${uploaded[0].object.key}`);
    expect(rawResponse.status).toBe(404);
  });

  test('the RECREATE_METALINK fallback link resolves back to the object route', async () => {
    const helper = new FakeStorageHelper();
    const metaLinkRepository = new FakeMetaLinkRepository();
    const router = await mountAssetController({
      helper,
      metaLink: { repository: metaLinkRepository as AnyType },
    });

    await uploadFiles({
      router,
      files: [new File(['nested'], 'photo.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'photos/2024' },
    });

    const recreateResponse = await router.request(
      `/assets/meta-links/${encodeURIComponent('photos/2024/photo.jpg')}`,
      { method: 'PUT' },
    );
    expect(recreateResponse.status).toBe(200);

    const body = await readJson(recreateResponse);
    const link = String(body.metaLink?.link ?? '');
    expect(link).not.toBe('');

    const linkResponse = await router.request(link);
    expect(linkResponse.status).toBe(200);
    const result = await linkResponse.text();
    expect(result).toBe('nested');
  });
});

describe('StaticAsset controller — serverUpload.objectKey hook', () => {
  test('no hook keeps the generated name', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'My Photo.JPG', { type: 'image/jpeg' })],
    });
    expect(response.status).toBe(200);

    const result = await response.json();
    const uploaded = result as Array<{ object: { key: string } }>;
    expect(uploaded[0].object.key).toBe('my_photo.jpg');
    expect(helper.hasObject({ bucket: { name: 'images' }, object: { key: 'my_photo.jpg' } })).toBe(
      true,
    );
  });

  test('a hook returning a fixed name stores the object under it', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      serverUpload: { objectKey: () => 'fixed-name.bin' },
    });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'My Photo.JPG', { type: 'image/jpeg' })],
    });
    expect(response.status).toBe(200);

    const result = await response.json();
    const uploaded = result as Array<{ object: { key: string } }>;
    expect(uploaded[0].object.key).toBe('fixed-name.bin');
    expect(
      helper.hasObject({ bucket: { name: 'images' }, object: { key: 'fixed-name.bin' } }),
    ).toBe(true);
    expect(helper.hasObject({ bucket: { name: 'images' }, object: { key: 'my_photo.jpg' } })).toBe(
      false,
    );
  });

  test('the hook is offered the file, the default key and the bucket', async () => {
    const seen: Array<Parameters<TStaticAssetObjectKeyResolver>[0]> = [];
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      serverUpload: {
        objectKey: (hookOptions) => {
          seen.push({ ...hookOptions });

          return hookOptions.file.originalName;
        },
      },
    });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'My Photo.JPG', { type: 'image/jpeg' })],
      labels: { folderPath: 'Photos/2024' },
    });
    expect(response.status).toBe(200);

    expect(seen).toEqual([
      {
        bucket: { name: 'images' },
        file: { originalName: 'My Photo.JPG', folderPath: 'Photos/2024' },
        defaultKey: 'photos/2024/my_photo.jpg',
      },
    ]);

    // `defaultKey` must stay the key the storage helper writes on its own: the factory mirrors
    // `BaseStorageHelper.normalizeObjectName`, which is protected, and this pins the two together.
    const plainHelper = new FakeStorageHelper();
    const plainRouter = await mountAssetController({ helper: plainHelper });
    const plainResponse = await uploadFiles({
      router: plainRouter,
      files: [new File(['x'], 'My Photo.JPG', { type: 'image/jpeg' })],
      labels: { folderPath: 'Photos/2024' },
    });

    const result = await plainResponse.json();
    const plainUploaded = result as Array<{ object: { key: string } }>;
    expect(plainUploaded[0].object.key).toBe(seen[0].defaultKey);
  });
});

describe('StaticAsset controller — extend.after hook', () => {
  test('the hook runs once and its route answers', async () => {
    const helper = new FakeStorageHelper();
    let callCount = 0;

    const router = await mountAssetController({
      helper,
      extend: {
        after: ({ controller, basePath }) => {
          callCount += 1;
          controller.defineRoute({
            configs: {
              method: 'get',
              path: '/health',
              responses: OpenApiResponses.jsonResponse({
                schema: z.object({ basePath: z.string() }),
              }),
            },
            handler: (context) => context.json({ basePath }, HTTP.ResultCodes.RS_2.Ok),
          });
        },
      },
    });

    expect(callCount).toBe(1);

    const response = await router.request('/assets/health');
    expect(response.status).toBe(200);
    const result = await readJson(response);
    expect(result).toEqual({ basePath: '/assets' });
  });

  test('the built-in routes still answer with both hooks set', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      serverUpload: { objectKey: (hookOptions) => `scoped/${hookOptions.defaultKey}` },
      extend: {
        after: ({ controller, helper: hookHelper }) => {
          controller.defineRoute({
            configs: {
              method: 'get',
              path: '/health',
              responses: OpenApiResponses.jsonResponse({
                schema: z.object({ buckets: z.number() }),
              }),
            },
            handler: async (context) => {
              const buckets = await hookHelper.getBuckets();

              return context.json({ buckets: buckets.length }, HTTP.ResultCodes.RS_2.Ok);
            },
          });
        },
      },
    });

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['both'], 'photo.jpg', { type: 'image/jpeg' })],
    });
    expect(uploadResponse.status).toBe(200);

    const result = await uploadResponse.json();
    const uploaded = result as Array<{ object: { key: string } }>;
    expect(uploaded[0].object.key).toBe('scoped/photo.jpg');

    const objectResponse = await router.request(
      `/assets/objects/${encodeURIComponent('scoped/photo.jpg')}`,
    );
    expect(objectResponse.status).toBe(200);
    const result2 = await objectResponse.text();
    expect(result2).toBe('both');

    const listResponse = await router.request('/assets/objects');
    expect(listResponse.status).toBe(200);

    const healthResponse = await router.request('/assets/health');
    expect(healthResponse.status).toBe(200);
    const result3 = await readJson(healthResponse);
    expect(result3).toEqual({ buckets: 1 });
  });
});

describe('StaticAsset controller — the bucket', () => {
  test('a function bucket is read per request, not once at construction', async () => {
    const helper = new FakeStorageHelper();
    let bucketCalls = 0;
    const router = await mountAssetController({
      helper,
      bucket: () => {
        bucketCalls += 1;

        return 'images';
      },
    });

    expect(bucketCalls).toBe(0);

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['lazy'], 'photo.jpg', { type: 'image/jpeg' })],
    });
    expect(uploadResponse.status).toBe(200);

    bucketCalls = 0;
    const result = await router.request('/assets/objects/photo.jpg');
    expect(result.status).toBe(200);
    const result2 = await router.request('/assets/objects/photo.jpg');
    expect(result2.status).toBe(200);
    expect(bucketCalls).toBe(2);
  });
});

describe('StaticAsset controller — raw nested object paths', () => {
  test('a raw nested path resolves and the encoded form keeps working', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, rawObjectPath: true });

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['nested'], 'photo.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'photos/2024' },
    });
    expect(uploadResponse.status).toBe(200);

    const rawResponse = await router.request('/assets/objects/photos/2024/photo.jpg');
    expect(rawResponse.status).toBe(200);
    const result = await rawResponse.text();
    expect(result).toBe('nested');

    const encodedResponse = await router.request(
      `/assets/objects/${encodeURIComponent('photos/2024/photo.jpg')}`,
    );
    expect(encodedResponse.status).toBe(200);
    const result2 = await encodedResponse.text();
    expect(result2).toBe('nested');
  });

  test('both options: the object URL and the upload link carry neither bucket nor encoded slash', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, bucket: 'images', rawObjectPath: true });

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['nested'], 'photo.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'photos/2024' },
    });
    expect(uploadResponse.status).toBe(200);

    const result = await uploadResponse.json();
    const uploaded = result as Array<{ link: string }>;
    expect(uploaded[0].link).toBe('/assets/objects/photos/2024/photo.jpg');

    const getResponse = await router.request(uploaded[0].link);
    expect(getResponse.status).toBe(200);
    const result2 = await getResponse.text();
    expect(result2).toBe('nested');
  });

  /**
   * The pair is what pins the boundary: `isValidPath` measures `segments.length - 1` and rejects on
   * `>`, so only a path AT the cap passing and the next one failing tells the two readings apart.
   */
  test('maxFolderDepth counts folders, not segments: at the cap resolves, one deeper is a 400', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      rawObjectPath: true,
      serverUpload: { maxFolderDepth: 2 },
    });

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['at-cap'], 'photo.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'photos/2024' },
    });
    expect(uploadResponse.status).toBe(200);

    // Two folders plus the filename is depth 2 - the cap itself, which must resolve.
    const atCap = await router.request('/assets/objects/photos/2024/photo.jpg');
    expect(atCap.status).toBe(200);
    const result = await atCap.text();
    expect(result).toBe('at-cap');

    const overCap = await router.request('/assets/objects/a/b/c/photo.jpg');
    expect(overCap.status).toBe(400);

    const body = await readJson(overCap);
    expect(body.normalized?.code).toBe('core.static_asset.object_name_invalid');
  });

  test('a configured maxFolderDepth still rejects a deeper raw path', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      rawObjectPath: true,
      serverUpload: { maxFolderDepth: 1 },
    });

    const response = await router.request('/assets/objects/a/b/c/photo.jpg');
    expect(response.status).toBe(400);

    const body = await readJson(response);
    expect(body.normalized?.code).toBe('core.static_asset.object_name_invalid');
    expect(helper.calls.filter((call) => ['getObject', 'getStat'].includes(call.method))).toEqual(
      [],
    );
  });
});

describe('StaticAsset controller — the OpenAPI document', () => {
  /** The catch-all is written inside the OpenAPI path string, so the document must still generate. */
  const documentPaths = async (opts: { rawObjectPath?: boolean }): Promise<string[]> => {
    const router = await mountAssetController({ helper: new FakeStorageHelper(), ...opts });
    const document = router.getOpenAPIDocument({
      openapi: '3.1.0',
      info: { title: 'assets', version: '1.0.0' },
    });

    return Object.keys(document.paths ?? {});
  };

  test('every option combination produces a document', async () => {
    const result = await documentPaths({});
    expect(result).toContain('/assets/objects/{objectName}');
    const result2 = await documentPaths({ rawObjectPath: true });
    expect(result2).toContain('/assets/objects/{objectName}{.+}');
  });

  test('file-stream and JSON routes reference the one ErrorResponse component under 4XX and 5XX', async () => {
    const router = await mountAssetController({ helper: new FakeStorageHelper() });
    const document = router.getOpenAPIDocument({
      openapi: '3.1.0',
      info: { title: 'assets', version: '1.0.0' },
    });
    const errorContent = {
      'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
    };

    for (const path of ['/assets/objects/{objectName}', '/assets/objects']) {
      const responses = document.paths?.[path]?.get?.responses ?? {};

      expect(Object.keys(responses).sort()).toEqual(['200', '4XX', '5XX']);
      expect(responses['4XX']).toMatchObject({ content: errorContent });
      expect(responses['5XX']).toMatchObject({ content: errorContent });
    }

    expect(document.components?.schemas?.ErrorResponse).toMatchObject({ type: 'object' });
  });
});

describe('StaticAsset controller — strict routing', () => {
  /** The controller always routes strictly, so every other test runs under it too; this one pins the catch-all in particular. */
  test('the catch-all resolves under the strict router', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      bucket: 'images',
      rawObjectPath: true,
    });

    await uploadFiles({
      router,
      files: [new File(['strict'], 'photo.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'photos/2024' },
    });

    const response = await router.request('/assets/objects/photos/2024/photo.jpg');
    expect(response.status).toBe(200);
    const result = await response.text();
    expect(result).toBe('strict');
  });
});

describe('StaticAsset controller - extend.before wins a path collision', () => {
  test('a literal route registered before the catch-all answers its own path, and the catch-all still serves the rest', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      bucket: 'images',
      rawObjectPath: true,
      extend: {
        before: ({ controller }) => {
          controller.defineRoute({
            configs: {
              method: 'get',
              path: '/objects/i18n',
              responses: { 200: { description: 'translations' } },
            },
            handler: (context) => context.json({ translations: true }),
          });
        },
      },
    });

    const literal = await router.request('/assets/objects/i18n');
    expect(literal.status).toBe(200);
    const result = await literal.json();
    expect(result).toEqual({ translations: true });

    // A configured bucket serves the upload at `/assets/objects`, not the bucket-in-path default.
    const uploaded = await uploadFiles({
      router,
      files: [new File(['nested'], 'photo.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'photos/2024' },
    });
    expect(uploaded.status).toBe(200);

    const object = await router.request('/assets/objects/photos/2024/photo.jpg');
    expect(object.status).toBe(200);
    const result2 = await object.text();
    expect(result2).toBe('nested');
  });

  test('the same route registered after the catch-all never answers (the collision rule)', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      bucket: 'images',
      rawObjectPath: true,
      extend: {
        after: ({ controller }) => {
          controller.defineRoute({
            configs: {
              method: 'get',
              path: '/objects/i18n',
              responses: { 200: { description: 'translations' } },
            },
            handler: (context) => context.json({ translations: true }),
          });
        },
      },
    });

    const shadowed = await router.request('/assets/objects/i18n');
    expect(shadowed.status).not.toBe(200);
  });
});

describe('StaticAsset controller - byte ranges make a stored object seekable', () => {
  const buildRouter = async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });
    await uploadFiles({
      router,
      files: [new File(['0123456789'], 'clip.mp4')],
    });

    return router;
  };

  test('a full request advertises range support', async () => {
    const router = await buildRouter();

    const response = await router.request('/assets/objects/clip.mp4');

    expect(response.status).toBe(200);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-length')).toBe('10');
  });

  test('a byte range answers 206 with only those bytes', async () => {
    const router = await buildRouter();

    const response = await router.request('/assets/objects/clip.mp4', {
      headers: { range: 'bytes=2-5' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('content-length')).toBe('4');
    const result = await response.text();
    expect(result).toBe('2345');
  });

  test('an open-ended range runs to the last byte', async () => {
    const router = await buildRouter();

    const response = await router.request('/assets/objects/clip.mp4', {
      headers: { range: 'bytes=7-' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 7-9/10');
    const result = await response.text();
    expect(result).toBe('789');
  });

  /** `bytes=-3` is the LAST three bytes, not the first three - reading it the other way serves wrong data. */
  test('a suffix range counts back from the end', async () => {
    const router = await buildRouter();

    const response = await router.request('/assets/objects/clip.mp4', {
      headers: { range: 'bytes=-3' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 7-9/10');
    const result = await response.text();
    expect(result).toBe('789');
  });

  const ignoredRanges = ['bytes=20-30', 'bytes=5-2', 'lines=1-2', 'bytes=abc'];

  test.each(ignoredRanges)('an unusable range %s serves the whole object', async (header) => {
    const router = await buildRouter();

    const response = await router.request('/assets/objects/clip.mp4', {
      headers: { range: header },
    });

    expect(response.status).toBe(200);
    const result = await response.text();
    expect(result).toBe('0123456789');
  });
});

describe('the upload route refuses a file over maxBytes', () => {
  /** Without a ceiling the ordinary upload accepted any size, while `directUpload` had one all along. */
  test('a file over the ceiling is refused with 413, and nothing is stored', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, serverUpload: { maxBytes: 16 } });

    const response = await uploadFiles({
      router,
      files: [new File(['x'.repeat(64)], 'big.png', { type: 'image/png' })],
    });

    expect(response.status).toBe(413);
    expect(helper.hasObject({ bucket: { name: 'images' }, object: { key: 'big.png' } })).toBe(
      false,
    );
  });

  test('a file at the ceiling is accepted', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, serverUpload: { maxBytes: 16 } });

    const response = await uploadFiles({
      router,
      files: [new File(['x'.repeat(16)], 'ok.png', { type: 'image/png' })],
    });

    expect(response.status).toBe(200);
  });

  /**
   * The early exit: a body declaring more than the ceiling is refused before it is read, so a
   * 500 MB upload is not first held in memory to then be rejected.
   */
  test('a declared content-length over the ceiling is refused before parsing', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, serverUpload: { maxBytes: 16 } });

    const boundary = '----ignis-test-boundary';
    const body =
      `--${boundary}\r\n` +
      'content-disposition: form-data; name="files"; filename="big.png"\r\n' +
      'content-type: image/png\r\n\r\n' +
      'x'.repeat(64) +
      `\r\n--${boundary}--\r\n`;

    const response = await router.request('/assets/objects', {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(body.length),
      },
      body,
    });

    expect(response.status).toBe(413);
    // The MESSAGE is what pins which check fired - the per-file one would also answer 413 here,
    // so asserting the status alone cannot tell the early exit from the late one.
    const result = await response.json();
    expect(JSON.stringify(result)).toContain('Request body of');
    expect(helper.calls.some((call) => call.method === 'upload')).toBe(false);
  });

  /** The ceiling is opt-in: an application that sets nothing keeps the behaviour it had. */
  test('with no maxBytes a large file still uploads', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    const response = await uploadFiles({
      router,
      files: [new File(['x'.repeat(4096)], 'huge.png', { type: 'image/png' })],
    });

    expect(response.status).toBe(200);
  });
});

describe('the upload labels carry a display order', () => {
  /** Ordering is per principal - the images of one product, not of the whole table. */
  test('sequence reaches the row as a number', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const router = await mountAssetController({
      helper,
      metaLink: {
        repository: {
          create: async (opts: { data: Record<string, unknown> }) => {
            created.push(opts.data);

            return { count: 1, data: { id: 'meta-1', ...opts.data } };
          },
        } as never,
      },
    });

    await uploadFiles({
      router,
      files: [new File(['x'], 'a.png', { type: 'image/png' })],
      labels: { principalType: 'Product', principalId: '42', sequence: '3' },
    });

    expect(created[0]).toMatchObject({ principalType: 'Product', sequence: 3 });
  });

  /** Absent leaves the column default, so a row nobody ordered looks like a legacy one. */
  test('with no sequence the column is left alone', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const router = await mountAssetController({
      helper,
      metaLink: {
        repository: {
          create: async (opts: { data: Record<string, unknown> }) => {
            created.push(opts.data);

            return { count: 1, data: { id: 'meta-1', ...opts.data } };
          },
        } as never,
      },
    });

    await uploadFiles({
      router,
      files: [new File(['x'], 'a.png', { type: 'image/png' })],
      labels: { principalType: 'Product', principalId: '42' },
    });

    expect(created[0].sequence).toBeUndefined();
  });
});

describe('labels travel in the body, and a label in the URL is ignored', () => {
  const captureRepository = (created: Array<Record<string, unknown>>) =>
    ({
      create: async (opts: { data: Record<string, unknown> }) => {
        created.push(opts.data);

        return { count: 1, data: { id: 'meta-1', ...opts.data } };
      },
    }) as never;

  test('a label in the query changes nothing: the upload succeeds and the row carries none', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const router = await mountAssetController({
      helper,
      metaLink: { repository: captureRepository(created) },
    });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'a.png', { type: 'image/png' })],
      uploadPath: '/assets/objects?principalType=Product&principalId=42',
    });

    expect(response.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0].principalType).toBeUndefined();
    expect(created[0].principalId).toBeUndefined();
  });

  test('the same labels in the body are recorded', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const router = await mountAssetController({
      helper,
      metaLink: { repository: captureRepository(created) },
    });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'a.png', { type: 'image/png' })],
      labels: { principalType: 'Product', principalId: '42', sequence: '3' },
    });

    expect(response.status).toBe(200);
    expect(created[0]).toMatchObject({ principalType: 'Product', principalId: '42', sequence: 3 });
  });

  test('a sequence that is not an integer is a validation error, and nothing is stored', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const router = await mountAssetController({
      helper,
      metaLink: { repository: captureRepository(created) },
    });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'a.png', { type: 'image/png' })],
      labels: { principalType: 'Product', sequence: '3.5' },
    });

    expect(response.status).toBe(422);
    expect(created).toEqual([]);
    expect(helper.calls.filter((call) => call.method === 'writeObject')).toEqual([]);
  });

  test('RECREATE_METALINK ignores a label in the query, so the refreshed row keeps its own', async () => {
    const helper = new FakeStorageHelper();
    const metaLinkRepository = new FakeMetaLinkRepository();
    const router = await mountAssetController({
      helper,
      metaLink: { repository: metaLinkRepository as AnyType },
    });

    await uploadFiles({
      router,
      files: [new File(['x'], 'a.png', { type: 'image/png' })],
      labels: { principalId: '7' },
    });

    const response = await router.request('/assets/meta-links/a.png?principalId=42', {
      method: 'PUT',
    });

    expect(response.status).toBe(200);
    expect(metaLinkRepository.rows.map((row) => row['principalId'])).toEqual(['7']);
  });
});

describe('StaticAsset controller - the folder is checked by the storage helper', () => {
  const mountPlain = async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    return { helper, router };
  };

  test.each([
    ['a traversal', '../escape'],
    ['a segment the storage cannot hold', 'a;b'],
  ])(
    '%s is core.storage.folder_path_invalid, and nothing is written',
    async (_label, folderPath) => {
      const { helper, router } = await mountPlain();

      const response = await uploadFiles({
        router,
        files: [new File(['one'], 'a.jpg', { type: 'image/jpeg' })],
        labels: { folderPath },
      });

      expect(response.status).toBe(400);
      const body = await readJson(response);
      expect(body.normalized?.code).toBe('core.storage.folder_path_invalid');
      expect(helper.calls.filter((call) => call.method === 'writeObject')).toEqual([]);
    },
  );

  test('a folder deeper than serverUpload.maxFolderDepth is core.storage.folder_depth_exceeded', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, serverUpload: { maxFolderDepth: 2 } });

    const response = await uploadFiles({
      router,
      files: [new File(['one'], 'a.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'a/b/c' },
    });

    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.normalized?.code).toBe('core.storage.folder_depth_exceeded');
    expect(helper.calls.filter((call) => call.method === 'writeObject')).toEqual([]);
  });

  test('a folder at the cap is accepted', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, serverUpload: { maxFolderDepth: 2 } });

    const response = await uploadFiles({
      router,
      files: [new File(['one'], 'a.jpg', { type: 'image/jpeg' })],
      labels: { folderPath: 'a/b' },
    });

    expect(response.status).toBe(200);
  });
});

describe('StaticAsset controller - the part limit', () => {
  const make = (count: number) =>
    Array.from({ length: count }, (_unused, index) => {
      return new File([`file-${index}`], `f${index}.jpg`, { type: 'image/jpeg' });
    });

  test('more files than serverUpload.maxFiles is refused with 413, and nothing is written', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, serverUpload: { maxFiles: 3 } });

    const response = await uploadFiles({ router, files: make(4) });

    expect(response.status).toBe(413);
    expect(helper.calls.filter((call) => call.method === 'writeObject')).toEqual([]);
  });

  test('the default limit is 20 parts, and a request within it still uploads', async () => {
    const router = await mountAssetController({ helper: new FakeStorageHelper() });

    const tooMany = await uploadFiles({ router, files: make(21) });
    const allowed = await uploadFiles({ router, files: make(20) });

    expect(tooMany.status).toBe(413);
    expect(allowed.status).toBe(200);
  });
});
