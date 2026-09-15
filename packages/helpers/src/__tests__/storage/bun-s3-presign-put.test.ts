/** `presignPut` no longer goes through `client.presign`: these pin what it gained and what it kept. */

import { describe, expect, test } from 'bun:test';
import { BunS3Helper } from '@/modules/storage/bun-s3';

const buildHelper = (
  opts: {
    endpoint?: string;
    publicEndpoint?: string;
    virtualHostedStyle?: boolean;
  } = {},
) =>
  new BunS3Helper({
    accessKey: 'AK',
    secretKey: 'SK',
    endpoint: { default: opts.endpoint ?? 'http://minio:9000', public: opts.publicEndpoint },
    virtualHostedStyle: opts.virtualHostedStyle,
    region: 'us-east-1',
  });

const signedHeaders = (url: string) =>
  new URL(url).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];

describe('presignPut addresses the object the way the provider expects', () => {
  test('path style keeps the bucket in the path', async () => {
    const url = await buildHelper().presignPut({
      bucket: { name: 'uploads' },
      object: { key: 'a.png' },
    });

    expect(new URL(url).host).toBe('minio:9000');
    expect(new URL(url).pathname).toBe('/uploads/a.png');
  });

  test('virtual hosted style moves the bucket into the host', async () => {
    const url = await buildHelper({
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      virtualHostedStyle: true,
    }).presignPut({ bucket: { name: 'uploads' }, object: { key: 'a.png' } });

    expect(new URL(url).host).toBe('uploads.s3.us-east-1.amazonaws.com');
    expect(new URL(url).pathname).toBe('/a.png');
  });

  /** A URL handed to a browser is signed against the PUBLIC host - `host` is inside the signature, so it cannot be rewritten later. */
  test('the public host is what a browser receives', async () => {
    const url = await buildHelper({ publicEndpoint: 'https://cdn.example.com' }).presignPut({
      bucket: { name: 'uploads' },
      object: { key: 'a.png' },
    });

    expect(new URL(url).host).toBe('cdn.example.com');
  });

  test('with neither option it signs host alone, as it always did', async () => {
    const url = await buildHelper().presignPut({
      bucket: { name: 'uploads' },
      object: { key: 'a.png' },
    });

    expect(signedHeaders(url)).toEqual(['host']);
  });
});

describe('presignPut can sign a tag set and a size', () => {
  /**
   * The tag has to be INSIDE the signature. A tag merely sent with the request is one S3 ignores,
   * and a flow gated on reading that tag back then fails with no upload error to explain it.
   */
  test('tagging is signed and encoded as a query string, not as XML', async () => {
    const url = await buildHelper().presignPut({
      bucket: { name: 'uploads' },
      object: { key: 'a.png' },
      tagging: { temp: 'true', 'total rows': '12' },
    });

    expect(signedHeaders(url)).toContain('x-amz-tagging');
    // The value is not in the URL - it travels as a header the client must send back.
    expect(url).not.toContain('temp%3Dtrue');
  });

  test('contentLength is signed, so a body of another size is refused', async () => {
    const url = await buildHelper().presignPut({
      bucket: { name: 'uploads' },
      object: { key: 'a.png' },
      contentLength: 2048,
    });

    expect(signedHeaders(url)).toContain('content-length');
  });

  test('both together are listed sorted, alongside host', async () => {
    const url = await buildHelper().presignPut({
      bucket: { name: 'uploads' },
      object: { key: 'a.png' },
      tagging: { temp: 'true' },
      contentLength: 2048,
    });

    expect(signedHeaders(url)).toEqual(['content-length', 'host', 'x-amz-tagging']);
  });

  test('a different tag value produces a different signature', async () => {
    const helper = buildHelper();
    const sign = (temp: string) =>
      helper.presignPut({
        bucket: { name: 'uploads' },
        object: { key: 'a.png' },
        tagging: { temp },
      });

    const [pending, validated] = await Promise.all([sign('true'), sign('validated')]);

    expect(new URL(pending).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(validated).searchParams.get('X-Amz-Signature'),
    );
  });
});
