/** BunS3Helper against the providers IGNIS must work with, now that it is the only S3 client. */

import { describe, expect, test } from 'bun:test';
import { BunS3Helper } from '@/modules/storage/bun-s3';

const buildHelper = (opts: {
  endpoint: string;
  publicEndpoint?: string;
  virtualHostedStyle?: boolean;
  region?: string;
}) =>
  new BunS3Helper({
    accessKey: 'AK',
    secretKey: 'SK',
    endpoint: opts.endpoint,
    publicEndpoint: opts.publicEndpoint,
    virtualHostedStyle: opts.virtualHostedStyle,
    region: opts.region ?? 'us-east-1',
  });

describe('BunS3Helper - bucket addressing per provider', () => {
  test('path style puts the bucket in the path, which MinIO and R2 expect', async () => {
    const helper = buildHelper({ endpoint: 'https://sgp1.digitaloceanspaces.com' });

    const url = await helper.presignGet({
      bucket: { name: 'assets' },
      object: { key: 'photo.png' },
    });

    expect(new URL(url).host).toBe('sgp1.digitaloceanspaces.com');
    expect(new URL(url).pathname).toBe('/assets/photo.png');
  });

  /**
   * The host assertion is the load-bearing one. Bun drops the bucket from the path whenever
   * `virtualHostedStyle` is set, so asserting only the path passes even on a URL that lost the bucket
   * entirely - which is exactly what a bucket-free endpoint produces through Bun's own client.
   */
  test('virtual hosted style moves the bucket into the host, which AWS requires', async () => {
    const helper = buildHelper({
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      virtualHostedStyle: true,
    });

    const url = await helper.presignGet({
      bucket: { name: 'assets' },
      object: { key: 'photo.png' },
    });

    expect(new URL(url).host).toBe('assets.s3.us-east-1.amazonaws.com');
    expect(new URL(url).pathname).toBe('/photo.png');
  });

  test('each bucket gets its own host, so one helper still serves many buckets', async () => {
    const helper = buildHelper({
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      virtualHostedStyle: true,
    });

    const first = await helper.presignGet({ bucket: { name: 'assets' }, object: { key: 'a.png' } });
    const second = await helper.presignGet({
      bucket: { name: 'reports' },
      object: { key: 'b.png' },
    });

    expect(new URL(first).host).toBe('assets.s3.us-east-1.amazonaws.com');
    expect(new URL(second).host).toBe('reports.s3.us-east-1.amazonaws.com');
  });
});

describe('BunS3Helper - publicEndpoint', () => {
  /** `host` is inside the signature, so a URL signed against an internal name cannot be rewritten later. */
  test('a signed URL carries the public host, not the internal one', async () => {
    const helper = buildHelper({
      endpoint: 'http://minio:9000',
      publicEndpoint: 'https://cdn.example.com',
    });

    const url = await helper.presignGet({
      bucket: { name: 'assets' },
      object: { key: 'photo.png' },
    });

    expect(new URL(url).host).toBe('cdn.example.com');
    expect(url).not.toContain('minio:9000');
  });

  test('without publicEndpoint the endpoint is used unchanged', async () => {
    const helper = buildHelper({ endpoint: 'http://minio:9000' });

    const url = await helper.presignGet({
      bucket: { name: 'assets' },
      object: { key: 'photo.png' },
    });

    expect(new URL(url).host).toBe('minio:9000');
  });
});

describe('BunS3Helper - the signed GET carries its own disposition', () => {
  /** S3 serves a presigned GET directly, so the attachment guarantee has to live inside the signature. */
  test('a requested content disposition reaches the signed url', async () => {
    const helper = buildHelper({ endpoint: 'https://s3.us-east-1.amazonaws.com' });

    const url = await helper.presignGet({
      bucket: { name: 'assets' },
      object: { key: 'payload.html' },
      responseContentDisposition: 'attachment; filename="payload.html"',
    });

    const disposition = new URL(url).searchParams.get('response-content-disposition');
    expect(disposition).toBe('attachment; filename="payload.html"');
  });

  test('omitting it leaves the url without the parameter', async () => {
    const helper = buildHelper({ endpoint: 'https://s3.us-east-1.amazonaws.com' });

    const url = await helper.presignGet({
      bucket: { name: 'assets' },
      object: { key: 'photo.png' },
    });

    expect(new URL(url).searchParams.get('response-content-disposition')).toBeNull();
  });
});
