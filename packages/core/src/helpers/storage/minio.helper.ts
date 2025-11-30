import { BaseHelper } from '@/base/helpers';
import { MimeTypes } from '@/common';
import { getError } from '@/helpers/error';
import isEmpty from 'lodash/isEmpty';
import { Client, ClientOptions } from 'minio';
import { Readable } from 'node:stream';

// ---------------------------------------------------------------------
export interface IUploadFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  encoding: string;
  [key: string | symbol]: any;
}

// ---------------------------------------------------------------------
export class MinioHelper extends BaseHelper {
  client: Client;

  constructor(options: ClientOptions) {
    super({ scope: MinioHelper.name, identifier: MinioHelper.name });
    this.client = new Client(options);
  }

  // ---------------------------------------------------------------------
  async isBucketExists(opts: { name: string }) {
    const { name } = opts;
    if (!name || isEmpty(name)) {
      return false;
    }

    const isExists = await this.client.bucketExists(name);
    return isExists;
  }

  // ---------------------------------------------------------------------
  async getBuckets() {
    const buckets = await this.client.listBuckets();
    return buckets;
  }

  // ---------------------------------------------------------------------
  async getBucket(opts: { name: string }) {
    const isExists = await this.isBucketExists(opts);
    if (!isExists) {
      return null;
    }

    const allBuckets = await this.getBuckets();
    const bucket = allBuckets.find(el => el.name === opts.name);
    return bucket;
  }

  // ---------------------------------------------------------------------
  async createBucket(opts: { name: string }) {
    const { name } = opts;
    if (!name || isEmpty(name)) {
      throw getError({
        message: '[createBucket] Invalid name to create bucket!',
      });
    }

    await this.client.makeBucket(name);
    const bucket = await this.getBucket({ name });
    return bucket;
  }

  // ---------------------------------------------------------------------
  async removeBucket(opts: { name: string }) {
    const { name } = opts;
    if (!name || isEmpty(name)) {
      throw getError({
        message: '[removeBucket] Invalid name to remove bucket!',
      });
    }

    await this.client.removeBucket(name);
    return true;
  }

  // ---------------------------------------------------------------------
  getFileType(opts: { mimeType: string }) {
    const { mimeType } = opts;
    if (mimeType?.toLowerCase()?.startsWith(MimeTypes.IMAGE)) {
      return MimeTypes.IMAGE;
    }

    if (mimeType?.toLowerCase()?.startsWith(MimeTypes.VIDEO)) {
      return MimeTypes.VIDEO;
    }

    if (mimeType?.toLowerCase()?.startsWith(MimeTypes.TEXT)) {
      return MimeTypes.TEXT;
    }

    return MimeTypes.UNKNOWN;
  }

  // ---------------------------------------------------------------------
  async upload(opts: { bucket: string; files: Array<IUploadFile> }) {
    const { bucket, files } = opts;

    const isExists = await this.isBucketExists({ name: bucket });
    if (!isExists) {
      return [];
    }

    if (!files?.length) {
      return [];
    }

    const rs = await Promise.all(
      files?.map(file => {
        const { originalname: originalName, mimetype: mimeType, buffer, size, encoding } = file;

        if (!originalName || isEmpty(originalName)) {
          this.logger.error('[upload] Invalid original name!');
          return;
        }

        const normalizeName = originalName.toLowerCase().replace(/ /g, '_');
        return new Promise((resolve, reject) => {
          const t = new Date().getTime();
          this.client
            .putObject(bucket, normalizeName, buffer, size, {
              originalName,
              normalizeName,
              size,
              encoding,
              mimeType,
            })
            .then(uploadInfo => {
              this.logger.info(
                '[upload] Uploaded: %j | Took: %s (ms)',
                uploadInfo,
                new Date().getTime() - t,
              );

              resolve({
                bucket,
                fileName: normalizeName,
                link: `/static-assets/${bucket}/${encodeURIComponent(normalizeName)}`,
              });
            })
            .catch(error => {
              reject(error);
            });
        });
      }),
    );

    return rs;
  }

  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  async getStat(opts: { bucket: string; name: string }) {
    const { bucket, name } = opts;
    const stat = await this.client.statObject(bucket, name);
    return stat;
  }

  // ---------------------------------------------------------------------
  async removeObject(opts: { bucket: string; name: string }) {
    const { bucket, name } = opts;
    await this.client.removeObject(bucket, name);
  }

  // ---------------------------------------------------------------------
  async removeObjects(opts: { bucket: string; names: Array<string> }) {
    const { bucket, names } = opts;
    await this.client.removeObjects(bucket, names);
  }

  // ---------------------------------------------------------------------
  getListObjects(opts: { bucket: string; prefix?: string; useRecursive?: boolean }) {
    const { bucket, prefix = '', useRecursive = false } = opts;
    const listObjects = this.client.listObjects(bucket, prefix, useRecursive);
    return listObjects;
  }
}
