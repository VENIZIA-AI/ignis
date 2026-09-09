import { getError } from '@venizia/ignis-helpers/core';
import {
  StorageErrors,
  BaseStorageHelper,
  type IBucketInfo,
  type IBucketRef,
  type IFileStat,
  type IListObjectsOptions,
  type IObjectInfo,
  type IObjectLocation,
  type IObjectRef,
  type IUploadFile,
} from '@venizia/ignis-helpers';
import { Readable } from 'node:stream';

export interface IStorageCall {
  method: string;
  args: Record<string, unknown>;
}

/** In-memory storage helper extending the real BaseStorageHelper so `isValidName`/`isValidPath`/`upload` behave exactly as in production, while every backend call is recorded. */
export class FakeStorageHelper extends BaseStorageHelper {
  readonly calls: IStorageCall[] = [];
  private readonly buckets = new Map<string, IBucketInfo>();
  private readonly objects = new Map<string, { buffer: Buffer; mimetype: string }>();

  /** originalName of a file whose writeObject must fail (storage failure simulation). */
  failWriteOnName?: string;

  /** Stands in for a backend reporting its own content type - minio does, bun-s3 reports camelCase keys. */
  statMetadataOverride?: Record<string, string>;

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
      .filter(call => typeof call.args['name'] === 'string')
      .map(call => String(call.args['name']));
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

    this.objects.set(`${bucket.name}/${object.key}`, {
      buffer: Buffer.from(file.buffer),
      mimetype: file.mimetype,
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
      etag: 'fake-etag',
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
      args: { bucket: bucket.name, names: objects.map(object => object.key) },
    });

    for (const object of objects) {
      this.objects.delete(this.toStoreKey({ bucket, object }));
    }
  }

  async listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]> {
    this.calls.push({ method: 'listObjects', args: { ...opts, bucket: opts.bucket.name } });
    const results: IObjectInfo[] = [];

    for (const [key, value] of this.objects.entries()) {
      if (!key.startsWith(`${opts.bucket.name}/`)) {
        continue;
      }

      const name = key.slice(opts.bucket.name.length + 1);
      if (opts.prefix && !name.startsWith(opts.prefix)) {
        continue;
      }

      results.push({ name, size: value.buffer.length, etag: 'fake-etag' });
    }

    return results;
  }
}
