import { getError } from '@/modules/error';
import { Client, ClientOptions } from 'minio';
import { Readable } from 'node:stream';
import { BaseStorageHelper } from '../base';
import { IBucketInfo, IFileStat, IObjectInfo, IStorageHelperOptions, IUploadFile } from '../common';

export interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}

export class MinioHelper extends BaseStorageHelper {
  private client: Client;

  constructor(options: IMinioHelperOptions) {
    super({
      scope: options.scope ?? MinioHelper.name,
      identifier: options.identifier ?? MinioHelper.name,
    });
    this.client = new Client(options);
  }

  async isBucketExists(opts: { name: string }) {
    const { name } = opts;
    if (!this.isValidName(name)) {
      return false;
    }

    const isExists = await this.client.bucketExists(name);
    return isExists;
  }

  async getBuckets(): Promise<IBucketInfo[]> {
    const buckets = await this.client.listBuckets();
    return buckets;
  }

  async getBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const isExists = await this.isBucketExists(opts);
    if (!isExists) {
      return null;
    }

    const buckets = await this.getBuckets();
    const bucket = buckets.find(el => el.name === opts.name);
    return bucket ?? null;
  }

  async createBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const { name } = opts;
    if (!this.isValidName(name)) {
      throw getError({
        message: '[createBucket] Invalid name to create bucket!',
      });
    }

    await this.client.makeBucket(name);
    const bucket = await this.getBucket({ name });
    return bucket;
  }

  async removeBucket(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    if (!this.isValidName(name)) {
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

  protected async writeObject(opts: {
    bucket: string;
    normalizeName: string;
    file: IUploadFile;
  }): Promise<void> {
    const { bucket, normalizeName, file } = opts;
    const { originalName, mimetype: mimeType, buffer, size, encoding } = file;

    await this.client.putObject(bucket, normalizeName, buffer, size, {
      originalName,
      normalizeName,
      size,
      encoding,
      mimeType,
    });
  }

  getFile(opts: {
    bucket: string;
    name: string;
    options?: {
      versionId?: string;
      SSECustomerAlgorithm?: string;
      SSECustomerKey?: string;
      SSECustomerKeyMD5?: string;
    };
  }): Promise<Readable> {
    const { bucket, name, options } = opts;
    return this.client.getObject(bucket, name, options);
  }

  async getStat(opts: { bucket: string; name: string }): Promise<IFileStat> {
    const { bucket, name } = opts;
    const stat = await this.client.statObject(bucket, name);
    return {
      size: stat.size,
      metadata: stat.metaData,
      lastModified: stat.lastModified,
      etag: stat.etag,
      versionId: stat.versionId ?? undefined,
    };
  }

  async removeObject(opts: { bucket: string; name: string }): Promise<void> {
    const { bucket, name } = opts;
    await this.client.removeObject(bucket, name);
  }

  async removeObjects(opts: { bucket: string; names: string[] }): Promise<void> {
    const { bucket, names } = opts;
    await this.client.removeObjects(bucket, names);
  }

  async listObjects(opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<IObjectInfo[]> {
    const { bucket, prefix = '', useRecursive = false, maxKeys } = opts;

    return new Promise((resolve, reject) => {
      const objects: IObjectInfo[] = [];
      const stream = this.client.listObjects(bucket, prefix, useRecursive);

      stream.on('data', obj => {
        objects.push({
          name: obj.name,
          size: obj.size,
          lastModified: obj.lastModified,
          etag: obj.etag,
          prefix: obj.prefix,
        });

        if (maxKeys && objects.length >= maxKeys) {
          stream.destroy();
        }
      });

      stream.on('end', () => resolve(objects));
      stream.on('error', err => reject(err));
    });
  }
}
