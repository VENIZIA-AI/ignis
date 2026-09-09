import { getError } from '@/modules/error';
import { Client, ClientOptions } from 'minio';
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
} from '../common';

/** @deprecated Use `IBunS3HelperOptions` from `@venizia/ignis-helpers/bun-s3`. */
export interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}

/** @deprecated Use `BunS3Helper` from `@venizia/ignis-helpers/bun-s3`: it reaches MinIO over the same S3 API, and adds presigned URLs, tagging and byte ranges. Removed once that path is settled. */
export class MinioHelper extends BaseStorageHelper {
  private client: Client;

  constructor(options: IMinioHelperOptions) {
    super({
      scope: options.scope ?? MinioHelper.name,
      identifier: options.identifier ?? MinioHelper.name,
    });
    this.client = new Client(options);
  }

  async hasBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    const { name } = opts.bucket;
    if (!this.isValidBucketName(opts)) {
      return false;
    }

    const isExists = await this.client.bucketExists(name);
    return isExists;
  }

  async getBuckets(): Promise<IBucketInfo[]> {
    const buckets = await this.client.listBuckets();
    return buckets;
  }

  async getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    const isExists = await this.hasBucket(opts);
    if (!isExists) {
      return null;
    }

    const buckets = await this.getBuckets();
    const bucket = buckets.find(el => el.name === opts.bucket.name);
    return bucket ?? null;
  }

  async createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    const { name } = opts.bucket;
    if (!this.isValidBucketName(opts)) {
      throw getError({
        message: '[createBucket] Invalid name to create bucket!',
      });
    }

    await this.client.makeBucket(name);
    const bucket = await this.getBucket(opts);
    return bucket;
  }

  async removeBucket(opts: { bucket: IBucketRef }): Promise<boolean> {
    const { name } = opts.bucket;
    if (!this.isValidBucketName(opts)) {
      throw getError({
        message: '[removeBucket] Invalid name to remove bucket!',
      });
    }

    await this.client.removeBucket(name);
    return true;
  }

  protected get defaultLinkPrefix(): string {
    return '/static-assets/';
  }

  protected async writeObject(opts: IObjectLocation & { file: IUploadFile }): Promise<void> {
    const { bucket, object, file } = opts;
    const { originalName, mimetype: mimeType, buffer, size, encoding } = file;

    await this.client.putObject(bucket.name, object.key, buffer, size, {
      originalName,
      normalizeName: object.key,
      size,
      encoding,
      mimeType,
    });
  }

  async getObject(
    opts: IObjectLocation & {
      options?: {
        versionId?: string;
        SSECustomerAlgorithm?: string;
        SSECustomerKey?: string;
        SSECustomerKeyMD5?: string;
      };
    },
  ): Promise<Readable> {
    const { bucket, object, options } = opts;

    try {
      return await this.client.getObject(bucket.name, object.key, options);
    } catch (error) {
      throw this.asStorageError({ error, operation: 'getObject', bucket, object });
    }
  }

  /** A native ranged GET, so only the requested bytes leave the server. */
  override async getObjectStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } },
  ): Promise<ReadableStream<Uint8Array>> {
    const { bucket, object, range } = opts;

    if (!range) {
      const whole = await this.getObject({ bucket, object });
      return Readable.toWeb(whole) as ReadableStream<Uint8Array>;
    }

    // HTTP ranges include `end`; minio takes a length.
    const length = range.end === undefined ? undefined : range.end - range.start + 1;

    try {
      const partial = await this.client.getPartialObject(
        bucket.name,
        object.key,
        range.start,
        length,
      );
      return Readable.toWeb(partial) as ReadableStream<Uint8Array>;
    } catch (error) {
      throw this.asStorageError({ error, operation: 'getObjectStream', bucket, object });
    }
  }

  async getStat(opts: IObjectLocation): Promise<IFileStat> {
    const { bucket, object } = opts;

    try {
      const stat = await this.client.statObject(bucket.name, object.key);
      return {
        size: stat.size,
        metadata: stat.metaData,
        lastModified: stat.lastModified,
        etag: stat.etag,
        versionId: stat.versionId ?? undefined,
      };
    } catch (error) {
      throw this.asStorageError({ error, operation: 'getStat', bucket, object });
    }
  }

  async removeObject(opts: IObjectLocation): Promise<void> {
    const { bucket, object } = opts;
    await this.client.removeObject(bucket.name, object.key);
  }

  async removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void> {
    const { bucket, objects } = opts;
    await this.client.removeObjects(
      bucket.name,
      objects.map(object => object.key),
    );
  }

  async listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]> {
    const { bucket, prefix = '', useRecursive = false, maxKeys } = opts;

    // `maxKeys: 0` means zero, not unlimited.
    const limit = maxKeys ?? Number.POSITIVE_INFINITY;
    if (limit <= 0) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const objects: IObjectInfo[] = [];
      // The driver paginates past 1000 keys; the only cap here is the caller's.
      const stream = this.client.listObjects(bucket.name, prefix, useRecursive);

      // `destroy()` stops the stream only eventually; pushing past it mutates a resolved array.
      let isSettled = false;

      stream.on('data', obj => {
        if (isSettled) {
          return;
        }

        objects.push({
          name: obj.name,
          size: obj.size,
          lastModified: obj.lastModified,
          etag: obj.etag,
          prefix: obj.prefix,
        });

        if (objects.length >= limit) {
          isSettled = true;
          stream.destroy();
          resolve(objects);
        }
      });

      stream.on('end', () => {
        if (isSettled) {
          return;
        }

        isSettled = true;
        resolve(objects);
      });

      stream.on('error', err => {
        if (isSettled) {
          return;
        }

        isSettled = true;
        reject(err);
      });
    });
  }
}
