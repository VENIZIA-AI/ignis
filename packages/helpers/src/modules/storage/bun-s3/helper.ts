import { getError } from '@/modules/error';
import { ErrorPrettier } from '@/modules/logger';
import { S3Client } from 'bun';
import { Readable } from 'node:stream';
import { BaseStorageHelper } from '../base';
import type { IDuration } from '@/common';
import type {
  IBucketInfo,
  IBucketRef,
  IFileStat,
  IListObjectsOptions,
  IObjectInfo,
  IObjectLocation,
  IObjectRef,
  IStorageHelperOptions,
  IUploadFile,
} from '../common';
import { isNotFoundError, StoragePresignDefaults, toExpirySeconds } from '../common';
import { buildSignedRequest, buildTaggingXml, parseTaggingXml } from './utility';

export interface IBunS3HelperOptions extends IStorageHelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region?: string;
  sessionToken?: string;

  /** The endpoint a browser can reach. `host` is inside the signature, so it cannot be rewritten after signing. */
  publicEndpoint?: string;

  /** `https://<bucket>.<endpoint>/<key>` instead of `<endpoint>/<bucket>/<key>`. AWS requires it; MinIO and R2 do not. */
  virtualHostedStyle?: boolean;

  /** Multipart part size in bytes. Bun's own default applies when omitted. */
  partSize?: number;

  /** Parts uploaded at once. Costs roughly `partSize * queueSize` of memory per transfer. */
  queueSize?: number;

  /** Retries Bun performs on a failed part before the write fails. */
  retry?: number;
}

export class BunS3Helper extends BaseStorageHelper {
  private client: S3Client;
  private credentials: {
    accessKey: string;
    secretKey: string;
    endpoint: string;
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

    // `host` is inside every signature, so the public endpoint signs when one is set.
    const signingEndpoint = options.publicEndpoint ?? options.endpoint;

    this.credentials = {
      accessKey: options.accessKey,
      secretKey: options.secretKey,
      endpoint: signingEndpoint,
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
      endpoint: signingEndpoint,
      region: options.region,
      sessionToken: options.sessionToken,
      virtualHostedStyle: options.virtualHostedStyle,
    });
  }

  /** One bucket's objects, in either addressing style. Virtual-hosted derives the per-bucket host, because the bucket arrives per call. */
  private objectEndpoint(opts: { bucket: string }): { endpoint: string; pathPrefix: string } {
    const { endpoint, virtualHostedStyle } = this.credentials;

    if (!virtualHostedStyle) {
      return { endpoint, pathPrefix: `/${opts.bucket}` };
    }

    const parsed = new URL(endpoint);
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
    const { endpoint } = this.objectEndpoint({ bucket: opts.bucket });

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
    const { accessKey, secretKey, endpoint, region, sessionToken } = this.credentials;

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

    const { accessKey, secretKey, endpoint, region, sessionToken } = this.credentials;

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

    const { accessKey, secretKey, endpoint, region, sessionToken } = this.credentials;

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

  override async presignPut(opts: IObjectLocation & { expiresIn?: IDuration }): Promise<string> {
    const { bucket, object, expiresIn = StoragePresignDefaults.PUT_EXPIRES_IN } = opts;

    return this.client.presign(object.key, {
      ...this.presignOptions({ bucket: bucket.name }),
      method: 'PUT',
      expiresIn: toExpirySeconds({ expiresIn, operation: 'presignPut' }),
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
    const { endpoint, pathPrefix } = this.objectEndpoint({ bucket: bucketName });

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
    const { endpoint, pathPrefix } = this.objectEndpoint({ bucket: bucketName });
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

      for (const entry of response.contents ?? []) {
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
