import {
  BaseStorageHelper,
  getError,
  type IBucketInfo,
  type IFileStat,
  type IObjectInfo,
  type IUploadFile,
} from '@venizia/ignis-helpers';
import { Readable } from 'node:stream';

export interface IStorageCall {
  method: string;
  args: Record<string, unknown>;
}

/**
 * In-memory storage helper for component tests. Extends the real BaseStorageHelper so
 * `isValidName` / `isValidPath` / `upload` behave exactly as in production, while every backend
 * call is recorded so tests can assert what actually reached the storage layer.
 */
export class FakeStorageHelper extends BaseStorageHelper {
  readonly calls: IStorageCall[] = [];
  private readonly buckets = new Map<string, IBucketInfo>();
  private readonly objects = new Map<string, { buffer: Buffer; mimetype: string }>();

  /** originalName of a file whose writeObject must fail (storage failure simulation). */
  failWriteOnName?: string;

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

  hasObject(opts: { bucket: string; name: string }): boolean {
    return this.objects.has(`${opts.bucket}/${opts.name}`);
  }

  protected get defaultLinkPrefix(): string {
    return '/fake-storage/';
  }

  protected async writeObject(opts: {
    bucket: string;
    normalizeName: string;
    file: IUploadFile;
  }): Promise<void> {
    const { bucket, normalizeName, file } = opts;
    this.calls.push({
      method: 'writeObject',
      args: { bucket, normalizeName, bufferLength: file.buffer?.length ?? -1, size: file.size },
    });

    if (this.failWriteOnName && this.failWriteOnName === file.originalName) {
      throw getError({ message: `[writeObject] Simulated storage failure | ${file.originalName}` });
    }

    this.objects.set(`${bucket}/${normalizeName}`, {
      buffer: Buffer.from(file.buffer),
      mimetype: file.mimetype,
    });
  }

  async isBucketExists(opts: { name: string }): Promise<boolean> {
    this.calls.push({ method: 'isBucketExists', args: { ...opts } });
    return this.buckets.has(opts.name);
  }

  async getBuckets(): Promise<IBucketInfo[]> {
    this.calls.push({ method: 'getBuckets', args: {} });
    return [...this.buckets.values()];
  }

  async getBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    this.calls.push({ method: 'getBucket', args: { ...opts } });
    return this.buckets.get(opts.name) ?? null;
  }

  async createBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    this.calls.push({ method: 'createBucket', args: { ...opts } });
    const created: IBucketInfo = {
      name: opts.name,
      creationDate: new Date('2024-01-01T00:00:00Z'),
    };
    this.buckets.set(opts.name, created);
    return created;
  }

  async removeBucket(opts: { name: string }): Promise<boolean> {
    this.calls.push({ method: 'removeBucket', args: { ...opts } });
    return this.buckets.delete(opts.name);
  }

  async getFile(opts: { bucket: string; name: string }): Promise<Readable> {
    this.calls.push({ method: 'getFile', args: { ...opts } });
    const found = this.objects.get(`${opts.bucket}/${opts.name}`);

    if (!found) {
      throw getError({ message: `[getFile] Not found | ${opts.bucket}/${opts.name}` });
    }

    return Readable.from([found.buffer]);
  }

  async getStat(opts: { bucket: string; name: string }): Promise<IFileStat> {
    this.calls.push({ method: 'getStat', args: { ...opts } });
    const found = this.objects.get(`${opts.bucket}/${opts.name}`);

    if (!found) {
      throw getError({ message: `[getStat] Not found | ${opts.bucket}/${opts.name}` });
    }

    return {
      size: found.buffer.length,
      metadata: { mimetype: found.mimetype, 'content-type': found.mimetype },
      etag: 'fake-etag',
      lastModified: new Date('2024-01-01T00:00:00Z'),
    };
  }

  async removeObject(opts: { bucket: string; name: string }): Promise<void> {
    this.calls.push({ method: 'removeObject', args: { ...opts } });
    this.objects.delete(`${opts.bucket}/${opts.name}`);
  }

  async removeObjects(opts: { bucket: string; names: string[] }): Promise<void> {
    this.calls.push({ method: 'removeObjects', args: { ...opts } });
    for (const name of opts.names) {
      this.objects.delete(`${opts.bucket}/${name}`);
    }
  }

  async listObjects(opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<IObjectInfo[]> {
    this.calls.push({ method: 'listObjects', args: { ...opts } });
    const results: IObjectInfo[] = [];

    for (const [key, value] of this.objects.entries()) {
      if (!key.startsWith(`${opts.bucket}/`)) {
        continue;
      }

      const name = key.slice(opts.bucket.length + 1);
      if (opts.prefix && !name.startsWith(opts.prefix)) {
        continue;
      }

      results.push({ name, size: value.buffer.length, etag: 'fake-etag' });
    }

    return results;
  }
}
