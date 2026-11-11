import type { IDuration } from '@/common';
import { HTTP, type THttpMethod } from '@/common/constants/http';
import { getError } from '@/modules/error';
import { ErrorPrettier } from '@/modules/logger';
import { EchoUtility } from '@/utilities/echo.utility';
import { S3Client } from 'bun';
import { Readable } from 'node:stream';
import { BaseStorageHelper } from '../base';
import type {
  IBucketInfo,
  IBucketRef,
  IFileStat,
  IListObjectsOptions,
  IObjectInfo,
  IObjectLocation,
  IObjectRef,
  IPostPolicy,
  IStorageHelperOptions,
  IStorageReadCondition,
  IUploadFile,
} from '../common';
import {
  S3Audiences,
  S3Headers,
  StorageErrors,
  StorageTypes,
  StorageUtility,
  StoragePresignDefaults,
} from '../common';
import type { TS3Audience } from '../common';
import { S3SignatureUtility } from './utility';

/** One lower-case DNS label: the only shape a bucket may have when it becomes part of a host. */
const S3_HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Options for `BunS3Helper`. Unset `partSize`, `queueSize` and `retry` leave Bun defaults in force. */
export interface IBunS3HelperOptions extends IStorageHelperOptions {
  accessKey: string;
  secretKey: string;
  /** @default 'us-east-1' */
  region?: string;
  sessionToken?: string;
  /** `default` is the host THIS process talks to; `public` is the host a browser is handed. `host` is inside every SigV4 signature, so a URL signed against an internal name cannot be rewritten later - which is why the two are separate rather than one value patched afterwards. */
  endpoint: {
    default: string;
    /** @default endpoint.default */
    public?: string;
  };

  /**
   * `https://<bucket>.<endpoint>/<key>` instead of `<endpoint>/<bucket>/<key>`. AWS requires it; MinIO and R2 do not.
   *
   * @default false
   */
  virtualHostedStyle?: boolean;
  partSize?: number;
  queueSize?: number;

  /** Retries Bun performs on a failed part before the write fails. */
  retry?: number;
}

/** Storage helper for S3-compatible object stores through Bun's `S3Client`. Uses separate hosts for calls this process makes and for URLs handed to browsers. */
export class BunS3Helper extends BaseStorageHelper {
  readonly storageType = StorageTypes.BUN_S3;

  private client: S3Client;
  private credentials: {
    accessKey: string;
    secretKey: string;
    endpoint: { default: string; public: string };
    region: string;
    sessionToken?: string;
    virtualHostedStyle: boolean;
  };

  /** Undefined leaves Bun's own defaults in force. */
  private transfer: { partSize?: number; queueSize?: number; retry?: number };

  constructor(options: IBunS3HelperOptions) {
    super({
      scope: options.scope ?? BunS3Helper.name,
      identifier: options.identifier ?? BunS3Helper.name,
    });

    this.credentials = {
      accessKey: options.accessKey,
      secretKey: options.secretKey,
      endpoint: {
        default: options.endpoint.default,
        // Falls back to the default, so one reachable host still serves both audiences.
        public: options.endpoint.public ?? options.endpoint.default,
      },
      region: options.region ?? 'us-east-1',
      sessionToken: options.sessionToken,
      virtualHostedStyle: options.virtualHostedStyle ?? false,
    };

    this.transfer = {
      partSize: options.partSize,
      queueSize: options.queueSize,
      retry: options.retry,
    };

    this.client = new S3Client({
      accessKeyId: options.accessKey,
      secretAccessKey: options.secretKey,
      endpoint: options.endpoint.default,
      region: options.region,
      sessionToken: options.sessionToken,
      virtualHostedStyle: options.virtualHostedStyle,
    });
  }

  /** One bucket's objects, in either addressing style. `audience` picks the host: `server` for a call this process makes, `browser` for a URL it hands out. Virtual-hosted derives the per-bucket host, because the bucket arrives per call. */
  private objectEndpoint(opts: { bucket: string; audience: TS3Audience }): {
    endpoint: string;
    pathPrefix: string;
  } {
    const { endpoint, virtualHostedStyle } = this.credentials;
    const host = opts.audience === S3Audiences.BROWSER ? endpoint.public : endpoint.default;

    if (!virtualHostedStyle) {
      return { endpoint: host, pathPrefix: `/${opts.bucket}` };
    }

    // The bucket becomes a label of the host, so it must be one: anything else (a dot, a slash, an `@`, a port) would steer the request to another host.
    if (!S3_HOST_LABEL_PATTERN.test(opts.bucket)) {
      throw getError({
        message: `[objectEndpoint] A bucket used in a host must be one lower-case DNS label (a-z, 0-9, hyphen; 1-63 characters) | bucket: '${EchoUtility.toSafeText({ value: opts.bucket })}'`,
      });
    }

    const parsed = new URL(host);
    parsed.hostname = `${opts.bucket}.${parsed.hostname}`;

    return { endpoint: parsed.origin, pathPrefix: '' };
  }

  /** Per-call overrides, so one client serves every bucket in either addressing style. */
  private presignOptions(opts: { bucket: string }): {
    bucket: string;
    endpoint: string;
    virtualHostedStyle?: boolean;
  } {
    const { virtualHostedStyle } = this.credentials;
    const { endpoint } = this.objectEndpoint({
      bucket: opts.bucket,
      audience: S3Audiences.BROWSER,
    });

    return {
      bucket: opts.bucket,
      endpoint,
      ...(virtualHostedStyle ? { virtualHostedStyle: true } : {}),
    };
  }

  /**
   * What a call this process makes on one bucket's objects (or its listing) passes to Bun's client. Path style needs only the
   * bucket. Virtual-hosted style needs the bucket's own host as well: Bun puts the bucket in neither the host nor the path in that
   * mode, so a call without it goes to the bare endpoint (`PUT /k.png` on the endpoint host) and never reaches the object.
   */
  private callOptions(opts: { bucket: string }): {
    bucket: string;
    endpoint?: string;
    virtualHostedStyle?: boolean;
  } {
    if (!this.credentials.virtualHostedStyle) {
      return { bucket: opts.bucket };
    }

    const { endpoint } = this.objectEndpoint({ bucket: opts.bucket, audience: S3Audiences.SERVER });

    return { bucket: opts.bucket, endpoint, virtualHostedStyle: true };
  }

  async hasBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    const { name } = opts.bucket;

    if (!this.isValidBucketName(opts)) {
      return false;
    }

    try {
      await this.client.list({ maxKeys: 1 }, this.callOptions({ bucket: name }));

      return true;
    } catch (error) {
      // A missing bucket is the answer; a credentials or network failure is not, and must not vanish.
      if (!StorageUtility.isNotFoundError({ error })) {
        this.logger.warn(
          '[hasBucket] Cannot determine bucket existence - reporting false | bucket: %s | %s',
          EchoUtility.toSafeEcho({ value: name }),
          ErrorPrettier.format({ error }),
        );
      }

      return false;
    }
  }

  async getBuckets(): Promise<IBucketInfo[]> {
    // A bucket operation is a call this process makes, so it goes to the default host.
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const endpoint = this.credentials.endpoint.default;

    const { url, headers } = await S3SignatureUtility.buildSignedRequest({
      method: 'GET',
      endpoint,
      path: '/',
      accessKey,
      secretKey,
      region,
      sessionToken,
    });

    const response = await fetch(url, { method: 'GET', headers });
    const xml = await response.text();

    if (!response.ok) {
      throw getError({ message: `[getBuckets] S3 error: ${xml}` });
    }

    const buckets: IBucketInfo[] = [];
    const bucketMatches = xml.matchAll(
      /<Bucket>\s*<Name>(.*?)<\/Name>\s*<CreationDate>(.*?)<\/CreationDate>\s*<\/Bucket>/gs,
    );

    for (const match of bucketMatches) {
      buckets.push({
        name: match[1],
        creationDate: new Date(match[2]),
      });
    }

    return buckets;
  }

  /** S3 exposes a creation date only through `ListBuckets`, so one full listing is the cheapest correct answer. */
  async getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    const { name } = opts.bucket;

    if (!this.isValidBucketName(opts)) {
      return null;
    }

    const buckets = await this.getBuckets();

    return buckets.find((bucket) => bucket.name === name) ?? null;
  }

  async createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    const { name } = opts.bucket;

    if (!this.isValidBucketName(opts)) {
      throw getError({ message: '[createBucket] Invalid name to create bucket!' });
    }

    // A bucket operation is a call this process makes, so it goes to the default host.
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const endpoint = this.credentials.endpoint.default;

    const { url, headers } = await S3SignatureUtility.buildSignedRequest({
      method: 'PUT',
      endpoint,
      path: `/${name}`,
      accessKey: accessKey,
      secretKey,
      region,
      sessionToken,
    });

    const response = await fetch(url, { method: 'PUT', headers });

    if (!response.ok) {
      const xml = await response.text();
      throw getError({ message: `[createBucket] S3 error: ${xml}` });
    }

    return this.getBucket(opts);
  }

  async removeBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    const { name } = opts.bucket;

    if (!this.isValidBucketName(opts)) {
      throw getError({ message: '[removeBucket] Invalid name to remove bucket!' });
    }

    // A bucket operation is a call this process makes, so it goes to the default host.
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const endpoint = this.credentials.endpoint.default;

    const { url, headers } = await S3SignatureUtility.buildSignedRequest({
      method: 'DELETE',
      endpoint,
      path: `/${name}`,
      accessKey: accessKey,
      secretKey: secretKey,
      region,
      sessionToken,
    });

    const response = await fetch(url, { method: 'DELETE', headers });

    if (!response.ok) {
      const xml = await response.text();
      throw getError({ message: `[removeBucket] S3 error: ${xml}` });
    }

    return true;
  }

  override async copyObject(opts: {
    bucket: IBucketRef;
    source: IObjectRef;
    destination: IObjectRef;
    ifMatch?: string;
    sourceVersionId?: string;
  }): Promise<void> {
    const { bucket, source, destination, ifMatch, sourceVersionId } = opts;

    // `x-amz-copy-source` is what makes this server side: S3 reads the source itself, so a 500 MB
    // object never travels through this process. The encoded value is both signed and sent.
    const response = await this.signedFetch({
      method: HTTP.Methods.PUT,
      bucket,
      object: destination,
      headers: {
        [S3Headers.COPY_SOURCE]: S3SignatureUtility.buildCopySource({
          bucket: bucket.name,
          key: source.key,
          versionId: sourceVersionId,
        }),
        [S3Headers.COPY_SOURCE_IF_MATCH]: BunS3Helper.quoteEtag({ etag: ifMatch }),
      },
    });

    this.assertObjectResponse({ response, operation: 'copyObject', bucket, object: source });
  }

  override async presignPost(
    opts: IObjectLocation & {
      maxBytes: number;
      contentType?: string;
      expiresIn?: IDuration;
    },
  ): Promise<IPostPolicy> {
    const {
      bucket,
      object,
      maxBytes,
      contentType,
      expiresIn = StoragePresignDefaults.POST_EXPIRES_IN,
    } = opts;
    const { accessKey, secretKey, region, sessionToken } = this.credentials;

    // The browser posts to the BUCKET, not to an object - the key travels as a form field, which the
    // policy pins to this one value.
    const { endpoint, pathPrefix } = this.objectEndpoint({
      bucket: bucket.name,
      audience: S3Audiences.BROWSER,
    });
    const { formData, expiresAt } = await S3SignatureUtility.buildPostPolicy({
      bucket: bucket.name,
      key: object.key,
      maxBytes,
      expiresInSeconds: StorageUtility.toExpirySeconds({ expiresIn, operation: 'presignPost' }),
      accessKey,
      secretKey,
      region,
      sessionToken,
      contentType,
    });

    return { postURL: `${endpoint.replace(/\/$/, '')}${pathPrefix}`, formData, expiresAt };
  }

  override async presignPut(
    opts: IObjectLocation & {
      expiresIn?: IDuration;
      tagging?: Record<string, string>;
      contentLength?: number;
      contentType?: string;
    },
  ): Promise<string> {
    const {
      bucket,
      object,
      tagging,
      contentLength,
      contentType,
      expiresIn = StoragePresignDefaults.PUT_EXPIRES_IN,
    } = opts;
    const { accessKey, secretKey, region, sessionToken } = this.credentials;

    // Not `client.presign`: its options are method and expiry only, and a tag that is merely SENT
    // is a tag S3 ignores. These two have to be inside the signature to exist at all.
    const { endpoint, pathPrefix } = this.objectEndpoint({
      bucket: bucket.name,
      audience: S3Audiences.BROWSER,
    });

    return S3SignatureUtility.buildPresignedUrl({
      method: 'PUT',
      endpoint,
      path: `${pathPrefix}/${object.key}`,
      accessKey,
      secretKey,
      region,
      sessionToken,
      expiresInSeconds: StorageUtility.toExpirySeconds({ expiresIn, operation: 'presignPut' }),
      headers: {
        ...(tagging
          ? { 'x-amz-tagging': S3SignatureUtility.buildTaggingHeader({ tags: tagging }) }
          : {}),
        ...(contentLength === undefined ? {} : { 'content-length': String(contentLength) }),
        ...(contentType ? { 'content-type': contentType } : {}),
      },
    });
  }

  override async presignGet(
    opts: IObjectLocation & {
      expiresIn?: IDuration;
      responseContentType?: string;
      responseContentDisposition?: string;
    },
  ): Promise<string> {
    const {
      bucket,
      object,
      expiresIn = StoragePresignDefaults.GET_EXPIRES_IN,
      responseContentType,
      responseContentDisposition,
    } = opts;

    return this.client.presign(object.key, {
      ...this.presignOptions({ bucket: bucket.name }),
      method: 'GET',
      expiresIn: StorageUtility.toExpirySeconds({ expiresIn, operation: 'presignGet' }),
      ...(responseContentType ? { type: responseContentType } : {}),
      ...(responseContentDisposition ? { contentDisposition: responseContentDisposition } : {}),
    });
  }

  override async getObjectTags(opts: IObjectLocation): Promise<Record<string, string>> {
    const response = await this.signedFetch({
      method: HTTP.Methods.GET,
      ...opts,
      query: { tagging: '' },
    });

    // S3 answers a missing tag set with 404: the empty case, not a failure.
    if (response.status === HTTP.ResultCodes.RS_4.NotFound) {
      return {};
    }

    const body = await response.text();

    if (!response.ok) {
      throw getError({
        message: `[getObjectTags] S3 error | status: ${response.status} | body: ${body}`,
      });
    }

    return S3SignatureUtility.parseTaggingXml({ xml: body });
  }

  override async replaceObjectTags(
    opts: IObjectLocation & { tags: Record<string, string> },
  ): Promise<void> {
    const response = await this.signedFetch({
      method: HTTP.Methods.PUT,
      bucket: opts.bucket,
      object: opts.object,
      query: { tagging: '' },
      body: S3SignatureUtility.buildTaggingXml({ tags: opts.tags }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw getError({
        message: `[replaceObjectTags] S3 error | status: ${response.status} | body: ${body}`,
      });
    }
  }

  protected get defaultLinkPrefix(): string {
    return '/static-assets/';
  }

  protected async writeObject(opts: IObjectLocation & { file: IUploadFile }): Promise<void> {
    const { file } = opts;
    const bucketName = opts.bucket.name;
    const { mimetype: mimeType, buffer } = file;

    await this.client.write(opts.object.key, buffer, {
      ...this.callOptions({ bucket: bucketName }),
      type: mimeType,
      partSize: this.transfer.partSize,
      queueSize: this.transfer.queueSize,
      retry: this.transfer.retry,
    });
  }

  /** Streams without holding the object in memory. `upload` carries a `Buffer`, so it cannot; this is the path for anything large. */
  override async writeStream(
    opts: IObjectLocation & {
      source: ReadableStream<Uint8Array> | Blob | Response | Request;
      contentType?: string;
      maxFolderDepth?: number;
    },
  ): Promise<void> {
    const { bucket, object, source, contentType } = opts;

    // The same depth rule `upload` applies: one object, two doors, one answer.
    if (!this.isValidObjectKey({ object, maxDepth: opts.maxFolderDepth })) {
      throw getError({
        message: `[writeStream] Invalid object name | key: ${EchoUtility.toSafeText({ value: object.key })}`,
      });
    }

    // Bun's `write` takes a Response, not a bare ReadableStream; wrapping streams, never buffers.
    const body = source instanceof ReadableStream ? new Response(source) : source;

    await this.client.write(object.key, body, {
      ...this.callOptions({ bucket: bucket.name }),
      ...(contentType ? { type: contentType } : {}),
      partSize: this.transfer.partSize,
      queueSize: this.transfer.queueSize,
      retry: this.transfer.retry,
    });
  }

  /** `S3File.stream()` is lazy: it reaches the network on first read, so a `try` here never sees a 404 - the failure arrives on the stream. */
  async getObject(opts: IObjectLocation & { options?: any }): Promise<Readable> {
    const bucketName = opts.bucket.name;
    const key = opts.object.key;
    const source = this.client.file(key, this.callOptions({ bucket: bucketName })).stream();

    return Readable.fromWeb(source as ReadableStream<Uint8Array>, {
      // Keeps backpressure meaningful rather than draining S3 into memory.
      objectMode: false,
    });
  }

  /** The conversion-free path a `Response` body wants. `slice` makes it a ranged GET, so only the requested bytes leave S3. */
  override async getObjectStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } } & IStorageReadCondition,
  ): Promise<ReadableStream<Uint8Array>> {
    if (opts.ifMatch !== undefined || opts.versionId !== undefined) {
      return this.getConditionalStream(opts);
    }

    const bucketName = opts.bucket.name;
    const key = opts.object.key;
    const { range } = opts;
    const file = this.client.file(key, this.callOptions({ bucket: bucketName }));

    if (!range) {
      return file.stream() as ReadableStream<Uint8Array>;
    }

    // HTTP ranges include `end`; `slice` excludes it.
    const window =
      range.end === undefined ? file.slice(range.start) : file.slice(range.start, range.end + 1);

    return window.stream() as ReadableStream<Uint8Array>;
  }

  /** The ETag with the quotes S3 sends and expects in `If-Match`. */
  private static quoteEtag(opts: { etag?: string }): string | undefined {
    const { etag } = opts;

    return etag === undefined || etag.startsWith('"') || etag.startsWith('W/') ? etag : `"${etag}"`;
  }

  /** Signs and sends one object-level request: the one place credentials, addressing, signing and the verb's case meet. */
  private async signedFetch(opts: {
    method: THttpMethod;
    bucket: IBucketRef;
    object: IObjectRef;
    query?: Record<string, string | undefined>;
    headers?: Record<string, string | undefined>;
    body?: string;
  }): Promise<Response> {
    const { method, bucket, object, query, headers, body } = opts;
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const { endpoint, pathPrefix } = this.objectEndpoint({
      bucket: bucket.name,
      audience: S3Audiences.SERVER,
    });
    const verb = method.toUpperCase();

    const request = await S3SignatureUtility.buildSignedRequest({
      method: verb,
      endpoint,
      path: `${pathPrefix}/${object.key}`,
      accessKey,
      secretKey,
      region,
      sessionToken,
      query,
      headers,
      body,
    });

    return fetch(request.url, { method: verb, headers: request.headers, body });
  }

  /** The storage error a response stands for: 412 is a changed object, 404 a missing one, any other failure the backend's own. */
  private assertObjectResponse(opts: {
    response: Response;
    operation: string;
    bucket: IBucketRef;
    object: IObjectRef;
  }): void {
    const { response, operation, bucket, object } = opts;

    if (response.status === HTTP.ResultCodes.RS_4.PreconditionFailed) {
      throw getError({
        error: StorageErrors.PRECONDITION_FAILED,
        message: `[${operation}] The object changed | bucket: ${EchoUtility.toSafeText({ value: bucket.name })} | key: ${EchoUtility.toSafeText({ value: object.key })}`,
      });
    }

    if (response.status === HTTP.ResultCodes.RS_4.NotFound) {
      throw this.asStorageError({
        error: { status: response.status },
        operation,
        bucket,
        object,
      });
    }

    if (!response.ok) {
      throw getError({
        message: `[${operation}] S3 error | bucket: ${EchoUtility.toSafeText({ value: bucket.name })} | key: ${EchoUtility.toSafeText({ value: object.key })} | status: ${response.status}`,
      });
    }
  }

  /** `S3File` cannot send `If-Match` or a version id, so a conditional read is a signed GET. */
  private async getConditionalStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } } & IStorageReadCondition,
  ): Promise<ReadableStream<Uint8Array>> {
    const { bucket, object, range, ifMatch, versionId } = opts;

    const response = await this.signedFetch({
      method: HTTP.Methods.GET,
      bucket,
      object,
      query: { versionId },
      headers: {
        [HTTP.Headers.IF_MATCH]: BunS3Helper.quoteEtag({ etag: ifMatch }),
        [HTTP.Headers.RANGE]:
          range && `${HTTP.HeaderValues.RANGE_UNIT_BYTES}=${range.start}-${range.end ?? ''}`,
      },
    });

    this.assertObjectResponse({ response, operation: 'getObjectStream', bucket, object });

    if (!response.body) {
      throw getError({
        message: `[getObjectStream] The response has no body | key: ${EchoUtility.toSafeText({ value: object.key })}`,
      });
    }

    return response.body;
  }

  /** A signed HEAD rather than `client.stat`, because Bun's stat does not report the version id a pin needs. */
  async getStat(opts: IObjectLocation): Promise<IFileStat> {
    const { bucket, object } = opts;

    const response = await this.signedFetch({ method: HTTP.Methods.HEAD, bucket, object });
    this.assertObjectResponse({ response, operation: 'getStat', bucket, object });

    const lastModified = response.headers.get(HTTP.Headers.LAST_MODIFIED);

    return {
      size: Number(response.headers.get(HTTP.Headers.CONTENT_LENGTH) ?? 0),
      // One key, not two spellings. The served type comes from the object name; this is diagnostic.
      metadata: { mimetype: response.headers.get(HTTP.Headers.CONTENT_TYPE) ?? undefined },
      lastModified: lastModified === null ? undefined : new Date(lastModified),
      etag: response.headers.get(HTTP.Headers.ETAG) ?? undefined,
      versionId: StorageUtility.realVersionId({
        value: response.headers.get(S3Headers.VERSION_ID),
      }),
    };
  }

  async removeObject(opts: IObjectLocation): Promise<void> {
    const bucketName = opts.bucket.name;
    const key = opts.object.key;

    try {
      await this.client.delete(key, this.callOptions({ bucket: bucketName }));
    } catch (error) {
      throw this.asStorageError({
        error,
        operation: 'removeObject',
        bucket: opts.bucket,
        object: opts.object,
      });
    }
  }

  async removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void> {
    const { bucket, objects } = opts;

    await this.mapWithConcurrency({
      items: objects,
      task: ({ item: object }) => this.removeObject({ bucket, object }),
    });
  }

  /** S3 caps a call at 1000 keys and continues through `nextContinuationToken`. `useRecursive: false` maps to `delimiter: '/'`. */
  async listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]> {
    const { prefix, useRecursive = false, maxKeys } = opts;
    const bucketName = opts.bucket.name;

    // `maxKeys: 0` means zero, not unlimited.
    const limit = maxKeys ?? Number.POSITIVE_INFINITY;

    if (limit <= 0) {
      return [];
    }

    const objects: IObjectInfo[] = [];
    let continuationToken: string | undefined;

    do {
      const remaining = limit - objects.length;
      const response = await this.client.list(
        {
          prefix,
          continuationToken,
          ...(useRecursive ? {} : { delimiter: '/' }),
          ...(Number.isFinite(remaining) ? { maxKeys: Math.min(remaining, 1000) } : {}),
        },
        this.callOptions({ bucket: bucketName }),
      );

      const responseContents = response.contents ?? [];

      for (const entry of responseContents) {
        objects.push({
          name: entry.key,
          size: entry.size,
          lastModified: entry.lastModified ? new Date(entry.lastModified) : undefined,
          etag: entry.eTag,
        });
      }

      continuationToken = response.isTruncated ? response.nextContinuationToken : undefined;
    } while (continuationToken && objects.length < limit);

    return objects;
  }
}
