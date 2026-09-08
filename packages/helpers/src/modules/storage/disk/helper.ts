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
  IFileStat,
  IObjectInfo,
  IStorageHelperOptions,
  IUploadFile,
  StorageErrors,
} from '../common';

export interface IDiskHelperOptions extends IStorageHelperOptions {
  basePath: string; // Base directory for storage
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

  private getBucketPath(bucketName: string): string {
    return path.join(this.basePath, bucketName);
  }

  private getObjectPath(bucketName: string, objectName: string): string {
    return path.join(this.getBucketPath(bucketName), objectName);
  }

  /**
   * Every read and delete resolves through here. Name validation alone is not enough: it is a rule about
   * the input, and containment is a fact about the resolved path, so both are checked - the second one
   * is what survives a rule we get wrong.
   */
  private resolveObjectPath(opts: { bucket: string; name: string }): string {
    const { bucket, name } = opts;

    if (!this.isValidName({ name: bucket })) {
      throw getError({ message: `[storage] Invalid bucket name | bucket: ${bucket}` });
    }

    if (!this.isValidPath({ path: name, maxDepth: Number.MAX_SAFE_INTEGER })) {
      throw getError({ message: `[storage] Invalid object name | name: ${name}` });
    }

    const bucketPath = this.getBucketPath(bucket);
    const objectPath = path.resolve(bucketPath, name);

    if (objectPath !== bucketPath && !objectPath.startsWith(`${bucketPath}${path.sep}`)) {
      throw getError({ message: `[storage] Invalid object name | name: ${name}` });
    }

    return objectPath;
  }

  /**
   * One syscall that answers existence AND type. `null` means "not there"; anything other than ENOENT
   * is logged, because EACCES or EIO mean the path may well exist and simply cannot be read.
   */
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

  private async exists(pathToCheck: string): Promise<boolean> {
    return (await this.statOrNull({ target: pathToCheck })) !== null;
  }

  /** One `stat` answers both "is it there" and "is it a directory"; `access` first only doubled the syscalls. */
  async hasBucket(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    if (!this.isValidName({ name })) {
      return false;
    }

    const stat = await this.statOrNull({ target: this.getBucketPath(name) });
    return stat?.isDirectory() ?? false;
  }

  async getBuckets(): Promise<IBucketInfo[]> {
    if (!(await this.exists(this.basePath))) {
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

  async getBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const { name } = opts;
    if (!this.isValidName({ name })) {
      return null;
    }

    const stat = await this.statOrNull({ target: this.getBucketPath(name) });

    if (!stat?.isDirectory()) {
      return null;
    }

    return { name, creationDate: stat.birthtime };
  }

  async createBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const { name } = opts;
    if (!this.isValidName({ name })) {
      throw getError({
        message: '[createBucket] Invalid name to create bucket!',
      });
    }

    const bucketPath = this.getBucketPath(name);

    if (await this.exists(bucketPath)) {
      throw getError({
        message: `[createBucket] Bucket already exists | name: ${name}`,
      });
    }

    await fsp.mkdir(bucketPath, { recursive: true });
    return this.getBucket({ name });
  }

  async removeBucket(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    if (!this.isValidName({ name })) {
      throw getError({
        message: '[removeBucket] Invalid name to remove bucket!',
      });
    }

    const bucketPath = this.getBucketPath(name);

    if (!(await this.exists(bucketPath))) {
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

  protected async writeObject(opts: {
    bucket: string;
    normalizeName: string;
    file: IUploadFile;
  }): Promise<void> {
    const { bucket, normalizeName, file } = opts;

    const objectPath = this.getObjectPath(bucket, normalizeName);

    // `recursive` already succeeds on an existing directory, so an existence probe first is a wasted syscall per file.
    await fsp.mkdir(path.dirname(objectPath), { recursive: true });
    await fsp.writeFile(objectPath, file.buffer);
  }

  async getObject(opts: { bucket: string; name: string; options?: any }): Promise<Readable> {
    const { bucket, name } = opts;
    const objectPath = this.resolveObjectPath({ bucket, name });

    if (!(await this.exists(objectPath))) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getObject] Object not found | bucket: ${bucket} | name: ${name}`,
      });
    }

    return fs.createReadStream(objectPath);
  }

  /** `createReadStream` seeks natively, so a range never reads the bytes before it. */
  override async getObjectStream(opts: {
    bucket: string;
    name: string;
    range?: { start: number; end?: number };
  }): Promise<ReadableStream<Uint8Array>> {
    const { bucket, name, range } = opts;
    const objectPath = this.resolveObjectPath({ bucket, name });

    if (!(await this.exists(objectPath))) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getObjectStream] Object not found | bucket: ${bucket} | name: ${name}`,
      });
    }

    const source = fs.createReadStream(
      objectPath,
      range ? { start: range.start, end: range.end } : {},
    );

    return Readable.toWeb(source) as ReadableStream<Uint8Array>;
  }

  async getStat(opts: { bucket: string; name: string }): Promise<IFileStat> {
    const { bucket, name } = opts;
    const objectPath = this.resolveObjectPath({ bucket, name });
    const stat = await this.statOrNull({ target: objectPath });

    if (!stat) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getStat] Object not found | bucket: ${bucket} | name: ${name}`,
      });
    }

    return {
      size: stat.size,
      lastModified: stat.mtime,
      metadata: {
        mimetype: this.getMimeType({ filename: name }),
      },
    };
  }

  async removeObject(opts: { bucket: string; name: string }): Promise<void> {
    const { bucket, name } = opts;
    const objectPath = this.resolveObjectPath({ bucket, name });

    if (!(await this.exists(objectPath))) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[removeObject] Object not found | bucket: ${bucket} | name: ${name}`,
      });
    }

    await fsp.unlink(objectPath);
  }

  // Same shape as every other backend: bounded concurrency, and one failure stops the batch there.
  async removeObjects(opts: { bucket: string; names: string[] }): Promise<void> {
    const { bucket, names } = opts;

    await this.mapWithConcurrency({
      items: names,
      task: ({ item: name }) => this.removeObject({ bucket, name }),
    });
  }

  async listObjects(opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<IObjectInfo[]> {
    const { bucket, prefix = '', useRecursive = false, maxKeys } = opts;

    if (!this.isValidName({ name: bucket })) {
      throw getError({ message: `[listObjects] Invalid bucket name | bucket: ${bucket}` });
    }

    // `maxKeys: 0` means zero, not unlimited - a truthiness check silently turned it into "no limit".
    const limit = maxKeys ?? Number.POSITIVE_INFINITY;
    if (limit <= 0) {
      return [];
    }

    const bucketPath = this.getBucketPath(bucket);
    if (!(await this.exists(bucketPath))) {
      return [];
    }

    const objects: IObjectInfo[] = [];

    const scanDirectory = async (dirPath: string, currentPrefix: string = '') => {
      if (objects.length >= limit) {
        return;
      }

      const entries = await fsp.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (objects.length >= limit) {
          return;
        }

        const fullName = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // A prefix that cannot match anything below this directory makes descending pointless.
          const canMatch = !prefix || prefix.startsWith(fullName) || fullName.startsWith(prefix);
          if (useRecursive && canMatch) {
            await scanDirectory(fullPath, fullName);
          }
          continue;
        }

        if (!entry.isFile() || (prefix && !fullName.startsWith(prefix))) {
          continue;
        }

        const stat = await this.statOrNull({ target: fullPath });
        if (!stat) {
          continue;
        }

        objects.push({ name: fullName, size: stat.size, lastModified: stat.mtime });
      }
    };

    await scanDirectory(bucketPath);
    return objects;
  }
}
