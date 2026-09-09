import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { AssetControllerFactory } from '@/components/static-asset/controller';
import type {
  TDefineExtraRoutes,
  TMetaLinkConfig,
  TResolveObjectName,
  TStaticAssetExtraOptions,
} from '@/components/static-asset/common';
import { StaticAssetStorageTypes } from '@/components/static-asset/common';
import { jsonResponse } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { AppErrorMiddleware } from '@/base/middlewares';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeStorageHelper } from './fake-storage.helper';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
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
  return (await response.json()) as Record<string, any>;
};

/** Minimal in-memory stand-in for the MetaLink repository (create/findOne/findById/updateById/deleteAll). */
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
      this.rows.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) ??
      null
    );
  }

  async findById(opts: { id: string }) {
    return this.rows.find(row => row['id'] === opts.id) ?? null;
  }

  async updateById(opts: { id: string; data: Record<string, AnyType> }) {
    const row = this.rows.find(item => item['id'] === opts.id);

    if (!row) {
      return { count: 0, data: null };
    }

    Object.assign(row, opts.data);
    return { count: 1, data: row };
  }

  async deleteAll(opts: { where?: Record<string, AnyType> }) {
    const where = opts.where ?? {};
    const kept = this.rows.filter(
      row => !Object.entries(where).every(([key, value]) => row[key] === value),
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
  options?: TStaticAssetExtraOptions;
  isStrict?: boolean;
  metaLink?: TMetaLinkConfig;
  resolveObjectName?: TResolveObjectName;
  defineRoutesBefore?: TDefineExtraRoutes;
  defineExtraRoutes?: TDefineExtraRoutes;
  bucket?: string | (() => string);
  rawObjectPath?: boolean;
}): Promise<OpenAPIHono> => {
  const {
    helper,
    options,
    isStrict = false,
    metaLink,
    resolveObjectName,
    defineRoutesBefore,
    defineExtraRoutes,
    bucket,
    rawObjectPath,
  } = opts;

  MetadataRegistry.getInstance().clearAll();
  const application = new TestApplication({ scope: 'StaticAssetTestApp', config: TEST_CONFIGS });
  application.init();

  const AssetController = AssetControllerFactory.defineAssetController({
    controller: {
      name: 'TestAssetController',
      basePath: '/assets',
      isStrict,
      bucket,
      rawObjectPath,
    },
    storage: StaticAssetStorageTypes.DISK,
    helper,
    options,
    useMetaLink: Boolean(metaLink),
    metaLink,
    resolveObjectName,
    defineRoutesBefore,
    defineExtraRoutes,
  });

  application.controller(AssetController);
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());
  return server;
};

/** Uploads `files` through the multipart endpoint. `uploadPath` follows the controller's URL shape - a configured bucket serves `/assets/objects`. */
const uploadFiles = async (opts: {
  router: OpenAPIHono;
  files: File[];
  query?: string;
  fieldName?: string;
  uploadPath?: string;
}): Promise<Response> => {
  const {
    router,
    files,
    query = '',
    fieldName = 'files',
    uploadPath = '/assets/buckets/images/objects',
  } = opts;
  const formData = new FormData();

  for (const file of files) {
    formData.append(fieldName, file);
  }

  return router.request(`${uploadPath}${query}`, {
    method: 'POST',
    body: formData,
  });
};

describe('StaticAsset controller — path traversal hardening', () => {
  let helper: FakeStorageHelper;
  let router: OpenAPIHono;

  beforeEach(async () => {
    helper = new FakeStorageHelper();
    router = await mountAssetController({ helper });
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

  for (const [label, objectName] of maliciousObjectNames) {
    test(`GET object rejects ${label} without reaching storage`, async () => {
      const response = await router.request(`/assets/buckets/images/objects/${objectName}`);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);

      const reachedStorage = helper.calls.filter(call =>
        ['getObject', 'getStat'].includes(call.method),
      );
      expect(reachedStorage).toEqual([]);
    });

    test(`DELETE object rejects ${label} without reaching storage`, async () => {
      const response = await router.request(`/assets/buckets/images/objects/${objectName}`, {
        method: 'DELETE',
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(helper.calls.filter(call => call.method === 'removeObject')).toEqual([]);
    });

    test(`DOWNLOAD object rejects ${label} without reaching storage`, async () => {
      const response = await router.request(`/assets/buckets/images/downloads/${objectName}`);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(helper.calls.filter(call => ['getObject', 'getStat'].includes(call.method))).toEqual(
        [],
      );
    });
  }

  /** The controller decodes NOTHING - Hono already did, and a second decode made `report_100%.pdf` permanently unfetchable. A double-encoded payload is therefore a literal filename containing percent signs, not a traversal: it must neither escape the bucket nor be mistaken for `../`. */
  test('a double-encoded traversal payload is a LITERAL name, not a traversal', async () => {
    const response = await router.request(
      '/assets/buckets/images/objects/%252e%252e%252fetc%252fpasswd',
    );

    // Not found, because no such object exists - not a 200, and not an escape.
    expect(response.status).toBeGreaterThanOrEqual(400);

    const storageCalls = helper.calls.filter(call =>
      ['getObject', 'getStat'].includes(call.method),
    );

    for (const call of storageCalls) {
      const name = String((call as AnyType).args?.name ?? '');

      // The name that reached storage is the literal, still-encoded string: no `..`, no separator.
      expect(name).not.toContain('..');
      expect(name).not.toContain('/etc/');
    }
  });

  test('bucket name traversal is rejected before storage', async () => {
    const response = await router.request('/assets/buckets/%2e%2e%2fsecret/objects/photo.jpg');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(helper.calls).toEqual([]);
  });

  test('CREATE bucket rejects traversal name before storage', async () => {
    const response = await router.request('/assets/buckets/%2e%2e%2fetc', { method: 'POST' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(helper.calls.filter(call => call.method === 'createBucket')).toEqual([]);
  });

  test('valid object name is served', async () => {
    const response = await router.request('/assets/buckets/images/objects/photo.jpg');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
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

    const response = await router.request('/assets/buckets/images/downloads/report.pdf');
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
    ['GET', '/assets/buckets/images/objects/absent.jpg'],
    ['DOWNLOAD', '/assets/buckets/images/downloads/absent.jpg'],
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

    const response = await router.request('/assets/buckets/images/objects/photo.jpg');
    expect(response.status).toBe(500);
  });

  test('an object that exists still answers 200', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });
    await uploadFiles({ router, files: [new File(['hello'], 'photo.jpg')] });

    const response = await router.request('/assets/buckets/images/objects/photo.jpg');
    expect(response.status).toBe(200);
  });

  /** Deliberately unchanged: S3 deletes idempotently and consumers already depend on the 200. */
  test('DELETE of an object that was never there still answers 200', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    const response = await router.request('/assets/buckets/images/objects/absent.jpg', {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);
    expect(helper.calls.filter(call => call.method === 'removeObject')).toHaveLength(1);
  });
});

describe('StaticAsset controller - a stored object never renders on the API origin', () => {
  /**
   * Serving an uploaded file as a renderable type on the API's own origin is stored XSS: the script
   * runs with the application's cookies. `nosniff` cannot help, because the type is declared here.
   */
  const renderableExtensions = ['payload.html', 'payload.svg', 'payload.xhtml', 'payload.xml'];

  test.each(renderableExtensions)('%s is not served as a renderable type', async fileName => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });
    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['<script>alert(1)</script>'], fileName)],
    });
    expect(uploadResponse.status).toBe(200);

    const response = await router.request(`/assets/buckets/images/objects/${fileName}`);
    expect(response.status).toBe(200);

    const served = response.headers.get('content-type') ?? '';
    expect(served).toContain(HTTP.HeaderValues.APPLICATION_OCTET_STREAM);
    expect(response.headers.get('content-disposition') ?? '').toContain('attachment');
  });

  test('an image is still served with its own type, so the fix does not break display', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });
    await uploadFiles({ router, files: [new File(['binary'], 'photo.png')] });

    const response = await router.request('/assets/buckets/images/objects/photo.png');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type') ?? '').toContain('image/png');
  });

  /** The served type is decided from the object name, so a backend reporting nothing still serves right. */
  test('the type comes from the object name, not from what the backend reports', async () => {
    const helper = new FakeStorageHelper();
    helper.statMetadataOverride = { 'content-type': 'text/html' };
    const router = await mountAssetController({ helper });
    await uploadFiles({ router, files: [new File(['binary'], 'photo.png')] });

    const response = await router.request('/assets/buckets/images/objects/photo.png');
    expect(response.headers.get('content-type') ?? '').toContain('image/png');
  });
});

describe('StaticAsset controller — multipart upload edge cases', () => {
  let helper: FakeStorageHelper;
  let router: OpenAPIHono;

  beforeEach(async () => {
    helper = new FakeStorageHelper();
    router = await mountAssetController({ helper });
  });

  test('empty file (0 bytes) is a clean 400, not a 500', async () => {
    const response = await uploadFiles({
      router,
      files: [new File([], 'empty.txt', { type: 'text/plain' })],
    });

    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(String(body.message)).not.toContain('Invalid file size');
    expect(helper.calls.filter(call => call.method === 'writeObject')).toEqual([]);
  });

  test('missing file field is a clean 4xx, not a silent empty 200', async () => {
    const response = await router.request('/assets/buckets/images/objects', {
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
    expect(helper.calls.filter(call => call.method === 'writeObject')).toEqual([]);
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

  test('custom normalizeNameFn receives the requested folderPath', async () => {
    const seen: Array<{ originalName: string; folderPath?: string }> = [];
    const localHelper = new FakeStorageHelper();
    const localRouter = await mountAssetController({
      helper: localHelper,
      options: {
        normalizeNameFn: ({ file }) => {
          seen.push({ originalName: file.originalName, folderPath: file.folderPath });
          return file.folderPath ? `${file.folderPath}/${file.originalName}` : file.originalName;
        },
      },
    });

    const response = await uploadFiles({
      router: localRouter,
      files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })],
      query: '?folderPath=photos/2024',
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
    router = await mountAssetController({ helper });
    await uploadFiles({ router, files: [new File(['a'], 'a.txt', { type: 'text/plain' })] });
    helper.reset();
  });

  test('non numeric maxKeys is rejected instead of silently becoming NaN', async () => {
    const response = await router.request('/assets/buckets/images/objects?maxKeys=abc');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    const listCalls = helper.calls.filter(call => call.method === 'listObjects');
    expect(listCalls).toEqual([]);
  });

  test('maxKeys=0 is not silently treated as unlimited', async () => {
    const response = await router.request('/assets/buckets/images/objects?maxKeys=0');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(helper.calls.filter(call => call.method === 'listObjects')).toEqual([]);
  });

  test('valid maxKeys is forwarded as a number', async () => {
    const response = await router.request('/assets/buckets/images/objects?maxKeys=5');
    expect(response.status).toBe(200);

    const listCall = helper.calls.find(call => call.method === 'listObjects');
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
      query: '?folderPath=photos/2024',
    });
    expect(uploadResponse.status).toBe(200);

    const uploaded = (await uploadResponse.json()) as Array<{ object: { key: string } }>;
    expect(uploaded[0].object.key).toBe('photos/2024/photo.jpg');

    const getResponse = await router.request(
      `/assets/buckets/images/objects/${encodeURIComponent(uploaded[0].object.key)}`,
    );
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('nested');

    // The URL contract: `{objectName}` is ONE segment, so a RAW nested path 404s and only the
    // percent-encoded form resolves. A consumer whose stored links carry the raw form needs its own route.
    const rawResponse = await router.request(
      `/assets/buckets/images/objects/${uploaded[0].object.key}`,
    );
    expect(rawResponse.status).toBe(404);
  });

  test('the RECREATE_METALINK fallback link resolves back to the object route', async () => {
    const helper = new FakeStorageHelper();
    const metaLinkRepository = new FakeMetaLinkRepository();
    const router = await mountAssetController({
      helper,
      metaLink: { model: {} as AnyType, repository: metaLinkRepository as AnyType },
    });

    await uploadFiles({
      router,
      files: [new File(['nested'], 'photo.jpg', { type: 'image/jpeg' })],
      query: '?folderPath=photos/2024',
    });

    const recreateResponse = await router.request(
      `/assets/buckets/images/meta-links/${encodeURIComponent('photos/2024/photo.jpg')}`,
      { method: 'PUT' },
    );
    expect(recreateResponse.status).toBe(200);

    const body = await readJson(recreateResponse);
    const link = String(body.metaLink?.link ?? '');
    expect(link).not.toBe('');

    const linkResponse = await router.request(link);
    expect(linkResponse.status).toBe(200);
    expect(await linkResponse.text()).toBe('nested');
  });
});

describe('StaticAsset controller — disk-buffered multipart storage', () => {
  test('parseMultipartBody storage "disk" must not upload a zero-byte object', async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), 'ignis-static-asset-'));

    try {
      const helper = new FakeStorageHelper();
      const router = await mountAssetController({
        helper,
        options: { parseMultipartBody: { storage: 'disk', uploadDir } },
      });

      const response = await uploadFiles({
        router,
        files: [new File(['real-content'], 'photo.jpg', { type: 'image/jpeg' })],
      });
      expect(response.status).toBe(200);

      const writeCall = helper.calls.find(call => call.method === 'writeObject');
      expect(writeCall?.args['bufferLength']).toBe('real-content'.length);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });
});

describe('StaticAsset controller — resolveObjectName hook', () => {
  test('no hook keeps the generated name', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'My Photo.JPG', { type: 'image/jpeg' })],
    });
    expect(response.status).toBe(200);

    const uploaded = (await response.json()) as Array<{ object: { key: string } }>;
    expect(uploaded[0].object.key).toBe('my_photo.jpg');
    expect(helper.hasObject({ bucket: { name: 'images' }, object: { key: 'my_photo.jpg' } })).toBe(
      true,
    );
  });

  test('a hook returning a fixed name stores the object under it', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      resolveObjectName: () => 'fixed-name.bin',
    });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'My Photo.JPG', { type: 'image/jpeg' })],
    });
    expect(response.status).toBe(200);

    const uploaded = (await response.json()) as Array<{ object: { key: string } }>;
    expect(uploaded[0].object.key).toBe('fixed-name.bin');
    expect(
      helper.hasObject({ bucket: { name: 'images' }, object: { key: 'fixed-name.bin' } }),
    ).toBe(true);
    expect(helper.hasObject({ bucket: { name: 'images' }, object: { key: 'my_photo.jpg' } })).toBe(
      false,
    );
  });

  test('the hook is offered the file, the default key and the bucket', async () => {
    const seen: Array<Parameters<TResolveObjectName>[0]> = [];
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      resolveObjectName: hookOptions => {
        seen.push({ ...hookOptions });
        return hookOptions.file.originalName;
      },
    });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'My Photo.JPG', { type: 'image/jpeg' })],
      query: '?folderPath=Photos/2024',
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
      query: '?folderPath=Photos/2024',
    });

    const plainUploaded = (await plainResponse.json()) as Array<{ object: { key: string } }>;
    expect(plainUploaded[0].object.key).toBe(seen[0].defaultKey);
  });

  test('a configured normalizeNameFn is what the hook sees as the default key', async () => {
    const seen: Array<string> = [];
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      options: { normalizeNameFn: ({ file }) => `custom-${file.originalName}` },
      resolveObjectName: hookOptions => {
        seen.push(hookOptions.defaultKey);
        return hookOptions.defaultKey;
      },
    });

    const response = await uploadFiles({
      router,
      files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })],
    });
    expect(response.status).toBe(200);
    expect(seen).toEqual(['custom-photo.jpg']);
  });
});

describe('StaticAsset controller — defineExtraRoutes hook', () => {
  test('the hook runs once and its route answers', async () => {
    const helper = new FakeStorageHelper();
    let callCount = 0;

    const router = await mountAssetController({
      helper,
      defineExtraRoutes: ({ controller, basePath }) => {
        callCount += 1;
        controller.defineRoute({
          configs: {
            method: 'get',
            path: '/health',
            responses: jsonResponse({ schema: z.object({ basePath: z.string() }) }),
          },
          handler: context => context.json({ basePath }, HTTP.ResultCodes.RS_2.Ok),
        });
      },
    });

    expect(callCount).toBe(1);

    const response = await router.request('/assets/health');
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ basePath: '/assets' });
  });

  test('the built-in routes still answer with both hooks set', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      resolveObjectName: hookOptions => `scoped/${hookOptions.defaultKey}`,
      defineExtraRoutes: ({ controller, helper: hookHelper }) => {
        controller.defineRoute({
          configs: {
            method: 'get',
            path: '/health',
            responses: jsonResponse({ schema: z.object({ buckets: z.number() }) }),
          },
          handler: async context => {
            const buckets = await hookHelper.getBuckets();
            return context.json({ buckets: buckets.length }, HTTP.ResultCodes.RS_2.Ok);
          },
        });
      },
    });

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['both'], 'photo.jpg', { type: 'image/jpeg' })],
    });
    expect(uploadResponse.status).toBe(200);

    const uploaded = (await uploadResponse.json()) as Array<{ object: { key: string } }>;
    expect(uploaded[0].object.key).toBe('scoped/photo.jpg');

    const objectResponse = await router.request(
      `/assets/buckets/images/objects/${encodeURIComponent('scoped/photo.jpg')}`,
    );
    expect(objectResponse.status).toBe(200);
    expect(await objectResponse.text()).toBe('both');

    const listResponse = await router.request('/assets/buckets/images/objects');
    expect(listResponse.status).toBe(200);

    const healthResponse = await router.request('/assets/health');
    expect(healthResponse.status).toBe(200);
    expect(await readJson(healthResponse)).toEqual({ buckets: 1 });
  });
});

describe('StaticAsset controller — a configured bucket', () => {
  test('object routes drop the bucket segment and the management routes are absent', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, bucket: 'images' });

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['single'], 'photo.jpg', { type: 'image/jpeg' })],
      uploadPath: '/assets/objects',
    });
    expect(uploadResponse.status).toBe(200);

    const getResponse = await router.request('/assets/objects/photo.jpg');
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('single');

    const listResponse = await router.request('/assets/objects');
    expect(listResponse.status).toBe(200);

    // The bucket-in-path shape is not registered at all.
    expect((await router.request('/assets/buckets/images/objects/photo.jpg')).status).toBe(404);

    // A single-bucket application exposes no bucket management.
    expect((await router.request('/assets/buckets')).status).toBe(404);
    expect((await router.request('/assets/buckets/images')).status).toBe(404);
    expect((await router.request('/assets/buckets/other', { method: 'POST' })).status).toBe(404);
    expect((await router.request('/assets/buckets/images', { method: 'DELETE' })).status).toBe(404);
  });

  test('the default shape keeps the bucket in the URL and the management routes', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper });

    expect((await router.request('/assets/buckets')).status).toBe(200);
    expect((await router.request('/assets/buckets/images')).status).toBe(200);
    expect((await router.request('/assets/objects/photo.jpg')).status).toBe(404);
  });

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
      uploadPath: '/assets/objects',
    });
    expect(uploadResponse.status).toBe(200);

    bucketCalls = 0;
    expect((await router.request('/assets/objects/photo.jpg')).status).toBe(200);
    expect((await router.request('/assets/objects/photo.jpg')).status).toBe(200);
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
      query: '?folderPath=photos/2024',
    });
    expect(uploadResponse.status).toBe(200);

    const rawResponse = await router.request(
      '/assets/buckets/images/objects/photos/2024/photo.jpg',
    );
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe('nested');

    const encodedResponse = await router.request(
      `/assets/buckets/images/objects/${encodeURIComponent('photos/2024/photo.jpg')}`,
    );
    expect(encodedResponse.status).toBe(200);
    expect(await encodedResponse.text()).toBe('nested');
  });

  test('both options: the object URL and the upload link carry neither bucket nor encoded slash', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({ helper, bucket: 'images', rawObjectPath: true });

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['nested'], 'photo.jpg', { type: 'image/jpeg' })],
      query: '?folderPath=photos/2024',
      uploadPath: '/assets/objects',
    });
    expect(uploadResponse.status).toBe(200);

    const uploaded = (await uploadResponse.json()) as Array<{ link: string }>;
    expect(uploaded[0].link).toBe('/assets/objects/photos/2024/photo.jpg');

    const getResponse = await router.request(uploaded[0].link);
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('nested');
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
      options: { maxFolderDepth: 2 },
    });

    const uploadResponse = await uploadFiles({
      router,
      files: [new File(['at-cap'], 'photo.jpg', { type: 'image/jpeg' })],
      query: '?folderPath=photos/2024',
    });
    expect(uploadResponse.status).toBe(200);

    // Two folders plus the filename is depth 2 - the cap itself, which must resolve.
    const atCap = await router.request('/assets/buckets/images/objects/photos/2024/photo.jpg');
    expect(atCap.status).toBe(200);
    expect(await atCap.text()).toBe('at-cap');

    const overCap = await router.request('/assets/buckets/images/objects/a/b/c/photo.jpg');
    expect(overCap.status).toBe(400);

    const body = await readJson(overCap);
    expect(body.normalized?.code).toBe('core.static_asset.object_name_invalid');
  });

  test('a configured maxFolderDepth still rejects a deeper raw path', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      rawObjectPath: true,
      options: { maxFolderDepth: 1 },
    });

    const response = await router.request('/assets/buckets/images/objects/a/b/c/photo.jpg');
    expect(response.status).toBe(400);

    const body = await readJson(response);
    expect(body.normalized?.code).toBe('core.static_asset.object_name_invalid');
    expect(helper.calls.filter(call => ['getObject', 'getStat'].includes(call.method))).toEqual([]);
  });
});

describe('StaticAsset controller — the OpenAPI document', () => {
  /** The catch-all is written inside the OpenAPI path string, so the document must still generate. */
  const documentPaths = async (opts: {
    bucket?: string;
    rawObjectPath?: boolean;
  }): Promise<string[]> => {
    const router = await mountAssetController({ helper: new FakeStorageHelper(), ...opts });
    const document = router.getOpenAPIDocument({
      openapi: '3.1.0',
      info: { title: 'assets', version: '1.0.0' },
    });

    return Object.keys(document.paths ?? {});
  };

  test('every option combination produces a document', async () => {
    expect(await documentPaths({})).toContain('/assets/buckets/{bucketName}/objects/{objectName}');
    expect(await documentPaths({ rawObjectPath: true })).toContain(
      '/assets/buckets/{bucketName}/objects/{objectName}{.+}',
    );
    expect(await documentPaths({ bucket: 'images' })).toContain('/assets/objects/{objectName}');
    expect(await documentPaths({ bucket: 'images', rawObjectPath: true })).toContain(
      '/assets/objects/{objectName}{.+}',
    );
  });

  test('a configured bucket documents no bucket-management path', async () => {
    const paths = await documentPaths({ bucket: 'images' });

    expect(paths).not.toContain('/assets/buckets');
    expect(paths).not.toContain('/assets/buckets/{bucketName}');
  });
});

describe('StaticAsset controller — strict routing', () => {
  /** Every other test mounts with `isStrict: false`; `true` is the factory default an application runs. */
  test('the catch-all resolves under the strict router too', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      bucket: 'images',
      rawObjectPath: true,
      isStrict: true,
    });

    await uploadFiles({
      router,
      files: [new File(['strict'], 'photo.jpg', { type: 'image/jpeg' })],
      query: '?folderPath=photos/2024',
      uploadPath: '/assets/objects',
    });

    const response = await router.request('/assets/objects/photos/2024/photo.jpg');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('strict');
  });
});

describe('StaticAsset controller - defineRoutesBefore wins a path collision', () => {
  test('a literal route registered before the catch-all answers its own path, and the catch-all still serves the rest', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      bucket: 'images',
      rawObjectPath: true,
      defineRoutesBefore: ({ controller }) => {
        controller.defineRoute({
          configs: {
            method: 'get',
            path: '/objects/i18n',
            responses: { 200: { description: 'translations' } },
          },
          handler: context => context.json({ translations: true }),
        });
      },
    });

    const literal = await router.request('/assets/objects/i18n');
    expect(literal.status).toBe(200);
    expect(await literal.json()).toEqual({ translations: true });

    // A configured bucket serves the upload at `/assets/objects`, not the bucket-in-path default.
    const uploaded = await uploadFiles({
      router,
      files: [new File(['nested'], 'photo.jpg', { type: 'image/jpeg' })],
      query: '?folderPath=photos/2024',
      uploadPath: '/assets/objects',
    });
    expect(uploaded.status).toBe(200);

    const object = await router.request('/assets/objects/photos/2024/photo.jpg');
    expect(object.status).toBe(200);
    expect(await object.text()).toBe('nested');
  });

  test('the same route registered after the catch-all never answers (the collision rule)', async () => {
    const helper = new FakeStorageHelper();
    const router = await mountAssetController({
      helper,
      bucket: 'images',
      rawObjectPath: true,
      defineExtraRoutes: ({ controller }) => {
        controller.defineRoute({
          configs: {
            method: 'get',
            path: '/objects/i18n',
            responses: { 200: { description: 'translations' } },
          },
          handler: context => context.json({ translations: true }),
        });
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

    const response = await router.request('/assets/buckets/images/objects/clip.mp4');

    expect(response.status).toBe(200);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-length')).toBe('10');
  });

  test('a byte range answers 206 with only those bytes', async () => {
    const router = await buildRouter();

    const response = await router.request('/assets/buckets/images/objects/clip.mp4', {
      headers: { range: 'bytes=2-5' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('content-length')).toBe('4');
    expect(await response.text()).toBe('2345');
  });

  test('an open-ended range runs to the last byte', async () => {
    const router = await buildRouter();

    const response = await router.request('/assets/buckets/images/objects/clip.mp4', {
      headers: { range: 'bytes=7-' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(await response.text()).toBe('789');
  });

  /** `bytes=-3` is the LAST three bytes, not the first three - reading it the other way serves wrong data. */
  test('a suffix range counts back from the end', async () => {
    const router = await buildRouter();

    const response = await router.request('/assets/buckets/images/objects/clip.mp4', {
      headers: { range: 'bytes=-3' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(await response.text()).toBe('789');
  });

  const ignoredRanges = ['bytes=20-30', 'bytes=5-2', 'lines=1-2', 'bytes=abc'];

  test.each(ignoredRanges)('an unusable range %s serves the whole object', async header => {
    const router = await buildRouter();

    const response = await router.request('/assets/buckets/images/objects/clip.mp4', {
      headers: { range: header },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('0123456789');
  });
});
