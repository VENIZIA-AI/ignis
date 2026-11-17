/**
 * The calls this process makes on an object reach the object in both addressing styles. Bun puts the bucket in neither the host
 * nor the path in virtual-hosted mode, so each call has to carry the bucket's own host: a helper that does not sends `PUT /k.png`
 * to the bare endpoint. These tests read the requests off the wire, against a local server (`*.localhost` is loopback).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { BunS3Helper } from '@/modules/storage/bun-s3';

const LIST_XML =
  '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>assets</Name><Prefix></Prefix><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>k.png</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>"e"</ETag><Size>1</Size></Contents></ListBucketResult>';

let server: ReturnType<typeof Bun.serve>;
const seen: string[] = [];

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      seen.push(`${request.method} ${request.headers.get('host')} ${url.pathname}`);

      if (request.method === 'GET' && url.searchParams.get('list-type') === '2') {
        return new Response(LIST_XML, { headers: { 'content-type': 'application/xml' } });
      }

      return new Response(request.method === 'HEAD' ? null : 'x', {
        headers: { 'content-length': '1', 'content-type': 'text/plain' },
      });
    },
  });
});

afterAll(async () => {
  await server.stop(true);
});

const run = async (opts: { virtualHostedStyle: boolean; bucket: string }) => {
  const helper = new BunS3Helper({
    accessKey: 'AK',
    secretKey: 'SK',
    endpoint: { default: `http://localhost:${server.port}` },
    virtualHostedStyle: opts.virtualHostedStyle,
    region: 'us-east-1',
  });
  const bucket = { name: opts.bucket };
  const object = { key: 'k.png' };
  const calls: Record<string, string[]> = {};

  const record = async (name: string, task: () => Promise<unknown>) => {
    seen.length = 0;
    await task();
    calls[name] = [...seen];
  };

  await record('writeStream', () =>
    helper.writeStream({ bucket, object, source: new Blob(['x']), contentType: 'text/plain' }),
  );
  await record('getStat', () => helper.getStat({ bucket, object }));
  await record('getObject', async () => {
    const source = await helper.getObject({ bucket, object });
    const chunks: unknown[] = [];

    for await (const chunk of source) {
      chunks.push(chunk);
    }
  });
  await record('getObjectStream', async () => {
    const stream = await helper.getObjectStream({ bucket, object });

    await stream.getReader().read();
  });
  await record('removeObject', () => helper.removeObject({ bucket, object }));
  await record('listObjects', () => helper.listObjects({ bucket }));
  await record('hasBucket', () => helper.hasBucket({ bucket }));

  return calls;
};

describe('virtual-hosted style', () => {
  test('every object call goes to the bucket host, with the key alone as the path', async () => {
    const calls = await run({ virtualHostedStyle: true, bucket: 'assets' });
    const host = `assets.localhost:${server.port}`;

    expect(calls['writeStream']).toEqual([`PUT ${host} /k.png`]);
    expect(calls['getStat']).toEqual([`HEAD ${host} /k.png`]);
    expect(calls['getObject']).toEqual([`GET ${host} /k.png`]);
    expect(calls['getObjectStream']).toEqual([`GET ${host} /k.png`]);
    expect(calls['removeObject']).toEqual([`DELETE ${host} /k.png`]);
    expect(calls['listObjects']).toEqual([`GET ${host} /`]);
    expect(calls['hasBucket']).toEqual([`GET ${host} /`]);
  });

  test('each bucket gets its own host', async () => {
    const calls = await run({ virtualHostedStyle: true, bucket: 'reports' });

    expect(calls['writeStream']).toEqual([`PUT reports.localhost:${server.port} /k.png`]);
  });

  test('a bucket that cannot be a host label is refused before any request', async () => {
    seen.length = 0;
    const helper = new BunS3Helper({
      accessKey: 'AK',
      secretKey: 'SK',
      endpoint: { default: `http://localhost:${server.port}` },
      virtualHostedStyle: true,
    });
    let failure: unknown;

    try {
      await helper.removeObject({ bucket: { name: 'a.b@evil' }, object: { key: 'k.png' } });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(seen).toEqual([]);
  });
});

describe('path style', () => {
  test('every object call goes to the endpoint host, with the bucket in the path', async () => {
    const calls = await run({ virtualHostedStyle: false, bucket: 'assets' });
    const host = `localhost:${server.port}`;

    expect(calls['writeStream']).toEqual([`PUT ${host} /assets/k.png`]);
    expect(calls['getStat']).toEqual([`HEAD ${host} /assets/k.png`]);
    expect(calls['getObject']).toEqual([`GET ${host} /assets/k.png`]);
    expect(calls['getObjectStream']).toEqual([`GET ${host} /assets/k.png`]);
    expect(calls['removeObject']).toEqual([`DELETE ${host} /assets/k.png`]);
    expect(calls['listObjects']).toEqual([`GET ${host} /assets/`]);
    expect(calls['hasBucket']).toEqual([`GET ${host} /assets/`]);
  });
});
