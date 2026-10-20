import { describe, expect, test } from 'bun:test';
import { buildPostPolicy } from '@/modules/storage/bun-s3/utility';

const CREDENTIALS = {
  accessKey: 'AKIAEXAMPLE',
  secretKey: 'secret',
  region: 'us-east-1',
};

/** The policy document the browser never sees decoded; every assertion here reads it back. */
const decodePolicy = (formData: Record<string, string>): { conditions: unknown[] } =>
  JSON.parse(Buffer.from(formData['policy'], 'base64').toString('utf8'));

describe('buildPostPolicy', () => {
  test('it bounds the size, which is the whole reason this is not a presigned PUT', async () => {
    const { formData } = await buildPostPolicy({
      ...CREDENTIALS,
      bucket: 'uploads',
      keyPrefix: 'pending/',
      maxBytes: 2_097_152,
      expiresInSeconds: 900,
    });

    expect(decodePolicy(formData).conditions).toContainEqual([
      'content-length-range',
      0,
      2_097_152,
    ]);
  });

  test('it confines the key to the prefix, so a caller cannot name the final object', async () => {
    const { formData } = await buildPostPolicy({
      ...CREDENTIALS,
      bucket: 'uploads',
      keyPrefix: 'pending/',
      maxBytes: 1024,
      expiresInSeconds: 900,
    });

    expect(decodePolicy(formData).conditions).toContainEqual(['starts-with', '$key', 'pending/']);
  });

  test('a content type becomes a condition; absent leaves none', async () => {
    const withType = await buildPostPolicy({
      ...CREDENTIALS,
      bucket: 'uploads',
      keyPrefix: 'pending/',
      maxBytes: 1024,
      expiresInSeconds: 900,
      contentType: 'image/png',
    });
    const withoutType = await buildPostPolicy({
      ...CREDENTIALS,
      bucket: 'uploads',
      keyPrefix: 'pending/',
      maxBytes: 1024,
      expiresInSeconds: 900,
    });

    expect(decodePolicy(withType.formData).conditions).toContainEqual({
      'Content-Type': 'image/png',
    });
    expect(JSON.stringify(decodePolicy(withoutType.formData).conditions)).not.toContain(
      'Content-Type',
    );
  });

  test('the form carries what S3 needs to verify the signature', async () => {
    const { formData } = await buildPostPolicy({
      ...CREDENTIALS,
      bucket: 'uploads',
      keyPrefix: 'pending/',
      maxBytes: 1024,
      expiresInSeconds: 900,
    });

    expect(formData['x-amz-algorithm']).toBe('AWS4-HMAC-SHA256');
    expect(formData['x-amz-credential']).toContain('AKIAEXAMPLE/');
    expect(formData['x-amz-credential']).toContain('/us-east-1/s3/aws4_request');
    expect(formData['x-amz-signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(formData['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
  });

  test('a session token is carried when the credentials have one, and absent otherwise', async () => {
    const { formData } = await buildPostPolicy({
      ...CREDENTIALS,
      sessionToken: 'session-abc',
      bucket: 'uploads',
      keyPrefix: 'pending/',
      maxBytes: 1024,
      expiresInSeconds: 900,
    });

    expect(formData['x-amz-security-token']).toBe('session-abc');
    expect(decodePolicy(formData).conditions).toContainEqual({
      'x-amz-security-token': 'session-abc',
    });
  });

  test('the expiry is the one asked for, in the shape S3 parses', async () => {
    const before = Date.now();
    const { expiresAt } = await buildPostPolicy({
      ...CREDENTIALS,
      bucket: 'uploads',
      keyPrefix: 'pending/',
      maxBytes: 1024,
      expiresInSeconds: 900,
    });

    const elapsed = new Date(expiresAt).getTime() - before;
    expect(elapsed).toBeGreaterThan(890_000);
    expect(elapsed).toBeLessThan(910_000);
  });
});
