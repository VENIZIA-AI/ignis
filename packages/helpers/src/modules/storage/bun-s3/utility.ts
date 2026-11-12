// Minimal AWS Signature V4 helpers for bucket-management operations (object ops use Bun's S3Client natively).

import { HTTP, type THttpMethod } from '@/common/constants/http';
import { getError } from '@/modules/error';
import { S3Headers, S3Signing } from '../common';

export class S3SignatureUtility {
  private static async hmacSHA256(opts: {
    key: Uint8Array<ArrayBuffer> | string;
    data: string;
  }): Promise<Uint8Array<ArrayBuffer>> {
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
  }

  private static toHex(opts: { bytes: Uint8Array }): string {
    return Array.from(opts.bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private static async sha256Hex(opts: { data: string }): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(opts.data));

    return S3SignatureUtility.toHex({ bytes: new Uint8Array(digest) });
  }

  /** SigV4 canonical form needs every reserved character `encodeURIComponent` leaves untouched also percent-encoded. */
  private static encodeSigV4Component(opts: { value: string }): string {
    return encodeURIComponent(opts.value).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }

  /** Signing the raw path answers 403 SignatureDoesNotMatch, because `fetch` encodes it on the wire. Separators stay literal. */
  private static encodeSigV4Path(opts: { path: string }): string {
    return opts.path
      .split('/')
      .map((segment) => S3SignatureUtility.encodeSigV4Component({ value: segment }))
      .join('/');
  }

  /** `x-amz-copy-source`: S3 URL-decodes it once and splits `?versionId=` off, so a raw `?`, `%` or `+` names another object and a non-Latin-1 key is not a legal header value. */
  static buildCopySource(opts: { bucket: string; key: string; versionId?: string }): string {
    const source = S3SignatureUtility.encodeSigV4Path({ path: `/${opts.bucket}/${opts.key}` });

    return opts.versionId === undefined
      ? source
      : `${source}?versionId=${S3SignatureUtility.encodeSigV4Component({ value: opts.versionId })}`;
  }

  /** Empty or absent query must sign identically to today - callers of getBuckets/createBucket/removeBucket depend on it. */
  private static buildCanonicalQueryString(opts: {
    query?: Record<string, string | undefined>;
  }): string {
    const { query } = opts;

    if (!query) {
      return '';
    }

    const keys = Object.keys(query).filter((key) => query[key] !== undefined);

    if (keys.length === 0) {
      return '';
    }

    return keys
      .sort()
      .map(
        (key) =>
          `${S3SignatureUtility.encodeSigV4Component({ value: key })}=${S3SignatureUtility.encodeSigV4Component({ value: query[key] ?? '' })}`,
      )
      .join('&');
  }

  /** The SigV4 four-step chain. Each step keys the next, so the final key is bound to date, region and service. */
  private static async deriveSigningKey(opts: {
    secretKey: string;
    dateStamp: string;
    region: string;
  }): Promise<Uint8Array<ArrayBuffer>> {
    const { secretKey, dateStamp, region } = opts;
    const dateKey = await S3SignatureUtility.hmacSHA256({
      key: `AWS4${secretKey}`,
      data: dateStamp,
    });
    const regionKey = await S3SignatureUtility.hmacSHA256({ key: dateKey, data: region });
    const serviceKey = await S3SignatureUtility.hmacSHA256({
      key: regionKey,
      data: S3Signing.SERVICE,
    });

    return S3SignatureUtility.hmacSHA256({ key: serviceKey, data: S3Signing.REQUEST_TYPE });
  }

  /** `20130524T000000Z` and its `20130524` prefix - the two forms every signature needs. */
  private static toAmzDate(opts: { now: Date }): { amzDate: string; dateStamp: string } {
    const amzDate = opts.now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');

    return { amzDate, dateStamp: amzDate.slice(0, 8) };
  }

  private static buildCredentialScope(opts: { dateStamp: string; region: string }): string {
    return `${opts.dateStamp}/${opts.region}/${S3Signing.SERVICE}/${S3Signing.REQUEST_TYPE}`;
  }

  /** Lower-cases each header name into `target` and leaves out a header whose value is `undefined`. */
  private static addSignedHeaders(opts: {
    target: Record<string, string>;
    headers?: Record<string, string | undefined>;
    /** SigV4 compares header values after trimming, so signing an untrimmed one answers 403. */
    trim?: boolean;
  }): void {
    for (const [key, value] of Object.entries(opts.headers ?? {})) {
      if (value !== undefined) {
        opts.target[key.toLowerCase()] = opts.trim ? value.trim() : value;
      }
    }
  }

  static async buildSignedRequest(opts: {
    method: THttpMethod;
    endpoint: string;
    path: string;
    accessKey: string;
    secretKey: string;
    region: string;
    sessionToken?: string;
    body?: string;
    /** A key whose value is `undefined` is left out. */
    query?: Record<string, string | undefined>;
    /** Extra headers to SIGN, not merely to send - anything outside `SignedHeaders` is refused by S3. A key whose value is `undefined` is left out. */
    headers?: Record<string, string | undefined>;
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

    const { amzDate, dateStamp } = S3SignatureUtility.toAmzDate({ now: new Date() });

    const canonicalQueryString = S3SignatureUtility.buildCanonicalQueryString({ query });
    const canonicalPath = S3SignatureUtility.encodeSigV4Path({ path });
    const baseUrl = `${endpoint.replace(/\/$/, '')}${canonicalPath}`;
    const url = canonicalQueryString ? `${baseUrl}?${canonicalQueryString}` : baseUrl;
    const host = new URL(endpoint).host;
    const payloadHash = await S3SignatureUtility.sha256Hex({ data: body });

    const canonicalHeadersMap: Record<string, string> = {
      [HTTP.Headers.HOST]: host,
      [S3Headers.CONTENT_SHA256]: payloadHash,
      [S3Headers.DATE]: amzDate,
    };

    if (sessionToken) {
      canonicalHeadersMap[S3Headers.SECURITY_TOKEN] = sessionToken;
    }

    S3SignatureUtility.addSignedHeaders({ target: canonicalHeadersMap, headers: extraHeaders });

    const sortedKeys = Object.keys(canonicalHeadersMap).sort();
    const canonicalHeaders = sortedKeys.map((k) => `${k}:${canonicalHeadersMap[k]}\n`).join('');
    const signedHeaders = sortedKeys.join(';');

    const canonicalRequest = [
      method.toUpperCase(),
      canonicalPath,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = S3SignatureUtility.buildCredentialScope({ dateStamp, region });
    const result = await S3SignatureUtility.sha256Hex({ data: canonicalRequest });
    const stringToSign = [S3Signing.ALGORITHM, amzDate, credentialScope, result].join('\n');

    const signingKey = await S3SignatureUtility.deriveSigningKey({ secretKey, dateStamp, region });
    const result2 = await S3SignatureUtility.hmacSHA256({ key: signingKey, data: stringToSign });
    const signature = S3SignatureUtility.toHex({ bytes: result2 });

    const authHeader = `${S3Signing.ALGORITHM} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
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

  private static escapeXmlText(opts: { value: string }): string {
    return opts.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** `&amp;` decodes LAST - a literal `&lt;` in the source text must not turn into `<` through the `&amp;` step. */
  private static unescapeXmlText(opts: { value: string }): string {
    return opts.value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  /** S3's PUT tagging body - no XML dependency, so this is hand-built rather than templated by a library. */
  static buildTaggingXml(opts: { tags: Record<string, string> }): string {
    const tagEntries = Object.entries(opts.tags)
      .map(
        ([key, value]) =>
          `<Tag><Key>${S3SignatureUtility.escapeXmlText({ value: key })}</Key><Value>${S3SignatureUtility.escapeXmlText({ value })}</Value></Tag>`,
      )
      .join('');

    return `<Tagging><TagSet>${tagEntries}</TagSet></Tagging>`;
  }

  /** The `x-amz-tagging` header: a URL-encoded query string, unlike the XML the tagging API takes. */
  static buildTaggingHeader(opts: { tags: Record<string, string> }): string {
    return Object.entries(opts.tags)
      .map(
        ([key, value]) =>
          `${S3SignatureUtility.encodeSigV4Component({ value: key })}=${S3SignatureUtility.encodeSigV4Component({ value })}`,
      )
      .join('&');
  }

  /** S3's GET tagging response - hand-parsed rather than a full XML parser; throws rather than returning a half-parsed object. */
  static parseTaggingXml(opts: { xml: string }): Record<string, string> {
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

      const key = S3SignatureUtility.unescapeXmlText({ value: keyMatch[1].trim() });
      const value = S3SignatureUtility.unescapeXmlText({ value: valueMatch[1].trim() });
      tags[key] = value;
    }

    return tags;
  }

  /**
   * A signed POST policy: the form a browser posts straight to S3.
   *
   * This is not a presigned PUT and the difference is the point. A signed PUT binds each header to an
   * EXACT value, so `content-length` names one byte count and never a ceiling - every retry or
   * re-encode becomes an opaque 403. A policy carries `content-length-range`, so "at most N bytes" is
   * expressible at all.
   */
  static async buildPostPolicy(opts: {
    bucket: string;
    /** The ONE key the form may be posted under. */
    key: string;
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
      key,
      maxBytes,
      expiresInSeconds,
      accessKey,
      secretKey,
      region,
      sessionToken,
      contentType,
    } = opts;

    const now = new Date();
    const { amzDate, dateStamp } = S3SignatureUtility.toAmzDate({ now });
    const credential = `${accessKey}/${S3SignatureUtility.buildCredentialScope({ dateStamp, region })}`;
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

    // Every field the browser posts must ALSO be a condition, or S3 refuses the form it just signed.
    const fields: Record<string, string> = {
      'x-amz-algorithm': S3Signing.ALGORITHM,
      'x-amz-credential': credential,
      [S3Headers.DATE]: amzDate,
    };

    if (sessionToken) {
      fields[S3Headers.SECURITY_TOKEN] = sessionToken;
    }

    const conditions: unknown[] = [
      { bucket },
      { key },
      ['content-length-range', 0, maxBytes],
      ...Object.entries(fields).map(([fieldName, fieldValue]) => ({ [fieldName]: fieldValue })),
    ];

    // The form field is spelled `Content-Type`; a policy condition matches it case-sensitively.
    const typeField = 'Content-Type';

    if (contentType) {
      conditions.push({ [typeField]: contentType });
    }

    const policy = Buffer.from(JSON.stringify({ expiration: expiresAt, conditions })).toString(
      'base64',
    );

    const signingKey = await S3SignatureUtility.deriveSigningKey({ secretKey, dateStamp, region });

    const result = await S3SignatureUtility.hmacSHA256({ key: signingKey, data: policy });

    const formData: Record<string, string> = { key, ...fields };

    if (contentType) {
      formData[typeField] = contentType;
    }

    formData.policy = policy;
    formData['x-amz-signature'] = S3SignatureUtility.toHex({ bytes: result });

    return { formData, expiresAt };
  }

  /**
   * A presigned URL: the credential travels in the QUERY, so a browser needs no `Authorization` header.
   *
   * `headers` is what `S3Client.presign` cannot do. Anything named there is inside the signature and
   * listed in `X-Amz-SignedHeaders`, so the client must send it back byte for byte. A signature
   * expresses equality and nothing else, so a pinned `content-length` rejects every retry at another
   * size; for a ceiling, use {@link S3SignatureUtility.buildPostPolicy}.
   */
  static async buildPresignedUrl(opts: {
    method: THttpMethod;
    endpoint: string;
    path: string;
    accessKey: string;
    secretKey: string;
    region: string;
    sessionToken?: string;
    expiresInSeconds: number;
    /** Headers to SIGN. The client must send each one unchanged, or S3 answers 403. A key whose value is `undefined` is left out. */
    headers?: Record<string, string | undefined>;
    /** A fixed clock, so a signature can be checked against a published test vector. */
    now?: Date;
  }): Promise<string> {
    const {
      method,
      endpoint,
      path,
      accessKey,
      secretKey,
      region,
      sessionToken,
      expiresInSeconds,
      headers,
      now = new Date(),
    } = opts;

    const { amzDate, dateStamp } = S3SignatureUtility.toAmzDate({ now });
    const credentialScope = S3SignatureUtility.buildCredentialScope({ dateStamp, region });
    const canonicalPath = S3SignatureUtility.encodeSigV4Path({ path });
    const origin = endpoint.replace(/\/$/, '');

    const canonicalHeadersMap: Record<string, string> = {
      [HTTP.Headers.HOST]: new URL(origin).host,
    };

    S3SignatureUtility.addSignedHeaders({ target: canonicalHeadersMap, headers, trim: true });

    const sortedKeys = Object.keys(canonicalHeadersMap).sort();
    const signedHeaders = sortedKeys.join(';');

    // `X-Amz-SignedHeaders` is itself signed, so the header list has to be settled before the query.
    const queryParameters: Record<string, string> = {
      'X-Amz-Algorithm': S3Signing.ALGORITHM,
      'X-Amz-Credential': `${accessKey}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': signedHeaders,
    };

    if (sessionToken) {
      queryParameters['X-Amz-Security-Token'] = sessionToken;
    }

    const canonicalQueryString = S3SignatureUtility.buildCanonicalQueryString({
      query: queryParameters,
    });

    // A presigned URL is signed before its body exists, so the payload is excluded by name.
    const canonicalRequest = [
      method.toUpperCase(),
      canonicalPath,
      canonicalQueryString,
      sortedKeys.map((key) => `${key}:${canonicalHeadersMap[key]}\n`).join(''),
      signedHeaders,
      S3Signing.UNSIGNED_PAYLOAD,
    ].join('\n');

    const result = await S3SignatureUtility.sha256Hex({ data: canonicalRequest });
    const stringToSign = [S3Signing.ALGORITHM, amzDate, credentialScope, result].join('\n');

    const signingKey = await S3SignatureUtility.deriveSigningKey({ secretKey, dateStamp, region });
    const result2 = await S3SignatureUtility.hmacSHA256({ key: signingKey, data: stringToSign });
    const signature = S3SignatureUtility.toHex({ bytes: result2 });

    return `${origin}${canonicalPath}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  }
}
