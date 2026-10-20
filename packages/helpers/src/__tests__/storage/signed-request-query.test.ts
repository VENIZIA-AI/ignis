/** buildSignedRequest - canonical query string extension (Task 1) */

import { describe, expect, test } from 'bun:test';
import { buildSignedRequest } from '@/modules/storage/bun-s3/utility';

const baseRequest = {
  method: 'GET',
  endpoint: 'http://localhost:9000',
  path: '/my-bucket/my-object',
  accessKey: 'test-access-key',
  secretKey: 'test-secret-key',
  region: 'us-east-1',
};

const extractSignature = (authorizationHeader: string): string => {
  const match = authorizationHeader.match(/Signature=([0-9a-f]+)/);
  if (!match) {
    throw new Error(`No signature found in header: ${authorizationHeader}`);
  }

  return match[1];
};

describe('buildSignedRequest - query string signing', () => {
  test('an absent query leaves the url exactly as before', async () => {
    const result = await buildSignedRequest({ ...baseRequest });

    expect(result.url).toBe('http://localhost:9000/my-bucket/my-object');
  });

  test('an absent query and an empty query object are byte-identical', async () => {
    const withoutQuery = await buildSignedRequest({ ...baseRequest });
    const withEmptyQuery = await buildSignedRequest({ ...baseRequest, query: {} });

    expect(withEmptyQuery.url).toBe(withoutQuery.url);
    expect(extractSignature(withEmptyQuery.headers.Authorization)).toBe(
      extractSignature(withoutQuery.headers.Authorization),
    );
  });

  test('a non-empty query changes the signature and is appended to the url', async () => {
    const withoutQuery = await buildSignedRequest({ ...baseRequest });
    const withTagging = await buildSignedRequest({ ...baseRequest, query: { tagging: '' } });

    expect(withTagging.url).toBe('http://localhost:9000/my-bucket/my-object?tagging=');
    expect(extractSignature(withTagging.headers.Authorization)).not.toBe(
      extractSignature(withoutQuery.headers.Authorization),
    );
  });

  test('query keys are sorted and URI-encoded in the url', async () => {
    const result = await buildSignedRequest({
      ...baseRequest,
      query: { versionId: 'abc def', tagging: '' },
    });

    expect(result.url).toBe(
      'http://localhost:9000/my-bucket/my-object?tagging=&versionId=abc%20def',
    );
  });
});

describe('buildSignedRequest - object key encoding', () => {
  /**
   * `fetch` percent-encodes the path it is given. Signing a raw key then puts a different path on the
   * wire than the one signed, and S3 answers 403 SignatureDoesNotMatch.
   */
  const keysNeedingEncoding = ['my file.txt', 'photos/2024/ảnh.png', 'a+b.txt', "it's (1).png"];

  test.each(keysNeedingEncoding)('the signed path survives the wire unchanged: %s', async key => {
    const { url } = await buildSignedRequest({
      ...baseRequest,
      path: `/my-bucket/${key}`,
      query: { tagging: '' },
    });

    const signedPath = url.slice('http://localhost:9000'.length).split('?')[0];

    expect(new URL(url).pathname).toBe(signedPath);
  });

  test('a folder separator stays literal, so the key keeps its shape', async () => {
    const { url } = await buildSignedRequest({
      ...baseRequest,
      path: '/my-bucket/photos/2024/report card.pdf',
    });

    expect(url).toBe('http://localhost:9000/my-bucket/photos/2024/report%20card.pdf');
  });

  test('a key needing no encoding signs exactly as it did before', async () => {
    const { url } = await buildSignedRequest({ ...baseRequest, path: '/my-bucket/plain-name.txt' });

    expect(url).toBe('http://localhost:9000/my-bucket/plain-name.txt');
  });
});
