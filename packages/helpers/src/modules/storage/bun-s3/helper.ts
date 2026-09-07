import { getError } from '@/modules/error';
import { ErrorPrettier } from '@/modules/logger';
import { S3Client } from 'bun';
import { Readable } from 'node:stream';
import { BaseStorageHelper } from '../base';
import type {
  IBucketInfo,
  IFileStat,
  IObjectInfo,
  IStorageHelperOptions,
  IUploadFile,
} from '../common';
import { isNotFoundError, StoragePresignDefaults } from '../common';
import { buildSignedRequest, buildTaggingXml, parseTaggingXml } from './utility';

export interface IBunS3HelperOptions extends IStorageHelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region?: string;
  sessionToken?: string;

  /**
   * The endpoint a BROWSER can reach, when it differs from the one this process talks to. A signed URL
   * carries `host` inside its signature, so an internal endpoint like `http://minio:9000` cannot be
   * rewritten afterwards - it has to be signed against the public name from the start.
   */
  publicEndpoint?: string;

  /**
   * Addresses the bucket as `https://<bucket>.<endpoint>/<key>` instead of `<endpoint>/<bucket>/<key>`.
   * AWS requires it for buckets created after path-style was retired; MinIO and R2 accept path-style.
   */
  virtualHostedStyle?: boolean;

  /** Multipart part size in bytes. Bun's own default applies when omitted. */
  partSize?: number;

  /** How many parts upload at once. Higher costs memory: roughly `partSize * queueSize` per transfer. */
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

  /** Left undefined when the caller said nothing, so Bun's own defaults stay in force. */
  private transfer: { partSize?: number; queueSize?: number; retry?: number };

  constructor(options: IBunS3HelperOptions) {
    super({
      scope: options.scope ?? BunS3Helper.name,
      identifier: options.identifier ?? BunS3Helper.name,
    });

    // Signing uses the public endpoint when one is set, because `host` is inside every signature.
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

  /**
   * Where one bucket's objects live, in whichever addressing style the provider needs. Virtual-hosted
   * moves the bucket into the host, so `endpoint` here is configured WITHOUT it and the per-bucket host
   * is derived - Bun's own client wants the bucket already in the endpoint, which cannot serve a helper
   * whose bucket arrives per call.
   */
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

  async isBucketExists(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    if (!this.isValidName({ name })) {
      return false;
    }

    try {
      await this.client.list({ maxKeys: 1 }, { bucket: name });
      return true;
    } catch (error) {
      // A missing bucket is the answer; credentials, region or network failures are not and must not vanish.
      if (!isNotFoundError({ error })) {
        this.logger.warn(
          '[isBucketExists] Cannot determine bucket existence - reporting false | bucket: %s | %s',
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

  /** S3 exposes a bucket's creation date only through `ListBuckets`, so one full listing is the cheapest correct answer. */
  async getBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const { name } = opts;
    if (!this.isValidName({ name })) {
      return null;
    }

    const buckets = await this.getBuckets();
    return buckets.find(bucket => bucket.name === name) ?? null;
  }

  async createBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const { name } = opts;
    if (!this.isValidName({ name })) {
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

    return this.getBucket({ name });
  }

  async removeBucket(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    if (!this.isValidName({ name })) {
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

  override async presignPut(opts: {
    bucket: string;
    name: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const { bucket, name, expiresInSeconds = StoragePresignDefaults.PUT_EXPIRES_IN_SECONDS } = opts;

    return this.client.presign(name, {
      ...this.presignOptions({ bucket }),
      method: 'PUT',
      expiresIn: expiresInSeconds,
    });
  }

  override async presignGet(opts: {
    bucket: string;
    name: string;
    expiresInSeconds?: number;
    responseContentType?: string;
    responseContentDisposition?: string;
  }): Promise<string> {
    const {
      bucket,
      name,
      expiresInSeconds = StoragePresignDefaults.GET_EXPIRES_IN_SECONDS,
      responseContentType,
      responseContentDisposition,
    } = opts;

    return this.client.presign(name, {
      ...this.presignOptions({ bucket }),
      method: 'GET',
      expiresIn: expiresInSeconds,
      ...(responseContentType ? { type: responseContentType } : {}),
      ...(responseContentDisposition ? { contentDisposition: responseContentDisposition } : {}),
    });
  }

  override async getObjectTags(opts: {
    bucket: string;
    name: string;
  }): Promise<Record<string, string>> {
    const { bucket, name } = opts;
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const { endpoint, pathPrefix } = this.objectEndpoint({ bucket });

    const { url, headers } = await buildSignedRequest({
      method: 'GET',
      endpoint,
      path: `${pathPrefix}/${name}`,
      accessKey,
      secretKey,
      region,
      sessionToken,
      query: { tagging: '' },
    });

    const response = await fetch(url, { method: 'GET', headers });

    // S3 answers a missing tag set with 404 - that is the empty case, not a failure.
    if (response.status === 404) {
      return {};
    }

    const body = await response.text();
    if (!response.ok) {
      throw getError({
        message: `[getObjectTags] S3 error | status: ${response.status} | body: ${body}`,
      });
    }

    return parseTaggingXml(body);
  }

  override async setObjectTags(opts: {
    bucket: string;
    name: string;
    tags: Record<string, string>;
  }): Promise<void> {
    const { bucket, name, tags } = opts;
    const { accessKey, secretKey, region, sessionToken } = this.credentials;
    const { endpoint, pathPrefix } = this.objectEndpoint({ bucket });
    const requestBody = buildTaggingXml(tags);

    const { url, headers } = await buildSignedRequest({
      method: 'PUT',
      endpoint,
      path: `${pathPrefix}/${name}`,
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
        message: `[setObjectTags] S3 error | status: ${response.status} | body: ${body}`,
      });
    }
  }

  protected get defaultLinkPrefix(): string {
    return '/static-assets/';
  }

  protected async writeObject(opts: {
    bucket: string;
    normalizeName: string;
    file: IUploadFile;
  }): Promise<void> {
    const { bucket, normalizeName, file } = opts;
    const { mimetype: mimeType, buffer } = file;

    await this.client.write(normalizeName, buffer, {
      bucket,
      type: mimeType,
      partSize: this.transfer.partSize,
      queueSize: this.transfer.queueSize,
      retry: this.transfer.retry,
    });
  }

  /**
   * Streams `source` to `name` without ever holding the object in memory. `upload` cannot do this: its
   * `IUploadFile` carries a `Buffer`, so a 5 GB file is 5 GB of heap before the first byte leaves.
   * Bun's multipart writer handles the chunking, so this is the path for anything large.
   */
  async writeStream(opts: {
    bucket: string;
    name: string;
    source: ReadableStream<Uint8Array> | Blob | Response | Request;
    contentType?: string;
  }): Promise<void> {
    const { bucket, name, source, contentType } = opts;

    if (!this.isValidPath({ path: name, maxDepth: Number.MAX_SAFE_INTEGER })) {
      throw getError({ message: `[writeStream] Invalid object name | name: ${name}` });
    }

    // Bun's `write` takes a Response but not a bare ReadableStream; wrapping streams it, never buffers it.
    const body = source instanceof ReadableStream ? new Response(source) : source;

    await this.client.write(name, body, {
      bucket,
      ...(contentType ? { type: contentType } : {}),
      partSize: this.transfer.partSize,
      queueSize: this.transfer.queueSize,
      retry: this.transfer.retry,
    });
  }

  /**
   * `S3File.stream()` is lazy: it returns a stream and only reaches the network on first read, so a
   * `try` around this call can never see a 404 - the failure arrives on the stream instead. The stream
   * is forwarded, never buffered, so object size does not become memory here.
   */
  async getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable> {
    const { bucket, name } = opts;
    const source = this.client.file(name, { bucket }).stream();

    return Readable.fromWeb(source as ReadableStream<Uint8Array>, {
      // Keeps the consumer's backpressure meaningful rather than draining S3 into memory.
      objectMode: false,
    });
  }

  /**
   * S3 already speaks web streams, so this is the conversion-free path a `Response` body wants.
   * `slice` turns the range into a ranged GET, so only the requested bytes leave S3 - discarding them
   * locally would pay for the whole object to serve a seek.
   */
  override async getFileStream(opts: {
    bucket: string;
    name: string;
    range?: { start: number; end?: number };
  }): Promise<ReadableStream<Uint8Array>> {
    const { bucket, name, range } = opts;
    const file = this.client.file(name, { bucket });

    if (!range) {
      return file.stream() as ReadableStream<Uint8Array>;
    }

    // HTTP ranges include `end`; `slice` excludes it.
    const window =
      range.end === undefined ? file.slice(range.start) : file.slice(range.start, range.end + 1);

    return window.stream() as ReadableStream<Uint8Array>;
  }

  async getStat(opts: { bucket: string; name: string }): Promise<IFileStat> {
    const { bucket, name } = opts;

    try {
      const stat = await this.client.stat(name, { bucket });
      return {
        size: stat.size,
        // One key, not the same value under two spellings. The served type is decided from the object
        // NAME anyway, so what a backend reports here is diagnostic rather than authoritative.
        metadata: { mimetype: stat.type },
        lastModified: stat.lastModified,
        etag: stat.etag,
      };
    } catch (error) {
      throw this.asStorageError({ error, operation: 'getStat', bucket, name });
    }
  }

  async removeObject(opts: { bucket: string; name: string }): Promise<void> {
    const { bucket, name } = opts;

    try {
      await this.client.delete(name, { bucket });
    } catch (error) {
      throw this.asStorageError({ error, operation: 'removeObject', bucket, name });
    }
  }

  async removeObjects(opts: { bucket: string; names: string[] }): Promise<void> {
    const { bucket, names } = opts;

    await this.mapWithConcurrency({
      items: names,
      task: ({ item: name }) => this.removeObject({ bucket, name }),
    });
  }

  /**
   * S3 returns at most 1000 keys per call and reports the rest through `nextContinuationToken`, so a
   * single call silently truncated any larger bucket. `useRecursive: false` maps to `delimiter: '/'` -
   * ignoring it made this backend disagree with `disk` on the same argument.
   */
  async listObjects(opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<IObjectInfo[]> {
    const { bucket, prefix, useRecursive = true, maxKeys } = opts;

    // `maxKeys: 0` means zero, not "unlimited" - the truthiness reading of it was a bug on both backends.
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
        { bucket },
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
