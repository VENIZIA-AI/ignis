import 'reflect-metadata';
import type { TStaticAssetEntry } from '@/components/static-asset/common';
import { StaticAssetEntryUtility } from '@/components/static-asset/utilities/entry.utility';
import type { DiskHelper } from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import { describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from './fake-storage.helper';

const diskHelper: DiskHelper = new FakeStorageHelper() as never;
const s3Helper: BunS3Helper = new FakeStorageHelper() as never;

const resolve = (entry: TStaticAssetEntry, key = 'staticAsset') =>
  StaticAssetEntryUtility.resolve({ key, entry });

const fake = new FakeStorageHelper() as never;

describe('an entry resolves to its defaults', () => {
  test('the name comes from the key, and an explicit name wins', () => {
    expect(resolve({ basePath: '/a', helper: fake }, 'staticAsset').name).toBe(
      'StaticAssetController',
    );
    expect(resolve({ basePath: '/a', helper: fake }, 'product-images').name).toBe(
      'ProductImagesController',
    );
    expect(resolve({ basePath: '/a', helper: fake }, 'reportController').name).toBe(
      'ReportController',
    );
    expect(resolve({ basePath: '/a', name: 'Mine', helper: fake }).name).toBe('Mine');
  });

  test('the mount path carries one leading slash, and the url defaults are strict and encoded', () => {
    const resolved = resolve({ basePath: 'assets', helper: fake });

    expect(resolved.basePath).toBe('/assets');
    expect(resolved.isStrict).toBe(true);
    expect(resolved.rawObjectPath).toBe(false);
  });

  test('the default link is the controller own object route, in one place for every consumer', () => {
    const withBucket = resolve({ basePath: '/assets', bucket: 'images', helper: fake });
    const withoutBucket = resolve({ basePath: '/assets', helper: fake });
    const location = { bucket: { name: 'images' }, object: { key: 'a/b c.png' } };

    expect(withBucket.link(location)).toBe('/assets/objects/a%2Fb%20c.png');
    expect(withoutBucket.link(location)).toBe('/assets/buckets/images/objects/a%2Fb%20c.png');
  });

  test('url.link replaces the default', () => {
    const resolved = resolve({
      basePath: '/assets',
      url: { link: ({ object }) => `https://cdn.example.com/${object.key}` },
      helper: fake,
    });

    expect(resolved.link({ bucket: { name: 'images' }, object: { key: 'a.png' } })).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  test('serverUpload defaults on, and false turns it off', () => {
    expect(resolve({ basePath: '/a', helper: fake }).serverUpload.isEnabled).toBe(true);
    expect(
      resolve({ basePath: '/a', serverUpload: false, helper: fake }).serverUpload.isEnabled,
    ).toBe(false);
  });

  test('the storage type is the helper: a disk helper records disk', () => {
    expect(resolve({ basePath: '/a', helper: fake }).storage).toBe('disk');
  });
});

describe('direct upload needs a gate', () => {
  const directUpload = { secretKey: 'a-secret-nobody-else-has', maxBytes: 1024 };

  test('with neither authorize nor auth the entry refuses to resolve', () => {
    expect(() =>
      resolve({ basePath: '/a', bucket: 'uploads', directUpload, helper: fake }),
    ).toThrow('directUpload needs authorize or auth');
  });

  test('auth that does not decide who may call is no gate: publicRead alone, or a skip', () => {
    for (const auth of [{ publicRead: true }, { authenticate: { skip: true as const } }]) {
      expect(() =>
        resolve({ basePath: '/a', bucket: 'uploads', directUpload, auth, helper: fake }),
      ).toThrow('directUpload needs authorize or auth');
    }
  });

  test('an authenticating or authorizing auth is the gate, and authorize then defaults to a pass-through', async () => {
    const authenticated = resolve({
      basePath: '/a',
      bucket: 'uploads',
      directUpload,
      auth: { authenticate: { strategies: ['jwt'] } },
      helper: fake,
    });
    const authorized = resolve({
      basePath: '/a',
      bucket: 'uploads',
      directUpload,
      auth: { authorize: { action: 'upload', resource: 'asset' } },
      helper: fake,
    });

    const context = {} as never;

    expect(await authenticated.directUpload?.authorize({ context })).toBe(true);
    expect(await authorized.directUpload?.authorize({ context })).toBe(true);
  });

  test('its own authorize is kept', async () => {
    const resolved = resolve({
      basePath: '/a',
      bucket: 'uploads',
      directUpload: { ...directUpload, authorize: () => false },
      helper: fake,
    });

    expect(await resolved.directUpload?.authorize({ context: {} as never })).toBe(false);
  });
});

describe('what the types refuse', () => {
  test('a disk helper cannot take directUpload, and directUpload needs a bucket', () => {
    const directUpload = { secretKey: 'a-secret-nobody-else-has', maxBytes: 1024 };

    const entries: TStaticAssetEntry[] = [
      // A signed POST policy is an S3 feature.
      // @ts-expect-error a DiskHelper entry cannot declare directUpload
      { basePath: '/a', bucket: 'uploads', helper: diskHelper, directUpload },
      // A policy names one bucket, and a bucket in the URL is a bucket the caller chooses.
      // @ts-expect-error directUpload needs a bucket
      { basePath: '/a', helper: s3Helper, directUpload },
      // The scope would span every bucket.
      // @ts-expect-error keyPrefix needs a bucket
      { basePath: '/a', helper: diskHelper, keyPrefix: 'tenant-a' },
      // The accepted shapes.
      { basePath: '/a', bucket: 'uploads', helper: s3Helper, directUpload },
      { basePath: '/a', bucket: 'uploads', helper: diskHelper, keyPrefix: 'tenant-a' },
      { basePath: '/a', helper: diskHelper },
    ];

    expect(entries).toHaveLength(6);
  });

  test('a route key outside the list, and a stale option, do not compile', () => {
    const entry: TStaticAssetEntry = {
      basePath: '/a',
      helper: diskHelper,
      // @ts-expect-error there is no such route
      routes: { noSuchRoute: true },
    };
    const stale: TStaticAssetEntry = {
      basePath: '/a',
      helper: diskHelper,
      // @ts-expect-error `extra` is gone, and with it the open index signature
      extra: { anything: 1 },
    };

    expect([entry, stale]).toHaveLength(2);
  });
});
