// Minimal AWS Signature V4 helpers for bucket-management operations (object ops use Bun's S3Client natively).

import { getError } from '@/modules/error';

const hmacSHA256 = async (opts: {
  key: Uint8Array<ArrayBuffer> | string;
  data: string;
}): Promise<Uint8Array<ArrayBuffer>> => {
  const { key, data } = opts;
  const rawKey = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(signature);
};

const toHex = (opts: { bytes: Uint8Array }): string =>
  Array.from(opts.bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

const sha256Hex = async (opts: { data: string }): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(opts.data));
  return toHex({ bytes: new Uint8Array(digest) });
};

/** SigV4 canonical form needs every reserved character `encodeURIComponent` leaves untouched also percent-encoded. */
const encodeSigV4Component = (opts: { value: string }): string =>
  encodeURIComponent(opts.value).replace(
    /[!'()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** Signing the raw path answers 403 SignatureDoesNotMatch, because `fetch` encodes it on the wire. Separators stay literal. */
const encodeSigV4Path = (opts: { path: string }): string =>
  opts.path
    .split('/')
    .map(segment => encodeSigV4Component({ value: segment }))
    .join('/');

/** Empty or absent query must sign identically to today - callers of getBuckets/createBucket/removeBucket depend on it. */
const buildCanonicalQueryString = (query?: Record<string, string>): string => {
  if (!query) {
    return '';
  }

  const keys = Object.keys(query);
  if (keys.length === 0) {
    return '';
  }

  return keys
    .sort()
    .map(
      key =>
        `${encodeSigV4Component({ value: key })}=${encodeSigV4Component({ value: query[key] })}`,
    )
    .join('&');
};

export async function buildSignedRequest(opts: {
  method: string;
  endpoint: string;
  path: string;
  accessKey: string;
  secretKey: string;
  region: string;
  sessionToken?: string;
  body?: string;
  query?: Record<string, string>;
  /** Extra headers to SIGN, not merely to send - anything outside `SignedHeaders` is refused by S3. */
  headers?: Record<string, string>;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const {
    method,
    endpoint,
    path,
    accessKey,
    secretKey,
    region,
    sessionToken,
    body = '',
    query,
    headers: extraHeaders,
  } = opts;

  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalQueryString = buildCanonicalQueryString(query);
  const canonicalPath = encodeSigV4Path({ path });
  const baseUrl = `${endpoint.replace(/\/$/, '')}${canonicalPath}`;
  const url = canonicalQueryString ? `${baseUrl}?${canonicalQueryString}` : baseUrl;
  const host = new URL(endpoint).host;
  const payloadHash = await sha256Hex({ data: body });

  const canonicalHeadersMap: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (sessionToken) {
    canonicalHeadersMap['x-amz-security-token'] = sessionToken;
  }

  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    canonicalHeadersMap[key.toLowerCase()] = value;
  }

  const sortedKeys = Object.keys(canonicalHeadersMap).sort();
  const canonicalHeaders = sortedKeys.map(k => `${k}:${canonicalHeadersMap[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [
    method,
    canonicalPath,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex({ data: canonicalRequest }),
  ].join('\n');

  const dateKey = await hmacSHA256({ key: `AWS4${secretKey}`, data: dateStamp });
  const regionKey = await hmacSHA256({ key: dateKey, data: region });
  const serviceKey = await hmacSHA256({ key: regionKey, data: 's3' });
  const signingKey = await hmacSHA256({ key: serviceKey, data: 'aws4_request' });
  const signature = toHex({ bytes: await hmacSHA256({ key: signingKey, data: stringToSign }) });

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const contentLength = String(new TextEncoder().encode(body).length);

  return {
    url,
    headers: {
      ...canonicalHeadersMap,
      Authorization: authHeader,
      'Content-Length': contentLength,
    },
  };
}

const escapeXmlText = (opts: { value: string }): string =>
  opts.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** `&amp;` decodes LAST - a literal `&lt;` in the source text must not turn into `<` through the `&amp;` step. */
const unescapeXmlText = (opts: { value: string }): string =>
  opts.value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** S3's PUT tagging body - no XML dependency, so this is hand-built rather than templated by a library. */
export const buildTaggingXml = (opts: { tags: Record<string, string> }): string => {
  const tagEntries = Object.entries(opts.tags)
    .map(
      ([key, value]) =>
        `<Tag><Key>${escapeXmlText({ value: key })}</Key><Value>${escapeXmlText({ value })}</Value></Tag>`,
    )
    .join('');

  return `<Tagging><TagSet>${tagEntries}</TagSet></Tagging>`;
};

/** S3's GET tagging response - hand-parsed rather than a full XML parser; throws rather than returning a half-parsed object. */
export const parseTaggingXml = (opts: { xml: string }): Record<string, string> => {
  const { xml } = opts;
  const trimmed = xml.trim();

  if (/<TagSet\s*\/>/.test(trimmed) || /<TagSet>\s*<\/TagSet>/.test(trimmed)) {
    return {};
  }

  const tagSetMatch = trimmed.match(/<TagSet>([\s\S]*?)<\/TagSet>/);
  if (!tagSetMatch) {
    throw getError({ message: `[parseTaggingXml] Malformed tagging response | body: ${xml}` });
  }

  const tags: Record<string, string> = {};
  const tagMatches = tagSetMatch[1].matchAll(/<Tag>([\s\S]*?)<\/Tag>/g);

  for (const tagMatch of tagMatches) {
    const keyMatch = tagMatch[1].match(/<Key>([\s\S]*?)<\/Key>/);
    const valueMatch = tagMatch[1].match(/<Value>([\s\S]*?)<\/Value>/);

    if (!keyMatch || !valueMatch) {
      throw getError({ message: `[parseTaggingXml] Malformed tag entry | body: ${xml}` });
    }

    const key = unescapeXmlText({ value: keyMatch[1].trim() });
    const value = unescapeXmlText({ value: valueMatch[1].trim() });
    tags[key] = value;
  }

  return tags;
};

/**
 * A signed POST policy: the form a browser posts straight to S3.
 *
 * This is not a presigned PUT and the difference is the point. A signed PUT binds each header to an
 * EXACT value, so `content-length` names one byte count and never a ceiling - every retry or
 * re-encode becomes an opaque 403. A policy carries `content-length-range`, so "at most N bytes" is
 * expressible at all.
 */
export async function buildPostPolicy(opts: {
  bucket: string;
  keyPrefix: string;
  maxBytes: number;
  expiresInSeconds: number;
  accessKey: string;
  secretKey: string;
  region: string;
  sessionToken?: string;
  contentType?: string;
}): Promise<{ formData: Record<string, string>; expiresAt: string }> {
  const {
    bucket,
    keyPrefix,
    maxBytes,
    expiresInSeconds,
    accessKey,
    secretKey,
    region,
    sessionToken,
    contentType,
  } = opts;

  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${accessKey}/${credentialScope}`;
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

  // Every field the browser posts must ALSO be a condition, or S3 refuses the form it just signed.
  const fields: Record<string, string> = {
    'x-amz-algorithm': 'AWS4-HMAC-SHA256',
    'x-amz-credential': credential,
    'x-amz-date': amzDate,
    ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
  };

  const conditions: unknown[] = [
    { bucket },
    ['starts-with', '$key', keyPrefix],
    ['content-length-range', 0, maxBytes],
    ...Object.entries(fields).map(([key, value]) => ({ [key]: value })),
    ...(contentType ? [{ 'Content-Type': contentType }] : []),
  ];

  const policy = Buffer.from(JSON.stringify({ expiration: expiresAt, conditions })).toString(
    'base64',
  );

  const dateKey = await hmacSHA256({ key: `AWS4${secretKey}`, data: dateStamp });
  const regionKey = await hmacSHA256({ key: dateKey, data: region });
  const serviceKey = await hmacSHA256({ key: regionKey, data: 's3' });
  const signingKey = await hmacSHA256({ key: serviceKey, data: 'aws4_request' });

  return {
    formData: {
      ...fields,
      ...(contentType ? { 'Content-Type': contentType } : {}),
      policy,
      'x-amz-signature': toHex({ bytes: await hmacSHA256({ key: signingKey, data: policy }) }),
    },
    expiresAt,
  };
}
