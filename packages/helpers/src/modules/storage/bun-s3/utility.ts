// Minimal AWS Signature V4 helpers for bucket-management operations (object ops use Bun's S3Client natively).

import { getError } from '@/modules/error';

async function hmacSHA256(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const rawKey = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const k = await crypto.subtle.importKey(
    'raw',
    rawKey as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function toHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return toHex(new Uint8Array(digest));
}

/** SigV4 canonical form needs every reserved character `encodeURIComponent` leaves untouched also percent-encoded. */
const encodeSigV4Component = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * Object keys carry spaces and non-ASCII text, which `fetch` percent-encodes on the wire. Signing the
 * raw path then sends a request S3 canonicalises differently, so it answers 403 SignatureDoesNotMatch.
 * Separators stay literal: S3 encodes a key path segment by segment.
 */
const encodeSigV4Path = (path: string): string =>
  path
    .split('/')
    .map(segment => encodeSigV4Component(segment))
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
    .map(key => `${encodeSigV4Component(key)}=${encodeSigV4Component(query[key])}`)
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
  } = opts;

  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalQueryString = buildCanonicalQueryString(query);
  const canonicalPath = encodeSigV4Path(path);
  const baseUrl = `${endpoint.replace(/\/$/, '')}${canonicalPath}`;
  const url = canonicalQueryString ? `${baseUrl}?${canonicalQueryString}` : baseUrl;
  const host = new URL(endpoint).host;
  const payloadHash = await sha256Hex(body);

  const canonicalHeadersMap: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (sessionToken) {
    canonicalHeadersMap['x-amz-security-token'] = sessionToken;
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
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmacSHA256(`AWS4${secretKey}`, dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, 's3');
  const kSigning = await hmacSHA256(kService, 'aws4_request');
  const signature = toHex(await hmacSHA256(kSigning, stringToSign));

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

const escapeXmlText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** `&amp;` decodes LAST - a literal `&lt;` in the source text must not turn into `<` through the `&amp;` step. */
const unescapeXmlText = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** S3's PUT tagging body - no XML dependency, so this is hand-built rather than templated by a library. */
export const buildTaggingXml = (tags: Record<string, string>): string => {
  const tagEntries = Object.entries(tags)
    .map(
      ([key, value]) =>
        `<Tag><Key>${escapeXmlText(key)}</Key><Value>${escapeXmlText(value)}</Value></Tag>`,
    )
    .join('');

  return `<Tagging><TagSet>${tagEntries}</TagSet></Tagging>`;
};

/** S3's GET tagging response - hand-parsed rather than a full XML parser; throws rather than returning a half-parsed object. */
export const parseTaggingXml = (xml: string): Record<string, string> => {
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

    const key = unescapeXmlText(keyMatch[1].trim());
    const value = unescapeXmlText(valueMatch[1].trim());
    tags[key] = value;
  }

  return tags;
};
