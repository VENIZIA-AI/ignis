/** BunS3Helper - presignPut/presignGet (real S3Client, no network) and getObjectTags/replaceObjectTags (stubbed fetch) (Task 4) */

import { AnyType } from '@/common';
import { BunS3Helper } from '@/modules/storage/bun-s3';
import { StoragePresignDefaults } from '@/modules/storage/common';
import { afterEach, describe, expect, test } from 'bun:test';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const buildHelper = (): BunS3Helper =>
  new BunS3Helper({
    accessKey: 'test-access-key',
    secretKey: 'test-secret-key',
    // Unreachable on purpose - fact 1 says presign signs locally with no network call.
    endpoint: 'http://127.0.0.1:1',
  });

describe('BunS3Helper.presignPut / presignGet - real S3Client, unreachable endpoint', () => {
  test('presignPut embeds the bucket and key in the path, and honors the caller expiresInSeconds', async () => {
    const url = await buildHelper().presignPut({
      bucket: 'assets',
      name: 'reports/q1.csv',
      expiresInSeconds: 120,
    });

    expect(url).toContain('/assets/reports/q1.csv');
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('120');
  });

  test('presignPut without expiresInSeconds falls back to the PUT default constant', async () => {
    const url = await buildHelper().presignPut({ bucket: 'assets', name: 'file.png' });

    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe(
      String(StoragePresignDefaults.PUT_EXPIRES_IN_SECONDS),
    );
  });

  test('presignPut never sets response-content-type - fact 2 says it is a no-op on PUT', async () => {
    const url = await buildHelper().presignPut({ bucket: 'assets', name: 'file.png' });

    expect(new URL(url).searchParams.has('response-content-type')).toBe(false);
  });

  test('presignGet embeds the bucket and key, and honors the caller expiresInSeconds', async () => {
    const url = await buildHelper().presignGet({
      bucket: 'assets',
      name: 'reports/q1.csv',
      expiresInSeconds: 30,
    });

    expect(url).toContain('/assets/reports/q1.csv');
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('30');
  });

  test('presignGet without expiresInSeconds falls back to the GET default constant', async () => {
    const url = await buildHelper().presignGet({ bucket: 'assets', name: 'file.png' });

    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe(
      String(StoragePresignDefaults.GET_EXPIRES_IN_SECONDS),
    );
  });

  test('presignGet with responseContentType sets the response-content-type override', async () => {
    const url = await buildHelper().presignGet({
      bucket: 'assets',
      name: 'file.png',
      responseContentType: 'image/png',
    });

    expect(new URL(url).searchParams.get('response-content-type')).toBe('image/png');
  });
});

describe('BunS3Helper.getObjectTags / replaceObjectTags - stubbed fetch', () => {
  test('getObjectTags sends GET with the tagging query and parses the response', async () => {
    let capturedUrl = '';
    let capturedMethod = '';

    globalThis.fetch = ((input: AnyType, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method ?? '';
      const xml =
        '<Tagging><TagSet><Tag><Key>temp</Key><Value>true</Value></Tag></TagSet></Tagging>';
      return Promise.resolve(new Response(xml, { status: 200 }));
    }) as AnyType;

    const tags = await buildHelper().getObjectTags({ bucket: 'assets', name: 'file.png' });

    expect(capturedMethod).toBe('GET');
    expect(capturedUrl).toContain('/assets/file.png');
    expect(capturedUrl.endsWith('?tagging=')).toBe(true);
    expect(tags).toEqual({ temp: 'true' });
  });

  test('getObjectTags returns an empty object on a 404 - not a throw', async () => {
    globalThis.fetch = (() => Promise.resolve(new Response('', { status: 404 }))) as AnyType;

    const tags = await buildHelper().getObjectTags({ bucket: 'assets', name: 'missing.png' });

    expect(tags).toEqual({});
  });

  test('getObjectTags throws a getError carrying the status and body on a 500', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response('internal error', { status: 500 }))) as AnyType;

    const error = await buildHelper()
      .getObjectTags({ bucket: 'assets', name: 'file.png' })
      .catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('500');
    expect((error as Error).message).toContain('internal error');
  });

  test('replaceObjectTags sends PUT with the tagging query and the built XML body', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody = '';

    globalThis.fetch = ((input: AnyType, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method ?? '';
      capturedBody = String(init?.body ?? '');
      return Promise.resolve(new Response('', { status: 200 }));
    }) as AnyType;

    await buildHelper().replaceObjectTags({
      bucket: 'assets',
      name: 'file.png',
      tags: { temp: 'true' },
    });

    expect(capturedMethod).toBe('PUT');
    expect(capturedUrl).toContain('/assets/file.png');
    expect(capturedUrl.endsWith('?tagging=')).toBe(true);
    expect(capturedBody).toBe(
      '<Tagging><TagSet><Tag><Key>temp</Key><Value>true</Value></Tag></TagSet></Tagging>',
    );
  });

  test('replaceObjectTags throws a getError carrying the status and body on a non-2xx response', async () => {
    globalThis.fetch = (() => Promise.resolve(new Response('denied', { status: 403 }))) as AnyType;

    const error = await buildHelper()
      .replaceObjectTags({ bucket: 'assets', name: 'file.png', tags: {} })
      .catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('403');
    expect((error as Error).message).toContain('denied');
  });
});
