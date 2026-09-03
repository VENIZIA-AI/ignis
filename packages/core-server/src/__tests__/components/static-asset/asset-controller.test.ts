import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { AssetControllerFactory } from '@/components/static-asset/controller';
import type { TMetaLinkConfig, TStaticAssetExtraOptions } from '@/components/static-asset/common';
import { StaticAssetStorageTypes } from '@/components/static-asset/common';
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
}): Promise<OpenAPIHono> => {
  const { helper, options, isStrict = false, metaLink } = opts;

  MetadataRegistry.getInstance().clearAll();
  const application = new TestApplication({ scope: 'StaticAssetTestApp', config: TEST_CONFIGS });
  application.init();

  const AssetController = AssetControllerFactory.defineAssetController({
    controller: { name: 'TestAssetController', basePath: '/assets', isStrict },
    storage: StaticAssetStorageTypes.DISK,
    helper,
    options,
    useMetaLink: Boolean(metaLink),
    metaLink,
  });

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
  query?: string;
  fieldName?: string;
}): Promise<Response> => {
  const { router, files, query = '', fieldName = 'files' } = opts;
  const formData = new FormData();

  for (const file of files) {
    formData.append(fieldName, file);
  }

  return router.request(`/assets/buckets/images/upload${query}`, {
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
        ['getFile', 'getStat'].includes(call.method),
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
      const response = await router.request(`/assets/buckets/images/download/${objectName}`);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(helper.calls.filter(call => ['getFile', 'getStat'].includes(call.method))).toEqual([]);
    });
  }

  /** The controller decodes NOTHING - Hono already did, and a second decode made `report_100%.pdf` permanently unfetchable. A double-encoded payload is therefore a literal filename containing percent signs, not a traversal: it must neither escape the bucket nor be mistaken for `../`. */
  test('a double-encoded traversal payload is a LITERAL name, not a traversal', async () => {
    const response = await router.request(
      '/assets/buckets/images/objects/%252e%252e%252fetc%252fpasswd',
    );

    // Not found, because no such object exists - not a 200, and not an escape.
    expect(response.status).toBeGreaterThanOrEqual(400);

    const storageCalls = helper.calls.filter(call => ['getFile', 'getStat'].includes(call.method));

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

    const response = await router.request('/assets/buckets/images/download/report.pdf');
    expect(response.status).toBe(200);

    const disposition = response.headers.get('content-disposition') ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('filename="report.pdf"');
    expect(disposition).not.toContain('\r');
    expect(disposition).not.toContain('\n');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
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
    const response = await router.request('/assets/buckets/images/upload', {
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
    expect(helper.hasObject({ bucket: 'images', name: 'bad.txt' })).toBe(false);
  });

  test('custom normalizeNameFn receives the requested folderPath', async () => {
    const seen: Array<{ originalName: string; folderPath?: string }> = [];
    const localHelper = new FakeStorageHelper();
    const localRouter = await mountAssetController({
      helper: localHelper,
      options: {
        normalizeNameFn: opts => {
          seen.push({ originalName: opts.originalName, folderPath: opts.folderPath });
          return opts.folderPath ? `${opts.folderPath}/${opts.originalName}` : opts.originalName;
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

    const uploaded = (await uploadResponse.json()) as Array<{ objectName: string }>;
    expect(uploaded[0].objectName).toBe('photos/2024/photo.jpg');

    const getResponse = await router.request(
      `/assets/buckets/images/objects/${encodeURIComponent(uploaded[0].objectName)}`,
    );
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('nested');
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
