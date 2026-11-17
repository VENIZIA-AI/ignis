import { getError } from '@venizia/ignis-helpers/core';
import {
  StorageErrors,
  StorageTypes,
  BaseStorageHelper,
  type IBucketInfo,
  type IBucketRef,
  type IFileStat,
  type IStorageReadCondition,
  type IListObjectsOptions,
  type IObjectInfo,
  type IObjectLocation,
  type IObjectRef,
  type IUploadFile,
  type TStorageType,
} from '@venizia/ignis-helpers';
import { Readable } from 'node:stream';

export interface IStorageCall {
  method: string;
  args: Record<string, unknown>;
}

interface IStoredObject {
  buffer: Buffer;
  mimetype: string;
  etag: string;
  /** Present only while the fake simulates a versioned bucket. */
  versionId?: string;
}

/** In-memory storage helper extending the real BaseStorageHelper so `isValidName`/`isValidPath`/`upload` behave exactly as in production, while every backend call is recorded. */
export class FakeStorageHelper extends BaseStorageHelper {
  /** The backend this fake stands in for. S3 by default, because direct upload needs it. */
  readonly storageType?: TStorageType = StorageTypes.BUN_S3;
  readonly calls: IStorageCall[] = [];
  private readonly buckets = new Map<string, IBucketInfo>();
  private readonly objects = new Map<string, IStoredObject>();
  private writeCount = 0;

  /** originalName of a file whose writeObject must fail (storage failure simulation). */
  failWriteOnName?: string;

  /** Stands in for a backend reporting its own content type - minio does, bun-s3 reports camelCase keys. */
  statMetadataOverride?: Record<string, string>;

  /** A versioned bucket: every write gets a version id, and `getStat` reports it. */
  isVersioned = false;

  /** What `getStat` reports as the version id whatever the object holds: `''` and the literal `'null'` are what an unversioned bucket answers. */
  reportedVersionId?: string;

  /** Makes every conditional read fail with this message, so a failure that is not a changed upload can be told apart. */
  failReadsWith?: string;

  /** A backend that reports no ETag, which a pinned validation cannot work with. */
  omitEtag = false;

  constructor() {
    super({ scope: FakeStorageHelper.name, identifier: 'fake-storage' });
    this.buckets.set('images', { name: 'images', creationDate: new Date('2024-01-01T00:00:00Z') });
  }

  reset() {
    this.calls.length = 0;
  }

  /** Names (bucket + object) which reached any object-level backend call. */
  objectCallNames(): string[] {
    return this.calls
      .filter((call) => typeof call.args['name'] === 'string')
      .map((call) => String(call.args['name']));
  }

  hasObject(opts: IObjectLocation): boolean {
    return this.objects.has(`${opts.bucket.name}/${opts.object.key}`);
  }

  /** One place decides the map key, so reads and writes cannot drift apart. */
  private toStoreKey(opts: IObjectLocation): string {
    return `${opts.bucket.name}/${opts.object.key}`;
  }

  /** Assertions read `args.name`, so the recorded shape stays flat. */
  private toCallArgs(opts: IObjectLocation): Record<string, unknown> {
    return { bucket: opts.bucket.name, name: opts.object.key };
  }

  protected get defaultLinkPrefix(): string {
    return '/fake-storage/';
  }

  protected async writeObject(opts: IObjectLocation & { file: IUploadFile }): Promise<void> {
    const { bucket, object, file } = opts;
    this.calls.push({
      method: 'writeObject',
      args: {
        bucket: bucket.name,
        name: object.key,
        bufferLength: file.buffer?.length ?? -1,
        size: file.size,
      },
    });

    if (this.failWriteOnName && this.failWriteOnName === file.originalName) {
      throw getError({ message: `[writeObject] Simulated storage failure | ${file.originalName}` });
    }

    this.store({
      storeKey: this.toStoreKey({ bucket, object }),
      buffer: Buffer.from(file.buffer),
      mimetype: file.mimetype,
    });
  }

  /** Every write gets a new ETag, as a real overwrite does, and a new version id on a versioned bucket. */
  private store(opts: { storeKey: string; buffer: Buffer; mimetype: string }): void {
    this.writeCount += 1;
    this.objects.set(opts.storeKey, {
      buffer: opts.buffer,
      mimetype: opts.mimetype,
      etag: `"fake-etag-${this.writeCount}"`,
      versionId: this.isVersioned ? `fake-version-${this.writeCount}` : undefined,
    });
  }

  /** Stands in for the bytes a browser posted straight to the storage - nothing in this process wrote them. */
  seedObject(opts: { bucket: string; key: string; mimetype?: string; content?: string }): void {
    this.store({
      storeKey: `${opts.bucket}/${opts.key}`,
      buffer: Buffer.from(opts.content ?? 'seeded'),
      mimetype: opts.mimetype ?? 'application/octet-stream',
    });
  }

  /** Another upload landing on the same pending key: new bytes, new ETag, new version. Records no call, so a test can do it between steps or inside a handler. */
  overwriteObject(opts: { bucket: string; key: string; content?: string }): void {
    this.seedObject({ content: 'overwritten', ...opts });
  }

  /** The pending object going away between two steps, without a recorded call. */
  discardObject(opts: { bucket: string; key: string }): void {
    this.objects.delete(`${opts.bucket}/${opts.key}`);
  }

  /** What the condition requires of the stored object. A mismatch is the 412 a real storage answers. */
  private assertCondition(opts: {
    operation: string;
    storeKey: string;
    found: IStoredObject;
    ifMatch?: string;
    versionId?: string;
  }): void {
    const { operation, storeKey, found, ifMatch, versionId } = opts;

    if (ifMatch !== undefined && ifMatch !== found.etag) {
      throw getError({
        error: StorageErrors.PRECONDITION_FAILED,
        message: `[${operation}] ETag does not match | ${storeKey}`,
      });
    }

    if (versionId !== undefined && versionId !== found.versionId) {
      throw getError({
        error: StorageErrors.PRECONDITION_FAILED,
        message: `[${operation}] Version does not match | ${storeKey}`,
      });
    }
  }

  override async presignPost(opts: {
    bucket: IBucketRef;
    object: { key: string };
    maxBytes: number;
    contentType?: string;
  }) {
    this.calls.push({
      method: 'presignPost',
      args: { bucket: opts.bucket.name, key: opts.object.key, maxBytes: opts.maxBytes },
    });

    return {
      postURL: `https://fake-storage/${opts.bucket.name}`,
      formData: { key: opts.object.key, policy: 'fake-policy' },
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
  }

  override async copyObject(opts: {
    bucket: IBucketRef;
    source: { key: string };
    destination: { key: string };
    ifMatch?: string;
    sourceVersionId?: string;
  }): Promise<void> {
    this.calls.push({
      method: 'copyObject',
      args: {
        bucket: opts.bucket.name,
        source: opts.source.key,
        destination: opts.destination.key,
        ifMatch: opts.ifMatch,
        sourceVersionId: opts.sourceVersionId,
      },
    });

    // A real copy makes the destination readable. Recording the call alone left every
    // post-copy getStat in a test answering 404.
    const source = this.objects.get(`${opts.bucket.name}/${opts.source.key}`);

    if (!source) {
      throw getError({
        statusCode: 404,
        message: `[copyObject] Object not found | ${opts.bucket.name}/${opts.source.key}`,
      });
    }

    this.assertCondition({
      operation: 'copyObject',
      storeKey: `${opts.bucket.name}/${opts.source.key}`,
      found: source,
      ifMatch: opts.ifMatch,
      versionId: opts.sourceVersionId,
    });

    this.store({
      storeKey: `${opts.bucket.name}/${opts.destination.key}`,
      buffer: source.buffer,
      mimetype: source.mimetype,
    });
  }

  async hasBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    this.calls.push({ method: 'hasBucket', args: { bucket: opts.bucket.name } });

    return this.buckets.has(opts.bucket.name);
  }

  async getBuckets(): Promise<IBucketInfo[]> {
    this.calls.push({ method: 'getBuckets', args: {} });

    return [...this.buckets.values()];
  }

  async getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    this.calls.push({ method: 'getBucket', args: { bucket: opts.bucket.name } });

    return this.buckets.get(opts.bucket.name) ?? null;
  }

  async createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    this.calls.push({ method: 'createBucket', args: { bucket: opts.bucket.name } });
    const created: IBucketInfo = {
      name: opts.bucket.name,
      creationDate: new Date('2024-01-01T00:00:00Z'),
    };
    this.buckets.set(opts.bucket.name, created);

    return created;
  }

  async removeBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    this.calls.push({ method: 'removeBucket', args: { bucket: opts.bucket.name } });

    return this.buckets.delete(opts.bucket.name);
  }

  async getObject(opts: IObjectLocation): Promise<Readable> {
    this.calls.push({ method: 'getObject', args: this.toCallArgs(opts) });
    const found = this.objects.get(this.toStoreKey(opts));

    if (!found) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getObject] Object not found | ${this.toStoreKey(opts)}`,
      });
    }

    return Readable.from([found.buffer]);
  }

  override async getObjectStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } } & IStorageReadCondition,
  ): Promise<ReadableStream<Uint8Array>> {
    this.calls.push({
      method: 'getObjectStream',
      args: { ...this.toCallArgs(opts), ifMatch: opts.ifMatch, versionId: opts.versionId },
    });

    if (this.failReadsWith) {
      throw getError({ message: this.failReadsWith });
    }

    const found = this.objects.get(this.toStoreKey(opts));

    if (!found) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getObjectStream] Object not found | ${this.toStoreKey(opts)}`,
      });
    }

    this.assertCondition({
      operation: 'getObjectStream',
      storeKey: this.toStoreKey(opts),
      found,
      ifMatch: opts.ifMatch,
      versionId: opts.versionId,
    });

    const { range } = opts;
    // `end` is inclusive, as in an HTTP range.
    const buffer = range
      ? found.buffer.subarray(range.start, range.end === undefined ? undefined : range.end + 1)
      : found.buffer;

    return Readable.toWeb(Readable.from([buffer])) as ReadableStream<Uint8Array>;
  }

  async getStat(opts: IObjectLocation): Promise<IFileStat> {
    this.calls.push({ method: 'getStat', args: this.toCallArgs(opts) });
    const found = this.objects.get(this.toStoreKey(opts));

    if (!found) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getStat] Object not found | ${this.toStoreKey(opts)}`,
      });
    }

    return {
      size: found.buffer.length,
      metadata: this.statMetadataOverride ?? {
        mimetype: found.mimetype,
        'content-type': found.mimetype,
      },
      etag: this.omitEtag ? undefined : found.etag,
      versionId: this.reportedVersionId ?? found.versionId,
      lastModified: new Date('2024-01-01T00:00:00Z'),
    };
  }

  /** Throws like `disk` does, so the controller's idempotent DELETE is exercised rather than assumed. */
  async removeObject(opts: IObjectLocation): Promise<void> {
    this.calls.push({ method: 'removeObject', args: this.toCallArgs(opts) });

    if (!this.objects.delete(this.toStoreKey(opts))) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[removeObject] Object not found | ${this.toStoreKey(opts)}`,
      });
    }
  }

  async removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void> {
    const { bucket, objects } = opts;
    this.calls.push({
      method: 'removeObjects',
      args: { bucket: bucket.name, names: objects.map((object) => object.key) },
    });

    for (const object of objects) {
      this.objects.delete(this.toStoreKey({ bucket, object }));
    }
  }

  async listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]> {
    this.calls.push({ method: 'listObjects', args: { ...opts, bucket: opts.bucket.name } });
    const results: IObjectInfo[] = [];

    const objectsEntries = this.objects.entries();

    for (const [key, value] of objectsEntries) {
      if (!key.startsWith(`${opts.bucket.name}/`)) {
        continue;
      }

      const name = key.slice(opts.bucket.name.length + 1);

      if (opts.prefix && !name.startsWith(opts.prefix)) {
        continue;
      }

      results.push({ name, size: value.buffer.length, etag: value.etag });
    }

    return results;
  }
}

/** The same fake declaring the disk backend, for what a disk helper must refuse (direct upload). */
export class FakeDiskStorageHelper extends FakeStorageHelper {
  override readonly storageType = StorageTypes.DISK;
}

/** A custom helper that declares no storage, which an entry must refuse at boot. */
export class FakeUntypedStorageHelper extends FakeStorageHelper {
  override readonly storageType = undefined;
}
