import { getError } from '@/modules/error';
import { ErrorPrettier } from '@/modules/logger';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { BaseStorageHelper } from '../base';
import {
  IBucketInfo,
  IBucketRef,
  IFileStat,
  IListObjectsOptions,
  IObjectInfo,
  IObjectLocation,
  IObjectRef,
  IStorageHelperOptions,
  IUploadFile,
  StorageErrors,
} from '../common';

export interface IDiskHelperOptions extends IStorageHelperOptions {
  /** Base directory every bucket lives under. */
  basePath: string;
}

export class DiskHelper extends BaseStorageHelper {
  private basePath: string;

  constructor(options: IDiskHelperOptions) {
    super({
      scope: options.scope ?? DiskHelper.name,
      identifier: options.identifier ?? DiskHelper.name,
    });
    this.basePath = path.resolve(options.basePath);

    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  private getBucketPath(opts: { bucket: IBucketRef }): string {
    return path.join(this.basePath, opts.bucket.name);
  }

  private getObjectPath(opts: IObjectLocation): string {
    return path.join(this.getBucketPath({ bucket: opts.bucket }), opts.object.key);
  }

  /** Validates the name AND the resolved path: containment survives a naming rule we get wrong. */
  private resolveObjectPath(opts: IObjectLocation): string {
    const { bucket, object } = opts;

    if (!this.isValidBucketName({ bucket })) {
      throw getError({ message: `[storage] Invalid bucket name | bucket: ${bucket.name}` });
    }

    if (!this.isValidObjectKey({ object, maxDepth: Number.MAX_SAFE_INTEGER })) {
      throw getError({ message: `[storage] Invalid object name | key: ${object.key}` });
    }

    const bucketPath = this.getBucketPath({ bucket });
    const objectPath = path.resolve(bucketPath, object.key);

    if (objectPath !== bucketPath && !objectPath.startsWith(`${bucketPath}${path.sep}`)) {
      throw getError({ message: `[storage] Invalid object name | key: ${object.key}` });
    }

    return objectPath;
  }

  /** `null` means not there. Anything but ENOENT is logged: it may exist and be unreadable. */
  private async statOrNull(opts: { target: string }): Promise<Stats | null> {
    const { target } = opts;

    try {
      return await fsp.stat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.warn(
          '[statOrNull] Cannot determine existence, reporting missing | path: %s | %s',
          target,
          ErrorPrettier.format({ error }),
        );
      }

      return null;
    }
  }

  private async exists(opts: { target: string }): Promise<boolean> {
    return (await this.statOrNull(opts)) !== null;
  }

  /** One `stat` answers existence and type. */
  async hasBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    if (!this.isValidBucketName(opts)) {
      return false;
    }

    const stat = await this.statOrNull({ target: this.getBucketPath(opts) });
    return stat?.isDirectory() ?? false;
  }

  async getBuckets(): Promise<IBucketInfo[]> {
    if (!(await this.exists({ target: this.basePath }))) {
      return [];
    }

    const entries = await fsp.readdir(this.basePath, { withFileTypes: true });
    const buckets: IBucketInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const bucketPath = path.join(this.basePath, entry.name);
        const stat = await fsp.stat(bucketPath);
        buckets.push({
          name: entry.name,
          creationDate: stat.birthtime,
        });
      }
    }

    return buckets;
  }

  async getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    const { name } = opts.bucket;

    if (!this.isValidBucketName(opts)) {
      return null;
    }

    const stat = await this.statOrNull({ target: this.getBucketPath(opts) });

    if (!stat?.isDirectory()) {
      return null;
    }

    return { name, creationDate: stat.birthtime };
  }

  async createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    const { name } = opts.bucket;

    if (!this.isValidBucketName(opts)) {
      throw getError({
        message: '[createBucket] Invalid name to create bucket!',
      });
    }

    const bucketPath = this.getBucketPath(opts);

    if (await this.exists({ target: bucketPath })) {
      throw getError({
        message: `[createBucket] Bucket already exists | name: ${name}`,
      });
    }

    await fsp.mkdir(bucketPath, { recursive: true });
    return this.getBucket(opts);
  }

  async removeBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    const { name } = opts.bucket;

    if (!this.isValidBucketName(opts)) {
      throw getError({
        message: '[removeBucket] Invalid name to remove bucket!',
      });
    }

    const bucketPath = this.getBucketPath(opts);

    if (!(await this.exists({ target: bucketPath }))) {
      throw getError({
        message: `[removeBucket] Bucket does not exist | name: ${name}`,
      });
    }

    const files = await fsp.readdir(bucketPath);
    if (files.length > 0) {
      throw getError({
        message: `[removeBucket] Bucket is not empty | name: ${name}`,
      });
    }

    await fsp.rmdir(bucketPath);
    return true;
  }

  protected get defaultLinkPrefix(): string {
    return '/static-resources/';
  }

  protected async writeObject(opts: IObjectLocation & { file: IUploadFile }): Promise<void> {
    const { bucket, object, file } = opts;
    const objectPath = this.getObjectPath({ bucket, object });

    // `recursive` succeeds on an existing directory; probing first wastes a syscall per file.
    await fsp.mkdir(path.dirname(objectPath), { recursive: true });
    await fsp.writeFile(objectPath, file.buffer);
  }

  async getObject(opts: IObjectLocation & { options?: any }): Promise<Readable> {
    const { bucket, object } = opts;
    const objectPath = this.resolveObjectPath({ bucket, object });

    if (!(await this.exists({ target: objectPath }))) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getObject] Object not found | bucket: ${bucket.name} | key: ${object.key}`,
      });
    }

    return fs.createReadStream(objectPath);
  }

  /** `createReadStream` seeks natively, so a range never reads the bytes before it. */
  override async getObjectStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } },
  ): Promise<ReadableStream<Uint8Array>> {
    const { bucket, object, range } = opts;
    const objectPath = this.resolveObjectPath({ bucket, object });

    if (!(await this.exists({ target: objectPath }))) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getObjectStream] Object not found | bucket: ${bucket.name} | key: ${object.key}`,
      });
    }

    const source = fs.createReadStream(
      objectPath,
      range ? { start: range.start, end: range.end } : {},
    );

    return Readable.toWeb(source) as ReadableStream<Uint8Array>;
  }

  async getStat(opts: IObjectLocation): Promise<IFileStat> {
    const { bucket, object } = opts;
    const objectPath = this.resolveObjectPath({ bucket, object });
    const stat = await this.statOrNull({ target: objectPath });

    if (!stat) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getStat] Object not found | bucket: ${bucket.name} | key: ${object.key}`,
      });
    }

    return {
      size: stat.size,
      lastModified: stat.mtime,
      metadata: {
        mimetype: this.getMimeType({ filename: object.key }),
      },
    };
  }

  async removeObject(opts: IObjectLocation): Promise<void> {
    const { bucket, object } = opts;
    const objectPath = this.resolveObjectPath({ bucket, object });

    if (!(await this.exists({ target: objectPath }))) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[removeObject] Object not found | bucket: ${bucket.name} | key: ${object.key}`,
      });
    }

    await fsp.unlink(objectPath);
  }

  // Bounded concurrency; one failure stops the batch.
  async removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void> {
    const { bucket, objects } = opts;

    await this.mapWithConcurrency({
      items: objects,
      task: ({ item: object }) => this.removeObject({ bucket, object }),
    });
  }

  async listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]> {
    const { bucket, prefix = '', useRecursive = false, maxKeys } = opts;

    if (!this.isValidBucketName({ bucket })) {
      throw getError({ message: `[listObjects] Invalid bucket name | bucket: ${bucket.name}` });
    }

    // `maxKeys: 0` means zero, not unlimited.
    const limit = maxKeys ?? Number.POSITIVE_INFINITY;
    if (limit <= 0) {
      return [];
    }

    const bucketPath = this.getBucketPath({ bucket });
    if (!(await this.exists({ target: bucketPath }))) {
      return [];
    }

    const objects: IObjectInfo[] = [];

    const scanDirectory = async (scanOptions: {
      directory: { path: string; prefix?: string };
    }): Promise<void> => {
      const { directory } = scanOptions;

      if (objects.length >= limit) {
        return;
      }

      const entries = await fsp.readdir(directory.path, { withFileTypes: true });

      for (const entry of entries) {
        if (objects.length >= limit) {
          return;
        }

        // An object key always joins on '/'; `path.join` would emit '\' on Windows.
        const entryKey = directory.prefix ? `${directory.prefix}/${entry.name}` : entry.name;
        const entryPath = path.join(directory.path, entry.name);

        if (entry.isDirectory()) {
          // A prefix that cannot match below here makes descending pointless.
          const canMatch = !prefix || prefix.startsWith(entryKey) || entryKey.startsWith(prefix);
          if (useRecursive && canMatch) {
            await scanDirectory({ directory: { path: entryPath, prefix: entryKey } });
          }
          continue;
        }

        if (!entry.isFile() || (prefix && !entryKey.startsWith(prefix))) {
          continue;
        }

        const stat = await this.statOrNull({ target: entryPath });
        if (!stat) {
          continue;
        }

        objects.push({ name: entryKey, size: stat.size, lastModified: stat.mtime });
      }
    };

    await scanDirectory({ directory: { path: bucketPath } });
    return objects;
  }
}
