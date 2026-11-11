import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import type { TStaticAssetEntry } from '@/components/static-asset/common';
import { StaticAssetControllerFactory } from '@/components/static-asset/controller';
import { StaticAssetEntryUtility } from '@/components/static-asset/utilities/entry.utility';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { DiskHelper } from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports, MetadataRegistry } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import {
  FakeDiskStorageHelper,
  FakeStorageHelper,
  FakeUntypedStorageHelper,
} from './fake-storage.helper';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class EntryApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'entry-app', version: '0.0.0', description: '' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

// The fakes are not the real helpers, and the entry type tells the two apart; `never` is the way across.
const s3Helper: BunS3Helper = new FakeStorageHelper() as never;
const diskHelper: DiskHelper = new FakeDiskStorageHelper() as never;

const SECRET = 'a-secret-nobody-else-has';
const directUpload = {
  use: true,
  secretKey: SECRET,
  maxBytes: 1024,
  validation: { use: false },
} as const;

const resolve = (entry: TStaticAssetEntry, key = 'staticAsset') =>
  StaticAssetEntryUtility.resolve({ key, entry });

/** What the component does at boot: resolve the entry, then build the services its direct upload runs. */
const boot = (entry: TStaticAssetEntry, key = 'staticAsset') => {
  const resolved = resolve(entry, key);

  return StaticAssetEntryUtility.buildDirectUploadServices({ resolved });
};

/** The message a call throws with, or an empty string when it does not throw. */
const messageOf = (call: () => unknown): string => {
  try {
    call();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return '';
};

describe('an entry resolves to its defaults', () => {
  test('the name comes from the key, and an explicit name wins', () => {
    const entry = {
      basePath: '/a',
      bucket: 'images',
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      helper: diskHelper,
    } satisfies TStaticAssetEntry;

    expect(resolve(entry, 'staticAsset').name).toBe('StaticAssetController');
    expect(resolve(entry, 'product-images').name).toBe('ProductImagesController');
    expect(resolve(entry, 'reportController').name).toBe('ReportController');
    expect(resolve({ ...entry, name: 'Mine' }).name).toBe('Mine');
  });

  test('the mount path carries one leading slash, and the object path is encoded', () => {
    const resolved = resolve({
      basePath: 'assets',
      bucket: 'images',
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      helper: diskHelper,
    });

    expect(resolved.basePath).toBe('/assets');
    expect(resolved.rawObjectPath).toBe(false);
  });

  test('the default link is the controller own object route, in one place for every consumer', () => {
    const resolved = resolve({
      basePath: '/assets',
      bucket: 'images',
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      helper: diskHelper,
    });

    const link = resolved.link({ bucket: { name: 'images' }, object: { key: 'a/b c.png' } });

    expect(link).toBe('/assets/objects/a%2Fb%20c.png');
  });

  test('link replaces the default', () => {
    const resolved = resolve({
      basePath: '/assets',
      bucket: 'images',
      link: ({ object }) => `https://cdn.example.com/${object.key}`,
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      helper: diskHelper,
    });

    const link = resolved.link({ bucket: { name: 'images' }, object: { key: 'a.png' } });

    expect(link).toBe('https://cdn.example.com/a.png');
  });

  test('the storage type is what the helper declares', () => {
    const base = {
      basePath: '/a',
      bucket: 'images',
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
    } as const;

    expect(resolve({ ...base, helper: diskHelper }).storage).toBe('disk');
    expect(resolve({ ...base, helper: s3Helper }).storage).toBe('bun-s3');
  });

  test('serverUpload reads its toggle: on carries the options and the default part limit, off carries nothing', () => {
    const base = {
      basePath: '/a',
      bucket: 'images',
      directUpload: { use: false },
      metaLink: { use: false },
      helper: diskHelper,
    } as const;

    const on = resolve({ ...base, serverUpload: { use: true, maxBytes: 10 } });
    const off = resolve({ ...base, serverUpload: { use: false } });

    expect(on.serverUpload).toMatchObject({ maxBytes: 10, maxFiles: 20 });
    expect(off.serverUpload).toBeUndefined();
  });

  test('the folders of the scope are configuration, so they do not count against maxFolderDepth', () => {
    const resolved = resolve({
      basePath: '/a',
      bucket: 'images',
      keyPrefix: '/inventory/material-images',
      maxFolderDepth: 3,
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      helper: diskHelper,
    });

    expect(resolved.keyPrefix).toBe('inventory/material-images/');
    expect(resolved.maxFolderDepth).toBe(3);
    expect(resolved.objectKeyMaxDepth).toBe(5);
  });

  test('a route toggle splits into whether it is on and what it overrides', () => {
    const resolved = resolve({
      basePath: '/a',
      bucket: 'images',
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      routes: {
        listObjects: { use: false },
        getObjectByName: { use: true, summary: 'Read one object' },
      },
      helper: diskHelper,
    });

    expect(resolved.routes.listObjects).toEqual({ isEnabled: false, override: {} });
    expect(resolved.routes.getObjectByName).toEqual({
      isEnabled: true,
      override: { summary: 'Read one object' },
    });
    expect(resolved.routes.deleteObject).toBeUndefined();
  });

  test('auth.publicRead reads its toggle', () => {
    const base = {
      basePath: '/a',
      bucket: 'images',
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      helper: diskHelper,
    } as const;
    const authenticate = { strategies: ['jwt'] };

    const open = resolve({ ...base, auth: { authenticate, publicRead: { use: true } } });
    const closed = resolve({ ...base, auth: { authenticate, publicRead: { use: false } } });
    const absent = resolve({ ...base, auth: { authenticate } });

    expect(open.auth?.isPublicRead).toBe(true);
    expect(closed.auth?.isPublicRead).toBe(false);
    expect(absent.auth?.isPublicRead).toBe(false);
  });
});

describe('a helper has to say which storage it is', () => {
  test('a helper with no storageType is refused, with the entry name', () => {
    const message = messageOf(() =>
      resolve({
        basePath: '/a',
        name: 'Mine',
        bucket: 'images',
        serverUpload: { use: true },
        directUpload: { use: false },
        metaLink: { use: false },
        helper: new FakeUntypedStorageHelper() as never,
      }),
    );

    expect(message).toContain('[Mine]');
    expect(message).toContain('helper must be a BunS3Helper or a DiskHelper');
  });
});

describe('direct upload needs an S3 helper and a scope of its own', () => {
  test('a disk helper is refused at resolve, with the entry name', () => {
    const message = messageOf(() =>
      // @ts-expect-error a DiskHelper entry cannot turn directUpload on
      resolve({
        basePath: '/a',
        name: 'Mine',
        bucket: 'uploads',
        keyPrefix: 'tenant-a/',
        serverUpload: { use: true },
        directUpload: { ...directUpload, authorize: () => true },
        metaLink: { use: false },
        helper: diskHelper,
      }),
    );

    expect(message).toContain('[Mine]');
    expect(message).toContain('directUpload needs a BunS3Helper');
  });

  test('directUpload on without a keyPrefix is refused at resolve, with the entry name', () => {
    const message = messageOf(() =>
      // @ts-expect-error directUpload needs a keyPrefix
      resolve({
        basePath: '/a',
        name: 'Mine',
        bucket: 'uploads',
        serverUpload: { use: true },
        directUpload: { ...directUpload, authorize: () => true },
        metaLink: { use: false },
        helper: s3Helper,
      }),
    );

    expect(message).toContain('[Mine]');
    expect(message).toContain('directUpload needs keyPrefix');
  });

  test('directUpload off needs neither, and a disk helper may keep a keyPrefix', () => {
    const resolved = resolve({
      basePath: '/a',
      bucket: 'uploads',
      keyPrefix: 'tenant-a',
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      helper: diskHelper,
    });

    expect(resolved.directUpload).toBeUndefined();
    expect(resolved.keyPrefix).toBe('tenant-a/');
  });

  test('an S3 helper with a keyPrefix resolves', () => {
    const resolved = resolve({
      basePath: '/a',
      bucket: 'uploads',
      keyPrefix: 'tenant-a/',
      serverUpload: { use: true },
      directUpload: { ...directUpload, authorize: () => true },
      metaLink: { use: false },
      helper: s3Helper,
    });

    expect(resolved.directUpload?.secretKey).toBe(SECRET);
    expect(resolved.directUpload?.validation).toBeUndefined();
  });
});

describe('direct upload needs a gate', () => {
  const base = {
    basePath: '/a',
    bucket: 'uploads',
    keyPrefix: 'tenant-a/',
    serverUpload: { use: true },
    metaLink: { use: false },
    helper: s3Helper,
  } as const;

  test('with neither authorize nor auth the entry refuses to resolve', () => {
    expect(() => resolve({ ...base, directUpload })).toThrow(
      'directUpload needs authorize or auth',
    );
  });

  test('auth that does not decide who may call is no gate: publicRead alone, or a skip', () => {
    for (const auth of [
      { publicRead: { use: true } },
      { authenticate: { skip: true as const } },
    ] as const) {
      expect(() => resolve({ ...base, directUpload, auth })).toThrow(
        'directUpload needs authorize or auth',
      );
    }
  });

  test('an authenticating or authorizing auth is the gate, and authorize then defaults to a pass-through', async () => {
    const authenticated = resolve({
      ...base,
      directUpload,
      auth: { authenticate: { strategies: ['jwt'] } },
    });
    const authorized = resolve({
      ...base,
      directUpload,
      auth: { authorize: { action: 'upload', resource: 'asset' } },
    });

    const context = {} as never;
    const isAuthenticatedAllowed = await authenticated.directUpload?.authorize({ context });
    const isAuthorizedAllowed = await authorized.directUpload?.authorize({ context });

    expect(isAuthenticatedAllowed).toBe(true);
    expect(isAuthorizedAllowed).toBe(true);
  });

  test('its own authorize is kept', async () => {
    const resolved = resolve({
      ...base,
      directUpload: { ...directUpload, authorize: () => false },
    });

    const isAllowed = await resolved.directUpload?.authorize({ context: {} as never });

    expect(isAllowed).toBe(false);
  });
});

describe('the pending prefix is checked at boot, with the entry name', () => {
  const entryWith = (opts: { keyPrefix: string; pendingPrefix?: string }): TStaticAssetEntry => ({
    basePath: '/a',
    name: 'ProductsController',
    bucket: 'uploads',
    keyPrefix: opts.keyPrefix,
    serverUpload: { use: true },
    directUpload: { ...directUpload, authorize: () => true, pendingPrefix: opts.pendingPrefix },
    metaLink: { use: false },
    helper: s3Helper,
  });

  test.each([
    ['empty', 'products/', ''],
    ['without its trailing slash', 'products/', 'pending'],
    ['a lone slash', 'products/', '/'],
    ['made of an invalid key segment', 'products/', 'a/../b/'],
    ['made of an empty key segment', 'products/', 'a//'],
  ])('a pendingPrefix that is %s is refused', (_label, keyPrefix, pendingPrefix) => {
    const message = messageOf(() => boot(entryWith({ keyPrefix, pendingPrefix })));

    expect(message).toContain('[ProductsController]');
    expect(message).toContain('pendingPrefix must be one or more valid key segments');
  });

  test.each([
    ['inside the keyPrefix', 'products/', 'products/pending/'],
    ['the same as the keyPrefix', 'products/', 'products/'],
    ['holding the keyPrefix', 'products/pending/', 'products/'],
  ])(
    'a pendingPrefix %s is refused: it would be served by the entry routes',
    (_label, keyPrefix, pendingPrefix) => {
      const message = messageOf(() => boot(entryWith({ keyPrefix, pendingPrefix })));

      expect(message).toContain('[ProductsController]');
      expect(message).toContain('must not contain one another');
    },
  );

  test('a disjoint pendingPrefix resolves, and so does the default', () => {
    const custom = boot(entryWith({ keyPrefix: 'products/', pendingPrefix: 'pending/' }));
    const nested = boot(entryWith({ keyPrefix: 'products/', pendingPrefix: 'tmp/uploads/' }));
    const fallback = boot(entryWith({ keyPrefix: 'products/' }));

    expect(custom?.policyService).toBeDefined();
    expect(nested?.commitService).toBeDefined();
    expect(fallback?.policyService).toBeDefined();
  });

  test('a keyPrefix that is not a valid scope is refused with the entry name too', () => {
    const message = messageOf(() => boot(entryWith({ keyPrefix: 'a/../b' })));

    expect(message).toContain('[ProductsController]');
    expect(message).toContain('keyPrefix must be one or more valid key segments');
  });
});

describe('what the types refuse', () => {
  test('a disk helper cannot take directUpload, and an S3 entry with directUpload needs a keyPrefix', () => {
    const entries: TStaticAssetEntry[] = [
      // A signed POST policy is an S3 feature.
      // @ts-expect-error a DiskHelper entry cannot turn directUpload on
      {
        basePath: '/a',
        bucket: 'uploads',
        keyPrefix: 'tenant-a/',
        serverUpload: { use: true },
        directUpload,
        metaLink: { use: false },
        helper: diskHelper,
      },
      // The pending prefix stays outside what the routes serve only with a scope.
      // @ts-expect-error directUpload needs a keyPrefix
      {
        basePath: '/a',
        bucket: 'uploads',
        serverUpload: { use: true },
        directUpload,
        metaLink: { use: false },
        helper: s3Helper,
      },
      // The accepted shapes.
      {
        basePath: '/a',
        bucket: 'uploads',
        keyPrefix: 'tenant-a/',
        serverUpload: { use: true },
        directUpload,
        metaLink: { use: false },
        helper: s3Helper,
      },
      {
        basePath: '/a',
        bucket: 'uploads',
        keyPrefix: 'tenant-a',
        serverUpload: { use: true },
        directUpload: { use: false },
        metaLink: { use: false },
        helper: diskHelper,
      },
    ];

    expect(entries).toHaveLength(4);
  });

  test('a toggle left out, a bucket left out, a route key outside the list and a stale option do not compile', () => {
    const entries: TStaticAssetEntry[] = [
      // @ts-expect-error serverUpload, directUpload and metaLink are required toggles
      { basePath: '/a', bucket: 'uploads', helper: diskHelper },
      // @ts-expect-error a bucket is required
      {
        basePath: '/a',
        serverUpload: { use: true },
        directUpload: { use: false },
        metaLink: { use: false },
        helper: diskHelper,
      },
      {
        basePath: '/a',
        bucket: 'uploads',
        serverUpload: { use: true },
        directUpload: { use: false },
        metaLink: { use: false },
        // @ts-expect-error there is no such route
        routes: { noSuchRoute: { use: true } },
        helper: diskHelper,
      },
      {
        basePath: '/a',
        bucket: 'uploads',
        // @ts-expect-error a bare boolean is not a toggle
        serverUpload: true,
        directUpload: { use: false },
        metaLink: { use: false },
        helper: diskHelper,
      },
    ];

    expect(entries).toHaveLength(4);
  });
});

describe('a mounted controller keeps the pending prefix out of what it serves', () => {
  const PENDING_KEY = 'pending/products/draft.png';
  const FINAL_KEY = 'products/final.png';

  const mount = async (opts: { helper: FakeStorageHelper; rawObjectPath?: boolean }) => {
    MetadataRegistry.getInstance().clearAll();
    const application = new EntryApplication({ scope: 'EntryApp', config: TEST_CONFIGS });
    application.init();

    const entry: TStaticAssetEntry = {
      basePath: '/assets',
      bucket: 'uploads',
      keyPrefix: 'products/',
      rawObjectPath: opts.rawObjectPath,
      serverUpload: { use: true },
      directUpload: { ...directUpload, authorize: () => true },
      metaLink: { use: false },
      helper: opts.helper as never,
    };
    const resolved = StaticAssetEntryUtility.resolve({ key: 'guarded', entry });

    application.controller(
      StaticAssetControllerFactory.build({
        key: 'guarded',
        entry,
        ...StaticAssetEntryUtility.buildDirectUploadServices({ resolved }),
      }),
    );
    await application['registerControllers']();

    const server = application.getServer() as OpenAPIHono;
    server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
    server.route(TEST_CONFIGS.path.base, application.getRootRouter());

    return server;
  };

  const seed = () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'uploads', key: PENDING_KEY, mimetype: 'image/png' });
    helper.seedObject({ bucket: 'uploads', key: FINAL_KEY, mimetype: 'image/png' });

    return helper;
  };

  test.each([
    ['getObjectByName', 'objects'],
    ['downloadObjectByName', 'download'],
  ])('%s answers 404 for a pending key, and the storage is never asked', async (_label, route) => {
    const helper = seed();
    const router = await mount({ helper });

    const response = await router.request(`/assets/${route}/${encodeURIComponent(PENDING_KEY)}`);

    expect(response.status).toBe(404);
    expect(helper.calls).toEqual([]);
  });

  test.each([
    ['getObjectByName', 'objects'],
    ['downloadObjectByName', 'download'],
  ])('%s answers 404 for a raw pending path too', async (_label, route) => {
    const helper = seed();
    const router = await mount({ helper, rawObjectPath: true });

    const response = await router.request(`/assets/${route}/${PENDING_KEY}`);

    expect(response.status).toBe(404);
    expect(helper.calls).toEqual([]);
  });

  test('the object inside the scope is served, so the 404 above is the scope and not a broken mount', async () => {
    const helper = seed();
    const router = await mount({ helper });

    const response = await router.request(`/assets/objects/${encodeURIComponent(FINAL_KEY)}`);

    expect(response.status).toBe(200);
  });

  test('listObjects never lists a pending object, with or without a prefix', async () => {
    const helper = seed();
    const router = await mount({ helper });

    const unfiltered = await router.request('/assets/objects');
    const unfilteredBody = await unfiltered.json();
    const names = (unfilteredBody as Array<{ name: string }>).map((item) => item.name);

    const aimed = await router.request('/assets/objects?prefix=pending/');
    const aimedBody = await aimed.json();

    expect(unfiltered.status).toBe(200);
    expect(names).toEqual([FINAL_KEY]);
    expect(aimed.status).toBe(200);
    expect(aimedBody).toEqual([]);
  });
});

describe('a mounted controller follows its toggles', () => {
  const mount = async (opts: {
    helper: FakeStorageHelper;
    serverUpload?: TStaticAssetEntry['serverUpload'];
    routes?: TStaticAssetEntry['routes'];
  }) => {
    MetadataRegistry.getInstance().clearAll();
    const application = new EntryApplication({ scope: 'ToggleApp', config: TEST_CONFIGS });
    application.init();

    const entry: TStaticAssetEntry = {
      basePath: '/assets',
      bucket: 'images',
      serverUpload: opts.serverUpload ?? { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      routes: opts.routes,
      helper: opts.helper as never,
    };

    application.controller(StaticAssetControllerFactory.build({ key: 'toggled', entry }));
    await application['registerControllers']();

    const server = application.getServer() as OpenAPIHono;
    server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
    server.route(TEST_CONFIGS.path.base, application.getRootRouter());

    return server;
  };

  const seed = () => {
    const helper = new FakeStorageHelper();
    helper.seedObject({ bucket: 'images', key: 'photo.png', mimetype: 'image/png' });

    return helper;
  };

  const postForm = (router: OpenAPIHono) => {
    const form = new FormData();
    form.append('files', new File(['hello'], 'a.png', { type: 'image/png' }));

    return router.request('/assets/objects', { method: 'POST', body: form });
  };

  test('serverUpload on registers the upload route', async () => {
    const helper = seed();
    const router = await mount({ helper });

    const response = await postForm(router);

    expect(response.status).toBe(200);
  });

  test('serverUpload off registers no upload route, and the rest stays', async () => {
    const helper = seed();
    const router = await mount({ helper, serverUpload: { use: false } });

    const response = await postForm(router);
    const read = await router.request('/assets/objects/photo.png');

    expect(response.status).toBe(404);
    expect(helper.calls.find((call) => call.method === 'writeObject')).toBeUndefined();
    expect(read.status).toBe(200);
  });

  test('a route switched off is not registered, and its sibling is', async () => {
    const helper = seed();
    const router = await mount({ helper, routes: { getObjectByName: { use: false } } });

    const off = await router.request('/assets/objects/photo.png');
    const sibling = await router.request('/assets/download/photo.png');

    expect(off.status).toBe(404);
    expect(sibling.status).toBe(200);
  });

  test('a route switched on with an override still applies the override', async () => {
    const helper = seed();
    const seen: string[] = [];
    const router = await mount({
      helper,
      routes: {
        getObjectByName: {
          use: true,
          middleware: async (context, next) => {
            seen.push(context.req.path);
            await next();
          },
        },
      },
    });

    const response = await router.request('/assets/objects/photo.png');
    const untouched = await router.request('/assets/download/photo.png');

    expect(response.status).toBe(200);
    expect(untouched.status).toBe(200);
    expect(seen).toEqual(['/assets/objects/photo.png']);
  });
});
