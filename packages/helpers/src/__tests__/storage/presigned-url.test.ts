import { buildPresignedUrl } from '@/modules/storage/bun-s3/utility';
import { describe, expect, test } from 'bun:test';

/** The credentials AWS publishes its signature examples with. They unlock nothing. */
const EXAMPLE = {
  accessKey: 'AKIAIOSFODNN7EXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  now: new Date('2013-05-24T00:00:00Z'),
};

const parse = (url: string) => new URL(url);

describe('a presigned URL carries its credential in the query', () => {
  /**
   * The one test that proves the canonical request is built correctly rather than merely
   * consistently: AWS publishes this signature, so a single wrong byte anywhere in the canonical
   * request, the string to sign or the key derivation changes it.
   *
   * Source: AWS "Signature Calculations for the Authorization Header: Transferring Payload in a
   * Single Chunk" - example presigned GET for `examplebucket/test.txt`, 86400s.
   */
  test('it reproduces the signature AWS publishes for the documented example', async () => {
    const url = await buildPresignedUrl({
      method: 'GET',
      endpoint: 'https://examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      expiresInSeconds: 86400,
      ...EXAMPLE,
    });

    expect(parse(url).searchParams.get('X-Amz-Signature')).toBe(
      'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  test('it names host, the credential scope and the expiry', async () => {
    const url = await buildPresignedUrl({
      method: 'PUT',
      endpoint: 'http://minio:9000',
      path: '/uploads/a.png',
      expiresInSeconds: 900,
      ...EXAMPLE,
    });

    const query = parse(url).searchParams;
    expect(parse(url).host).toBe('minio:9000');
    expect(query.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(query.get('X-Amz-Credential')).toBe(
      'AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request',
    );
    expect(query.get('X-Amz-Expires')).toBe('900');
    expect(query.get('X-Amz-SignedHeaders')).toBe('host');
  });

  test('a session token is signed, not merely appended', async () => {
    const withToken = await buildPresignedUrl({
      method: 'PUT',
      endpoint: 'http://minio:9000',
      path: '/uploads/a.png',
      expiresInSeconds: 900,
      sessionToken: 'a-temporary-token',
      ...EXAMPLE,
    });
    const without = await buildPresignedUrl({
      method: 'PUT',
      endpoint: 'http://minio:9000',
      path: '/uploads/a.png',
      expiresInSeconds: 900,
      ...EXAMPLE,
    });

    expect(parse(withToken).searchParams.get('X-Amz-Security-Token')).toBe('a-temporary-token');
    expect(parse(withToken).searchParams.get('X-Amz-Signature')).not.toBe(
      parse(without).searchParams.get('X-Amz-Signature'),
    );
  });
});

describe('extra headers go INSIDE the signature', () => {
  /** If they were merely sent, S3 would ignore them and the tag would silently not exist. */
  test('each one is listed in X-Amz-SignedHeaders, lowercased and sorted', async () => {
    const url = await buildPresignedUrl({
      method: 'PUT',
      endpoint: 'http://minio:9000',
      path: '/uploads/a.png',
      expiresInSeconds: 900,
      headers: { 'X-Amz-Tagging': 'temp=true', 'Content-Length': '2048' },
      ...EXAMPLE,
    });

    expect(parse(url).searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;host;x-amz-tagging',
    );
  });

  test('changing a header value changes the signature', async () => {
    const sign = (tagging: string) =>
      buildPresignedUrl({
        method: 'PUT',
        endpoint: 'http://minio:9000',
        path: '/uploads/a.png',
        expiresInSeconds: 900,
        headers: { 'x-amz-tagging': tagging },
        ...EXAMPLE,
      });

    const [temporary, permanent] = await Promise.all([sign('temp=true'), sign('temp=false')]);

    expect(parse(temporary).searchParams.get('X-Amz-Signature')).not.toBe(
      parse(permanent).searchParams.get('X-Amz-Signature'),
    );
  });

  /** SigV4 compares trimmed values, so signing an untrimmed one answers 403 on a header that looks right. */
  test('a padded value signs the same as its trimmed form', async () => {
    const sign = (tagging: string) =>
      buildPresignedUrl({
        method: 'PUT',
        endpoint: 'http://minio:9000',
        path: '/uploads/a.png',
        expiresInSeconds: 900,
        headers: { 'x-amz-tagging': tagging },
        ...EXAMPLE,
      });

    const [padded, trimmed] = await Promise.all([sign('  temp=true  '), sign('temp=true')]);

    expect(parse(padded).searchParams.get('X-Amz-Signature')).toBe(
      parse(trimmed).searchParams.get('X-Amz-Signature'),
    );
  });

  test('a key with a space is percent-encoded in the path, not left raw', async () => {
    const url = await buildPresignedUrl({
      method: 'PUT',
      endpoint: 'http://minio:9000',
      path: '/uploads/my report.pdf',
      expiresInSeconds: 900,
      ...EXAMPLE,
    });

    expect(url).toContain('/uploads/my%20report.pdf');
  });
});
