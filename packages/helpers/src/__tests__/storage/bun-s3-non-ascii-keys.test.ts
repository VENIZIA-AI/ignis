/**
 * Keys the S3 wire has to carry encoded: non-ASCII, space, `+`, `%`, `?`, `#`.
 *
 * Every request goes through real `fetch` to a local server that checks it the way S3 does - it
 * rebuilds the SigV4 signature from what arrived on the wire, with an implementation independent of
 * the one under test. A header Bun refuses never leaves the process, and a header signed in one form
 * but sent in another fails the rebuild.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash, createHmac } from 'node:crypto';
import { BunS3Helper } from '@/modules/storage/bun-s3';
import { buildSignedRequest } from '@/modules/storage/bun-s3/utility';

const CREDENTIALS = { accessKey: 'AKIAEXAMPLE', secretKey: 'test-secret', region: 'us-east-1' };
const BUCKET = 'uploads';

interface IReceivedRequest {
  method: string;
  path: string;
  headers: Headers;
  isSignatureValid: boolean;
  form?: Record<string, string>;
}

const sha256Hex = (opts: { data: string }): string =>
  createHash('sha256').update(opts.data, 'utf8').digest('hex');

const hmac = (opts: { key: Buffer | string; data: string }): Buffer =>
  createHmac('sha256', opts.key).update(opts.data, 'utf8').digest();

const deriveSigningKey = (opts: { dateStamp: string }): Buffer => {
  const dateKey = hmac({ key: `AWS4${CREDENTIALS.secretKey}`, data: opts.dateStamp });
  const regionKey = hmac({ key: dateKey, data: CREDENTIALS.region });
  const serviceKey = hmac({ key: regionKey, data: 's3' });
  return hmac({ key: serviceKey, data: 'aws4_request' });
};

/** S3's canonical query: every pair re-encoded the RFC 3986 way, sorted by name. */
const encodeRfc3986 = (opts: { value: string }): string =>
  encodeURIComponent(opts.value).replace(
    /[!'()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const toCanonicalQuery = (opts: { params: Array<[string, string]> }): string =>
  opts.params
    .map(([name, value]) => [encodeRfc3986({ value: name }), encodeRfc3986({ value })])
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');

const toSignature = (opts: {
  method: string;
  path: string;
  query: string;
  headers: Headers;
  signedHeaders: string[];
  payloadHash: string;
  amzDate: string;
}): string => {
  const { method, path, query, headers, signedHeaders, payloadHash, amzDate } = opts;
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders = signedHeaders
    .map(name => `${name}:${(headers.get(name) ?? '').trim()}\n`)
    .join('');
  const canonicalRequest = [
    method,
    path,
    query,
    canonicalHeaders,
    signedHeaders.join(';'),
    payloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateStamp}/${CREDENTIALS.region}/s3/aws4_request`,
    sha256Hex({ data: canonicalRequest }),
  ].join('\n');

  return hmac({ key: deriveSigningKey({ dateStamp }), data: stringToSign }).toString('hex');
};

/** Header-signed request: `Authorization` names the headers, the path is taken exactly as it arrived. */
const isHeaderSignatureValid = (opts: { request: Request; url: URL }): boolean => {
  const { request, url } = opts;
  const authorization = request.headers.get('authorization') ?? '';
  const match = /SignedHeaders=([^,]+), Signature=([0-9a-f]+)$/.exec(authorization);
  if (!match) {
    return false;
  }

  const expected = toSignature({
    method: request.method,
    path: url.pathname,
    query: toCanonicalQuery({ params: [...url.searchParams] }),
    headers: request.headers,
    signedHeaders: match[1].split(';'),
    payloadHash: request.headers.get('x-amz-content-sha256') ?? '',
    amzDate: request.headers.get('x-amz-date') ?? '',
  });

  return expected === match[2];
};

/** Query-signed request: the signature and its header list travel in the URL. */
const isQuerySignatureValid = (opts: { request: Request; url: URL }): boolean => {
  const { request, url } = opts;
  const params = [...url.searchParams].filter(([name]) => name !== 'X-Amz-Signature');

  const expected = toSignature({
    method: request.method,
    path: url.pathname,
    query: toCanonicalQuery({ params }),
    headers: request.headers,
    signedHeaders: (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';'),
    payloadHash: 'UNSIGNED-PAYLOAD',
    amzDate: url.searchParams.get('X-Amz-Date') ?? '',
  });

  return expected === url.searchParams.get('X-Amz-Signature');
};

/** POST policy: S3 signs the base64 policy itself, then checks every condition against the form. */
const isPolicySignatureValid = (opts: { form: Record<string, string> }): boolean => {
  const { form } = opts;
  const dateStamp = (form['x-amz-date'] ?? '').slice(0, 8);
  const expected = hmac({ key: deriveSigningKey({ dateStamp }), data: form['policy'] ?? '' });

  return expected.toString('hex') === form['x-amz-signature'];
};

const received: IReceivedRequest[] = [];
let server: ReturnType<typeof Bun.serve>;
let endpoint: string;

const buildHelper = () => new BunS3Helper({ ...CREDENTIALS, endpoint: { default: endpoint } });

/** The one received request a call produced, cleared so the next call starts empty. */
const takeReceived = (): IReceivedRequest | undefined => received.splice(0).at(-1);

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async request => {
      const url = new URL(request.url);
      const isPost = request.method === 'POST';
      const form: Record<string, string> = {};

      if (isPost) {
        const formData = await request.formData();
        for (const [name, value] of formData.entries()) {
          if (typeof value === 'string') {
            form[name] = value;
          }
        }
      }

      received.push({
        method: request.method,
        path: url.pathname,
        headers: request.headers,
        form: isPost ? form : undefined,
        isSignatureValid: isPost
          ? isPolicySignatureValid({ form })
          : url.searchParams.has('X-Amz-Signature')
            ? isQuerySignatureValid({ request, url })
            : isHeaderSignatureValid({ request, url }),
      });

      return new Response('<CopyObjectResult></CopyObjectResult>', { status: 200 });
    },
  });
  endpoint = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server.stop(true);
});

/** Each key and the copy source S3 expects for it: every segment percent-encoded, separators literal. */
const COPY_SOURCE_CASES: Array<{ key: string; copySource: string }> = [
  {
    key: 'pending/0b6c/Kiểm kê.xlsx',
    copySource: '/uploads/pending/0b6c/Ki%E1%BB%83m%20k%C3%AA.xlsx',
  },
  { key: 'pending/0b6c/my file.xlsx', copySource: '/uploads/pending/0b6c/my%20file.xlsx' },
  { key: 'pending/0b6c/a+b.xlsx', copySource: '/uploads/pending/0b6c/a%2Bb.xlsx' },
  { key: 'pending/0b6c/100%.xlsx', copySource: '/uploads/pending/0b6c/100%25.xlsx' },
  { key: 'pending/0b6c/what?.xlsx', copySource: '/uploads/pending/0b6c/what%3F.xlsx' },
  { key: 'pending/0b6c/no#1.xlsx', copySource: '/uploads/pending/0b6c/no%231.xlsx' },
  {
    key: 'pending/0b6c/plain-name_1.xlsx',
    copySource: '/uploads/pending/0b6c/plain-name_1.xlsx',
  },
];

describe('BunS3Helper.copyObject - the copy source is URL-encoded', () => {
  test.each(COPY_SOURCE_CASES)('$key', async ({ key, copySource }) => {
    const destinationKey = key.replace('pending/', '');

    await buildHelper().copyObject({
      bucket: { name: BUCKET },
      source: { key },
      destination: { key: destinationKey },
    });

    const request = takeReceived();
    expect(request?.headers.get('x-amz-copy-source')).toBe(copySource);
    expect(request?.isSignatureValid).toBe(true);
  });

  /** S3 decodes the header once and splits `?versionId=` off it, so a raw `?` or `%` names another object. */
  test.each(COPY_SOURCE_CASES)('S3 decodes the source back to $key', async ({ key }) => {
    await buildHelper().copyObject({
      bucket: { name: BUCKET },
      source: { key },
      destination: { key: 'committed.xlsx' },
    });

    const copySource = takeReceived()?.headers.get('x-amz-copy-source') ?? '';
    const [sourcePath, versionQuery] = copySource.split('?');

    expect(versionQuery).toBeUndefined();
    expect(decodeURIComponent(sourcePath)).toBe(`/${BUCKET}/${key}`);
  });

  test('the destination path is encoded and signed as it goes on the wire', async () => {
    await buildHelper().copyObject({
      bucket: { name: BUCKET },
      source: { key: 'pending/0b6c/Kiểm kê.xlsx' },
      destination: { key: '0b6c/Kiểm kê.xlsx' },
    });

    const request = takeReceived();
    expect(request?.method).toBe('PUT');
    expect(request?.path).toBe('/uploads/0b6c/Ki%E1%BB%83m%20k%C3%AA.xlsx');
    expect(request?.isSignatureValid).toBe(true);
  });

  /** Positive control: the verifier refuses a header that was changed after signing. */
  test('the verifier refuses a copy source sent in a form other than the one signed', async () => {
    const signed = await buildSignedRequest({
      ...CREDENTIALS,
      method: 'PUT',
      endpoint,
      path: '/uploads/committed.xlsx',
      headers: { 'x-amz-copy-source': '/uploads/pending/a%2Bb.xlsx' },
    });

    await fetch(signed.url, {
      method: 'PUT',
      headers: { ...signed.headers, 'x-amz-copy-source': '/uploads/pending/a+b.xlsx' },
    });

    expect(takeReceived()?.isSignatureValid).toBe(false);
  });
});

describe('BunS3Helper.presignPut - a non-ASCII key signs the path the browser sends', () => {
  test.each(COPY_SOURCE_CASES)('$key', async ({ key, copySource }) => {
    const url = await buildHelper().presignPut({
      bucket: { name: BUCKET },
      object: { key },
      contentType: 'application/octet-stream',
    });

    await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: 'bytes',
    });

    const request = takeReceived();
    expect(request?.path).toBe(copySource);
    expect(request?.isSignatureValid).toBe(true);
  });
});

describe('BunS3Helper.presignPost - a non-ASCII key travels as a form field', () => {
  test.each(COPY_SOURCE_CASES)('$key', async ({ key }) => {
    const policy = await buildHelper().presignPost({
      bucket: { name: BUCKET },
      keyPrefix: 'pending/',
      maxBytes: 1024,
    });

    const form = new FormData();
    for (const [name, value] of Object.entries(policy.formData)) {
      form.append(name, value);
    }
    form.append('key', key);
    form.append('file', new Blob(['bytes']), 'upload.bin');

    await fetch(policy.postURL, { method: 'POST', body: form });

    const request = takeReceived();
    expect(request?.isSignatureValid).toBe(true);
    expect(request?.form?.['key']).toBe(key);
    expect(request?.form?.['key']?.startsWith('pending/')).toBe(true);
  });
});
