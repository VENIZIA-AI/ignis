/** A read or a copy that names the content it expects, and a stat that reports the version. */

import { afterEach, describe, expect, test } from 'bun:test';
import { DiskHelper, StorageErrors, StorageUtility } from '@/modules/storage';
import { BunS3Helper } from '@/modules/storage/bun-s3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface ISeenRequest {
  method: string;
  path: string;
  search: string;
  headers: Headers;
}

const servers: Array<{ stop: () => void }> = [];
const directories: string[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.stop();
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const mount = (opts: { respond: (request: Request) => Response }) => {
  const seen: ISeenRequest[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      seen.push({
        method: request.method,
        path: url.pathname,
        search: url.search,
        headers: request.headers,
      });

      return opts.respond(request);
    },
  });
  servers.push(server);

  const helper = new BunS3Helper({
    accessKey: 'AK',
    secretKey: 'SK',
    endpoint: { default: `http://localhost:${server.port}` },
    region: 'us-east-1',
  });

  return { helper, seen };
};

const headResponse = (headers: Record<string, string>) =>
  new Response(null, {
    status: 200,
    headers: { 'content-length': '5', 'content-type': 'text/plain', ...headers },
  });

const captureError = async (task: Promise<unknown>): Promise<unknown> => {
  try {
    await task;
  } catch (error) {
    return error;
  }

  return undefined;
};

const LOCATION = { bucket: { name: 'uploads' }, object: { key: 'pending/files/a/orders.xlsx' } };

describe('BunS3Helper.getStat reports what a pin needs', () => {
  test('the quoted ETag and the version id', async () => {
    const { helper, seen } = mount({
      respond: () => headResponse({ etag: '"abc123"', 'x-amz-version-id': 'v-9' }),
    });

    const stat = await helper.getStat(LOCATION);

    expect(seen[0].method).toBe('HEAD');
    expect(stat.size).toBe(5);
    expect(stat.etag).toBe('"abc123"');
    expect(stat.versionId).toBe('v-9');
  });

  const noVersion: Array<{ name: string; headers: Record<string, string> }> = [
    { name: 'the literal null', headers: { 'x-amz-version-id': 'null' } },
    { name: 'an empty value', headers: { 'x-amz-version-id': '' } },
    { name: 'no header', headers: {} },
  ];

  test.each(noVersion)('$name is no version', async ({ headers }) => {
    const { helper } = mount({ respond: () => headResponse({ etag: '"abc123"', ...headers }) });

    const stat = await helper.getStat(LOCATION);

    expect(stat.versionId).toBeUndefined();
    expect(stat.etag).toBe('"abc123"');
  });

  test('a missing object is OBJECT_NOT_FOUND', async () => {
    const { helper } = mount({ respond: () => new Response(null, { status: 404 }) });

    const error = await captureError(helper.getStat(LOCATION));

    expect(error).toMatchObject({ statusCode: 404 });
  });
});

describe('BunS3Helper.getObjectStream with a condition', () => {
  test('ifMatch is sent quoted, and the body is returned', async () => {
    const { helper, seen } = mount({ respond: () => new Response('bytes') });

    const stream = await helper.getObjectStream({ ...LOCATION, ifMatch: 'abc123' });
    const response = new Response(stream);
    const text = await response.text();

    expect(text).toBe('bytes');
    expect(seen[0].headers.get('if-match')).toBe('"abc123"');
    expect(seen[0].search).toBe('');
  });

  test('a version id is sent as the versionId query', async () => {
    const { helper, seen } = mount({ respond: () => new Response('bytes') });

    await helper.getObjectStream({ ...LOCATION, versionId: 'v-9' });

    expect(seen[0].search).toBe('?versionId=v-9');
    expect(seen[0].headers.get('if-match')).toBeNull();
  });

  test('a range rides along', async () => {
    const { helper, seen } = mount({ respond: () => new Response('yt', { status: 206 }) });

    await helper.getObjectStream({ ...LOCATION, ifMatch: 'abc123', range: { start: 1, end: 2 } });

    expect(seen[0].headers.get('range')).toBe('bytes=1-2');
  });

  test('a 412 is PRECONDITION_FAILED', async () => {
    const { helper } = mount({ respond: () => new Response(null, { status: 412 }) });

    const error = await captureError(helper.getObjectStream({ ...LOCATION, ifMatch: 'abc123' }));

    expect(error).toMatchObject({ statusCode: StorageErrors.PRECONDITION_FAILED.statusCode });
  });

  test('a read with no condition does not go through the signed GET', async () => {
    const { helper, seen } = mount({ respond: () => new Response('bytes') });

    const stream = await helper.getObjectStream(LOCATION);
    const response2 = new Response(stream);
    const text = await response2.text();

    expect(text).toBe('bytes');
    expect(seen.every((request) => request.headers.get('if-match') === null)).toBe(true);
  });
});

describe('BunS3Helper.copyObject with a condition', () => {
  test('ifMatch becomes x-amz-copy-source-if-match', async () => {
    const { helper, seen } = mount({ respond: () => new Response('<CopyObjectResult/>') });

    await helper.copyObject({
      bucket: LOCATION.bucket,
      source: LOCATION.object,
      destination: { key: 'files/a/orders.xlsx' },
      ifMatch: 'abc123',
    });

    expect(seen[0].method).toBe('PUT');
    expect(seen[0].headers.get('x-amz-copy-source-if-match')).toBe('"abc123"');
    expect(seen[0].headers.get('x-amz-copy-source')).toBe('/uploads/pending/files/a/orders.xlsx');
  });

  test('a source version id is part of x-amz-copy-source', async () => {
    const { helper, seen } = mount({ respond: () => new Response('<CopyObjectResult/>') });

    await helper.copyObject({
      bucket: LOCATION.bucket,
      source: LOCATION.object,
      destination: { key: 'files/a/orders.xlsx' },
      sourceVersionId: 'v-9',
    });

    expect(seen[0].headers.get('x-amz-copy-source')).toBe(
      '/uploads/pending/files/a/orders.xlsx?versionId=v-9',
    );
    expect(seen[0].headers.get('x-amz-copy-source-if-match')).toBeNull();
  });

  test('a copy without a condition sends none', async () => {
    const { helper, seen } = mount({ respond: () => new Response('<CopyObjectResult/>') });

    await helper.copyObject({
      bucket: LOCATION.bucket,
      source: LOCATION.object,
      destination: { key: 'files/a/orders.xlsx' },
    });

    expect(seen[0].headers.get('x-amz-copy-source-if-match')).toBeNull();
  });

  test('a 412 is PRECONDITION_FAILED', async () => {
    const { helper } = mount({ respond: () => new Response(null, { status: 412 }) });

    const error = await captureError(
      helper.copyObject({
        bucket: LOCATION.bucket,
        source: LOCATION.object,
        destination: { key: 'files/a/orders.xlsx' },
        ifMatch: 'abc123',
      }),
    );

    expect(error).toMatchObject({ statusCode: StorageErrors.PRECONDITION_FAILED.statusCode });
  });
});

describe('a helper with no ETag refuses a conditional read', () => {
  test('DiskHelper', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'conditional-'));
    directories.push(directory);
    const helper = new DiskHelper({ basePath: directory });
    await helper.createBucket({ bucket: { name: 'uploads' } });
    writeFileSync(join(directory, 'uploads', 'a.txt'), 'x');

    const error = await captureError(
      helper.getObjectStream({
        bucket: { name: 'uploads' },
        object: { key: 'a.txt' },
        ifMatch: 'abc',
      }),
    );

    expect(String(error)).toContain('conditional read');
  });
});

describe('StorageUtility.realVersionId', () => {
  const cases: Array<{ value: string | null | undefined; expected: string | undefined }> = [
    { value: 'v-1', expected: 'v-1' },
    { value: 'null', expected: undefined },
    { value: '', expected: undefined },
    { value: null, expected: undefined },
    { value: undefined, expected: undefined },
  ];

  test.each(cases)('$value', ({ value, expected }) => {
    expect(StorageUtility.realVersionId({ value })).toBe(expected);
  });
});
