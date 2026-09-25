import type { IDuration } from '@/common';
import { getError } from '@/modules/error';
import { ErrorPrettier } from '@/modules/logger';
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
  IUploadFile,
} from '../common';
import { S3Audiences, isNotFoundError, StoragePresignDefaults, toExpirySeconds } from '../common';
import type { TS3Audience } from '../common';
import {
  buildCopySource,
  buildPostPolicy,
  buildPresignedUrl,
  buildSignedRequest,
  buildTaggingHeader,
  buildTaggingXml,
  parseTaggingXml,
} from './utility';

export interface IBunS3HelperOptions extends IStorageHelperOptions {
  accessKey: string;
  secretKey: string;
  region?: string;
  sessionToken?: string;
  /** `default` is the host THIS process talks to; `public` is the host a browser is handed. `host` is inside every SigV4 signature, so a URL signed against an internal name cannot be rewritten later - which is why the two are separate rather than one value patched afterwards. */
  endpoint: { default: string; public?: string };

  /** `https://<bucket>.<endpoint>/<key>` instead of `<endpoint>/<bucket>/<key>`. AWS requires it; MinIO and R2 do not. */
  virtualHostedStyle?: boolean;
  partSize?: number;
  queueSize?: number;

  /** Retries Bun performs on a failed part before the write fails. */
  retry?: number;
}

export class BunS3Helper extends BaseStorageHelper {
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

  async hasBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    const { name } = opts.bucket;
    if (!this.isValidBucketName(opts)) {
      return false;
    }

    try {
      await this.client.list({ maxKeys: 1 }, { bucket: name });
      return true;
    } catch (error) {
      // A missing bucket is the answer; a credentials or network failure is not, and must not vanish.
      if (!isNotFoundError({ error })) {
        this.logger.warn(
          '[hasBucket] Cannot determine bucket existence - reporting false | bucket: %s | %s',
          name,
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

    const { url, headers } = await buildSignedRequest({
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
    return buckets.find(bucket => bucket.name === name) ?? null;
  }

  async createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    const { name } = opts.bucket;
    if (!this.isValidBucketName(opts)) {
      throw getError({ message: '[createBucket] Invalid name to create bucket!' });
    }

    // A bucket operation is a call this process makes, so it goes to the default host.
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const endpoint = this.credentials.endpoint.default;

    const { url, headers } = await buildSignedRequest({
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

    const { url, headers } = await buildSignedRequest({
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
  }): Promise<void> {
    const { bucket, source, destination } = opts;
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const { endpoint, pathPrefix } = this.objectEndpoint({
      bucket: bucket.name,
      audience: S3Audiences.SERVER,
    });

    // `x-amz-copy-source` is what makes this server side: S3 reads the source itself, so a 500 MB
    // object never travels through this process. The encoded value is both signed and sent.
    const request = await buildSignedRequest({
      method: 'PUT',
      endpoint,
      path: `${pathPrefix}/${destination.key}`,
      accessKey,
      secretKey,
      region,
      sessionToken,
      headers: { 'x-amz-copy-source': buildCopySource({ bucket: bucket.name, key: source.key }) },
    });

    const response = await fetch(request.url, { method: 'PUT', headers: request.headers });
    if (!response.ok) {
      throw getError({
        message: `[copyObject] Copy failed | bucket: ${bucket.name} | source: ${source.key} | status: ${response.status}`,
      });
    }
  }

  override async presignPost(opts: {
    bucket: IBucketRef;
    keyPrefix: string;
    maxBytes: number;
    contentType?: string;
    expiresIn?: IDuration;
  }): Promise<IPostPolicy> {
    const {
      bucket,
      keyPrefix,
      maxBytes,
      contentType,
      expiresIn = StoragePresignDefaults.POST_EXPIRES_IN,
    } = opts;
    const { accessKey, secretKey, region, sessionToken } = this.credentials;

    // The browser posts to the BUCKET, not to an object - the key travels as a form field, because
    // the policy only constrains its prefix.
    const { endpoint } = this.objectEndpoint({
      bucket: bucket.name,
      audience: S3Audiences.BROWSER,
    });
    const { formData, expiresAt } = await buildPostPolicy({
      bucket: bucket.name,
      keyPrefix,
      maxBytes,
      expiresInSeconds: toExpirySeconds({ expiresIn, operation: 'presignPost' }),
      accessKey,
      secretKey,
      region,
      sessionToken,
      contentType,
    });

    return { postURL: `${endpoint.replace(/\/$/, '')}/${bucket.name}`, formData, expiresAt };
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

    return buildPresignedUrl({
      method: 'PUT',
      endpoint,
      path: `${pathPrefix}/${object.key}`,
      accessKey,
      secretKey,
      region,
      sessionToken,
      expiresInSeconds: toExpirySeconds({ expiresIn, operation: 'presignPut' }),
      headers: {
        ...(tagging ? { 'x-amz-tagging': buildTaggingHeader({ tags: tagging }) } : {}),
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
      expiresIn: toExpirySeconds({ expiresIn, operation: 'presignGet' }),
      ...(responseContentType ? { type: responseContentType } : {}),
      ...(responseContentDisposition ? { contentDisposition: responseContentDisposition } : {}),
    });
  }

  override async getObjectTags(opts: IObjectLocation): Promise<Record<string, string>> {
    const bucketName = opts.bucket.name;
    const key = opts.object.key;
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const { endpoint, pathPrefix } = this.objectEndpoint({
      bucket: bucketName,
      audience: S3Audiences.SERVER,
    });

    const { url, headers } = await buildSignedRequest({
      method: 'GET',
      endpoint,
      path: `${pathPrefix}/${key}`,
      accessKey,
      secretKey,
      region,
      sessionToken,
      query: { tagging: '' },
    });

    const response = await fetch(url, { method: 'GET', headers });

    // S3 answers a missing tag set with 404: the empty case, not a failure.
    if (response.status === 404) {
      return {};
    }

    const body = await response.text();
    if (!response.ok) {
      throw getError({
        message: `[getObjectTags] S3 error | status: ${response.status} | body: ${body}`,
      });
    }

    return parseTaggingXml({ xml: body });
  }

  override async replaceObjectTags(
    opts: IObjectLocation & { tags: Record<string, string> },
  ): Promise<void> {
    const bucketName = opts.bucket.name;
    const key = opts.object.key;
    const { tags } = opts;
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const { endpoint, pathPrefix } = this.objectEndpoint({
      bucket: bucketName,
      audience: S3Audiences.SERVER,
    });
    const requestBody = buildTaggingXml({ tags });

    const { url, headers } = await buildSignedRequest({
      method: 'PUT',
      endpoint,
      path: `${pathPrefix}/${key}`,
      accessKey,
      secretKey,
      region,
      sessionToken,
      query: { tagging: '' },
      body: requestBody,
    });

    const response = await fetch(url, { method: 'PUT', headers, body: requestBody });

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
      bucket: bucketName,
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
      throw getError({ message: `[writeStream] Invalid object name | key: ${object.key}` });
    }

    // Bun's `write` takes a Response, not a bare ReadableStream; wrapping streams, never buffers.
    const body = source instanceof ReadableStream ? new Response(source) : source;

    await this.client.write(object.key, body, {
      bucket: bucket.name,
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
    const source = this.client.file(key, { bucket: bucketName }).stream();

    return Readable.fromWeb(source as ReadableStream<Uint8Array>, {
      // Keeps backpressure meaningful rather than draining S3 into memory.
      objectMode: false,
    });
  }

  /** The conversion-free path a `Response` body wants. `slice` makes it a ranged GET, so only the requested bytes leave S3. */
  override async getObjectStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } },
  ): Promise<ReadableStream<Uint8Array>> {
    const bucketName = opts.bucket.name;
    const key = opts.object.key;
    const { range } = opts;
    const file = this.client.file(key, { bucket: bucketName });

    if (!range) {
      return file.stream() as ReadableStream<Uint8Array>;
    }

    // HTTP ranges include `end`; `slice` excludes it.
    const window =
      range.end === undefined ? file.slice(range.start) : file.slice(range.start, range.end + 1);

    return window.stream() as ReadableStream<Uint8Array>;
  }

  async getStat(opts: IObjectLocation): Promise<IFileStat> {
    const bucketName = opts.bucket.name;
    const key = opts.object.key;

    try {
      const stat = await this.client.stat(key, { bucket: bucketName });
      return {
        size: stat.size,
        // One key, not two spellings. The served type comes from the object name; this is diagnostic.
        metadata: { mimetype: stat.type },
        lastModified: stat.lastModified,
        etag: stat.etag,
      };
    } catch (error) {
      throw this.asStorageError({
        error,
        operation: 'getStat',
        bucket: opts.bucket,
        object: opts.object,
      });
    }
  }

  async removeObject(opts: IObjectLocation): Promise<void> {
    const bucketName = opts.bucket.name;
    const key = opts.object.key;

    try {
      await this.client.delete(key, { bucket: bucketName });
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
    const { prefix, useRecursive = true, maxKeys } = opts;
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
        { bucket: bucketName },
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
