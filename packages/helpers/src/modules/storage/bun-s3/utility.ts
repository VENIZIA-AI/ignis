// ---------------------------------------------------------------------------
// Minimal AWS Signature V4 helpers for bucket-management operations
// (object operations use Bun's S3Client natively)
// ---------------------------------------------------------------------------

async function hmacSHA256(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const rawKey = typeof key === 'string' ? new TextEncoder().encode(key) : key;

  const k = await crypto.subtle.importKey(
    'raw',
    rawKey as any,
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

export async function buildSignedRequest(opts: {
  method: string;
  endpoint: string;
  path: string;
  accessKey: string;
  secretKey: string;
  region: string;
  sessionToken?: string;
  body?: string;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const { method, endpoint, path, accessKey, secretKey, region, sessionToken, body = '' } = opts;

  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);

  const url = `${endpoint.replace(/\/$/, '')}${path}`;
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

  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join(
    '\n',
  );

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
