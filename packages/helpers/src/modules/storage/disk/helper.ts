import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import { ErrorPrettier } from '@/modules/logger';
import { EchoUtility } from '@/utilities/echo.utility';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { BaseStorageHelper } from '../base';
import {
  type IBucketInfo,
  type IBucketRef,
  type IFileStat,
  type IListObjectsOptions,
  type IObjectInfo,
  type IObjectLocation,
  type IObjectRef,
  type IStorageHelperOptions,
  type IStorageReadCondition,
  type IUploadFile,
  StorageErrors,
  StorageTypes,
} from '../common';

/** Options for `DiskHelper`; `basePath` is created when missing. */
export interface IDiskHelperOptions extends IStorageHelperOptions {
  /** Base directory every bucket lives under. */
  basePath: string;
}

/** Storage backed by the local filesystem: each bucket is a directory under `basePath`, each object a file whose key is its relative path. Names are validated and resolved paths must stay inside the bucket. */
export class DiskHelper extends BaseStorageHelper {
  readonly storageType = StorageTypes.DISK;

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

  /**
   * Whether `target`, with every symbolic link followed, lies inside the real storage root. A target that does not exist
   * yet is judged by its nearest existing parent (a write creates the rest beneath it); a link whose own target is
   * missing is refused, because writing through it would create the file where the link points.
   */
  private async isInsideRoot(opts: { target: string }): Promise<boolean> {
    const root = await this.realpathOrFail({ target: this.basePath });
    let probe = opts.target;

    for (;;) {
      try {
        const real = await fsp.realpath(probe);

        return real === root || real.startsWith(`${root}${path.sep}`);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;

        // A link loop or a path the system refuses as too long is not a place a name can lead to.
        if (code === 'ELOOP' || code === 'ENAMETOOLONG') {
          return false;
        }

        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          throw this.toRealPathError({ error });
        }
      }

      const link = await this.lstatOrNull({ target: probe });

      if (link?.isSymbolicLink()) {
        return false;
      }

      const parent = path.dirname(probe);

      if (parent === probe) {
        return false;
      }

      probe = parent;
    }
  }

  /** The real path of `target`; a failure leaves as {@link DiskHelper.toRealPathError} answers it. */
  private async realpathOrFail(opts: { target: string }): Promise<string> {
    try {
      const result = await fsp.realpath(opts.target);

      return result;
    } catch (error) {
      throw this.toRealPathError({ error });
    }
  }

  /**
   * What a failed `realpath` is reported as: the code, never the path. Node's message holds the absolute path of the
   * server, and a refusal reaches the caller of the storage API. The full error stays in the log.
   */
  private toRealPathError(opts: { error: unknown }) {
    const { error } = opts;
    const code = (error as NodeJS.ErrnoException)?.code ?? 'UNKNOWN';

    this.logger.error(
      'Cannot resolve the real path of a storage target | code: %s | %s',
      code,
      // A system error quotes the path it failed on; the path is a caller's key under the storage root.
      EchoUtility.toSafeEcho({ value: ErrorPrettier.format({ error }) }),
    );

    // A server-side fault, not the caller's: the default status of `getError` is a 400.
    return getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[storage] Cannot resolve the real path of a storage target | code: ${code}`,
    });
  }

  /** `null` when nothing is there (or it cannot be read): the caller walks up to the parent and judges that. */
  private async lstatOrNull(opts: { target: string }): Promise<Stats | null> {
    try {
      const result = await fsp.lstat(opts.target);

      return result;
      // eslint-disable-next-line venizia/no-silent-catch -- a missing or unreadable entry is the answer here: the containment walk goes on to its parent
    } catch {
      return null;
    }
  }

  /** A directory that exists AND lies inside the real root: a bucket that is a link leading outside is not one. */
  private async isReachableBucketPath(opts: { target: string }): Promise<boolean> {
    const inside = await this.isInsideRoot(opts);

    if (!inside) {
      return false;
    }

    return this.exists(opts);
  }

  /** The path of an object after the checks of {@link DiskHelper.resolveObjectPath} and the real-path containment check. */
  private async resolveContainedObjectPath(opts: IObjectLocation): Promise<string> {
    const objectPath = this.resolveObjectPath(opts);

    const result = await this.isInsideRoot({ target: objectPath });

    if (!result) {
      throw getError({
        message: `[storage] Invalid object name | key: ${EchoUtility.toSafeText({ value: opts.object.key })}`,
      });
    }

    return objectPath;
  }

  /** Validates the name AND the resolved path: containment survives a naming rule we get wrong. */
  private resolveObjectPath(opts: IObjectLocation): string {
    const { bucket, object } = opts;

    if (!this.isValidBucketName({ bucket })) {
      throw getError({
        message: `[storage] Invalid bucket name | bucket: ${EchoUtility.toSafeText({ value: bucket.name })}`,
      });
    }

    if (!this.isValidObjectKey({ object, maxDepth: Number.MAX_SAFE_INTEGER })) {
      throw getError({
        message: `[storage] Invalid object name | key: ${EchoUtility.toSafeText({ value: object.key })}`,
      });
    }

    const bucketPath = this.getBucketPath({ bucket });
    const objectPath = path.resolve(bucketPath, object.key);

    if (objectPath !== bucketPath && !objectPath.startsWith(`${bucketPath}${path.sep}`)) {
      throw getError({
        message: `[storage] Invalid object name | key: ${EchoUtility.toSafeText({ value: object.key })}`,
      });
    }

    return objectPath;
  }

  /** `null` means not there. Anything but ENOENT is logged: it may exist and be unreadable. */
  private async statOrNull(opts: { target: string }): Promise<Stats | null> {
    const { target } = opts;

    try {
      const result = await fsp.stat(target);

      return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.warn(
          '[statOrNull] Cannot determine existence, reporting missing | path: %s | %s',
          EchoUtility.toSafeEcho({ value: target }),
          // The error's own text quotes the path, so it is escaped like the path is.
          EchoUtility.toSafeEcho({ value: ErrorPrettier.format({ error }) }),
        );
      }

      return null;
    }
  }

  private async exists(opts: { target: string }): Promise<boolean> {
    const result = await this.statOrNull(opts);

    return result !== null;
  }

  /** An object is a regular file: a directory under the same path is not one, so it reads as not found. */
  private async isFile(opts: { target: string }): Promise<boolean> {
    const result = await this.statOrNull(opts);

    return result?.isFile() ?? false;
  }

  /** One `stat` answers existence and type. */
  async hasBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    if (!this.isValidBucketName(opts)) {
      return false;
    }

    const target = this.getBucketPath(opts);

    // A bucket that is a link leading outside the root is not a bucket.
    const result = await this.isInsideRoot({ target });

    if (!result) {
      return false;
    }

    const stat = await this.statOrNull({ target });

    return stat?.isDirectory() ?? false;
  }

  async getBuckets(): Promise<IBucketInfo[]> {
    const result = await this.exists({ target: this.basePath });

    if (!result) {
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

    const target = this.getBucketPath(opts);
    const inside = await this.isInsideRoot({ target });

    if (!inside) {
      return null;
    }

    const stat = await this.statOrNull({ target });

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

    const result = await this.exists({ target: bucketPath });

    if (result) {
      throw getError({
        message: `[createBucket] Bucket already exists | name: ${EchoUtility.toSafeText({ value: name })}`,
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

    const result = await this.isReachableBucketPath({ target: bucketPath });

    if (!result) {
      throw getError({
        message: `[removeBucket] Bucket does not exist | name: ${EchoUtility.toSafeText({ value: name })}`,
      });
    }

    const files = await fsp.readdir(bucketPath);

    if (files.length > 0) {
      throw getError({
        message: `[removeBucket] Bucket is not empty | name: ${EchoUtility.toSafeText({ value: name })}`,
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
    // The same validated, contained path every other operation uses: `writeStream` reaches here without `upload`'s checks.
    const objectPath = await this.resolveContainedObjectPath({ bucket, object });

    // `recursive` succeeds on an existing directory; probing first wastes a syscall per file.
    await fsp.mkdir(path.dirname(objectPath), { recursive: true });
    await fsp.writeFile(objectPath, file.buffer);
  }

  async getObject(opts: IObjectLocation & { options?: any }): Promise<Readable> {
    const { bucket, object } = opts;
    const objectPath = await this.resolveContainedObjectPath({ bucket, object });

    const result = await this.isFile({ target: objectPath });

    if (!result) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getObject] Object not found | bucket: ${EchoUtility.toSafeText({ value: bucket.name })} | key: ${EchoUtility.toSafeText({ value: object.key })}`,
      });
    }

    return fs.createReadStream(objectPath);
  }

  /** `createReadStream` seeks natively, so a range never reads the bytes before it. */
  override async getObjectStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } } & IStorageReadCondition,
  ): Promise<ReadableStream<Uint8Array>> {
    const { bucket, object, range } = opts;
    this.refuseReadCondition({ condition: opts, operation: 'getObjectStream' });
    const objectPath = await this.resolveContainedObjectPath({ bucket, object });

    const result = await this.isFile({ target: objectPath });

    if (!result) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getObjectStream] Object not found | bucket: ${EchoUtility.toSafeText({ value: bucket.name })} | key: ${EchoUtility.toSafeText({ value: object.key })}`,
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
    const objectPath = await this.resolveContainedObjectPath({ bucket, object });
    const stat = await this.statOrNull({ target: objectPath });

    if (!stat?.isFile()) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[getStat] Object not found | bucket: ${EchoUtility.toSafeText({ value: bucket.name })} | key: ${EchoUtility.toSafeText({ value: object.key })}`,
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
    const objectPath = await this.resolveContainedObjectPath({ bucket, object });

    const result = await this.isFile({ target: objectPath });

    if (!result) {
      throw getError({
        error: StorageErrors.OBJECT_NOT_FOUND,
        message: `[removeObject] Object not found | bucket: ${EchoUtility.toSafeText({ value: bucket.name })} | key: ${EchoUtility.toSafeText({ value: object.key })}`,
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
      throw getError({
        message: `[listObjects] Invalid bucket name | bucket: ${EchoUtility.toSafeText({ value: bucket.name })}`,
      });
    }

    // `maxKeys: 0` means zero, not unlimited.
    const limit = maxKeys ?? Number.POSITIVE_INFINITY;

    if (limit <= 0) {
      return [];
    }

    const bucketPath = this.getBucketPath({ bucket });
    const result = await this.isReachableBucketPath({ target: bucketPath });

    if (!result) {
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
