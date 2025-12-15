import { getError } from '@/helpers/error';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { BaseStorageHelper } from '../base';
import {
  IBucketInfo,
  IFileStat,
  IObjectInfo,
  IStorageHelperOptions,
  IUploadFile,
  IUploadResult,
} from '../types';

// ================================================================================
export interface IDiskHelperOptions extends IStorageHelperOptions {
  basePath: string; // Base directory for storage
}

// ================================================================================
export class DiskHelper extends BaseStorageHelper {
  private basePath: string;

  constructor(options: IDiskHelperOptions) {
    super({
      scope: options.scope ?? DiskHelper.name,
      identifier: options.identifier ?? DiskHelper.name,
    });
    this.basePath = path.resolve(options.basePath);

    // Ensure base path exists
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  // ---------------------------------------------------------------------
  private getBucketPath(bucketName: string): string {
    return path.join(this.basePath, bucketName);
  }

  // ---------------------------------------------------------------------
  private getObjectPath(bucketName: string, objectName: string): string {
    return path.join(this.getBucketPath(bucketName), objectName);
  }

  // ---------------------------------------------------------------------
  async isBucketExists(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    if (!this.isValidName(name)) {
      return false;
    }

    const bucketPath = this.getBucketPath(name);
    return fs.existsSync(bucketPath) && fs.statSync(bucketPath).isDirectory();
  }

  // ---------------------------------------------------------------------
  async getBuckets(): Promise<IBucketInfo[]> {
    if (!fs.existsSync(this.basePath)) {
      return [];
    }

    const entries = fs.readdirSync(this.basePath, { withFileTypes: true });
    const buckets: IBucketInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const bucketPath = path.join(this.basePath, entry.name);
        const stat = fs.statSync(bucketPath);
        buckets.push({
          name: entry.name,
          creationDate: stat.birthtime,
        });
      }
    }

    return buckets;
  }

  // ---------------------------------------------------------------------
  async getBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const { name } = opts;
    const isExists = await this.isBucketExists(opts);
    if (!isExists) {
      return null;
    }

    const bucketPath = this.getBucketPath(name);
    const stat = fs.statSync(bucketPath);

    return {
      name,
      creationDate: stat.birthtime,
    };
  }

  // ---------------------------------------------------------------------
  async createBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const { name } = opts;
    if (!this.isValidName(name)) {
      throw getError({
        message: '[createBucket] Invalid name to create bucket!',
      });
    }

    const bucketPath = this.getBucketPath(name);

    if (fs.existsSync(bucketPath)) {
      throw getError({
        message: `[createBucket] Bucket already exists | name: ${name}`,
      });
    }

    fs.mkdirSync(bucketPath, { recursive: true });
    return this.getBucket({ name });
  }

  // ---------------------------------------------------------------------
  async removeBucket(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    if (!this.isValidName(name)) {
      throw getError({
        message: '[removeBucket] Invalid name to remove bucket!',
      });
    }

    const bucketPath = this.getBucketPath(name);

    if (!fs.existsSync(bucketPath)) {
      throw getError({
        message: `[removeBucket] Bucket does not exist | name: ${name}`,
      });
    }

    // Check if bucket is empty
    const files = fs.readdirSync(bucketPath);
    if (files.length > 0) {
      throw getError({
        message: `[removeBucket] Bucket is not empty | name: ${name}`,
      });
    }

    fs.rmdirSync(bucketPath);
    return true;
  }

  // ---------------------------------------------------------------------
  async upload(opts: {
    bucket: string;
    files: IUploadFile[];
    normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
    normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  }): Promise<IUploadResult[]> {
    const { bucket, files, normalizeNameFn, normalizeLinkFn } = opts;

    if (!files || files.length === 0) {
      return [];
    }

    const isExists = await this.isBucketExists({ name: bucket });
    if (!isExists) {
      throw getError({
        message: `[upload] Bucket does not exist | name: ${bucket}`,
      });
    }

    // Validate all files first
    for (const file of files) {
      const { originalName, size, folderPath } = file;

      if (!this.isValidName(originalName)) {
        throw getError({ message: '[upload] Invalid original file name' });
      }

      if (folderPath && !this.isValidName(folderPath)) {
        throw getError({ message: '[upload] Invalid folder path' });
      }

      if (!size) {
        throw getError({ message: `[upload] Invalid file size` });
      }
    }

    const uploadPromises = files.map(async file => {
      const { originalName, buffer, size, mimetype: mimeType, encoding, folderPath } = file;
      const t = performance.now();

      const normalizeName = normalizeNameFn
        ? normalizeNameFn({ originalName, folderPath })
        : folderPath
          ? `${folderPath.toLowerCase().replace(/ /g, '_')}/${originalName.toLowerCase().replace(/ /g, '_')}`
          : originalName.toLowerCase().replace(/ /g, '_');
      const normalizeLink = normalizeLinkFn
        ? normalizeLinkFn({ bucketName: bucket, normalizeName })
        : `/static-resources/${bucket}/${encodeURIComponent(normalizeName)}`;

      const objectPath = this.getObjectPath(bucket, normalizeName);
      fs.writeFileSync(objectPath, buffer);

      this.logger.info(
        '[upload] Uploaded: %j | Took: %s (ms)',
        { normalizeName, normalizeLink, mimeType, encoding, size },
        performance.now() - t,
      );

      return {
        bucketName: bucket,
        objectName: normalizeName,
        link: normalizeLink,
      };
    });

    return Promise.all(uploadPromises);
  }

  // ---------------------------------------------------------------------
  async getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable> {
    const { bucket, name } = opts;
    const objectPath = this.getObjectPath(bucket, name);

    if (!fs.existsSync(objectPath)) {
      throw getError({
        message: `[getFile] File not found | bucket: ${bucket} | name: ${name}`,
      });
    }

    return fs.createReadStream(objectPath);
  }

  // ---------------------------------------------------------------------
  async getStat(opts: { bucket: string; name: string }): Promise<IFileStat> {
    const { bucket, name } = opts;
    const objectPath = this.getObjectPath(bucket, name);

    if (!fs.existsSync(objectPath)) {
      throw getError({
        message: `[getStat] File not found | bucket: ${bucket} | name: ${name}`,
      });
    }

    const stat = fs.statSync(objectPath);

    return {
      size: stat.size,
      lastModified: stat.mtime,
      metadata: {},
    };
  }

  // ---------------------------------------------------------------------
  async removeObject(opts: { bucket: string; name: string }): Promise<void> {
    const { bucket, name } = opts;
    const objectPath = this.getObjectPath(bucket, name);

    if (!fs.existsSync(objectPath)) {
      throw getError({
        message: `[removeObject] File not found | bucket: ${bucket} | name: ${name}`,
      });
    }

    fs.unlinkSync(objectPath);
  }

  // ---------------------------------------------------------------------
  async removeObjects(opts: { bucket: string; names: string[] }): Promise<void> {
    const { bucket, names } = opts;

    for (const name of names) {
      await this.removeObject({ bucket, name });
    }
  }

  // ---------------------------------------------------------------------
  async listObjects(opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<IObjectInfo[]> {
    const { bucket, prefix = '', useRecursive = false, maxKeys } = opts;
    const bucketPath = this.getBucketPath(bucket);

    if (!fs.existsSync(bucketPath)) {
      return [];
    }

    const objects: IObjectInfo[] = [];

    const scanDirectory = (dirPath: string, currentPrefix: string = '') => {
      if (maxKeys && objects.length >= maxKeys) {
        return;
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullName = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (useRecursive) {
            scanDirectory(fullPath, fullName);
          }
        } else if (entry.isFile()) {
          // Check if file matches prefix
          if (!prefix || fullName.startsWith(prefix)) {
            const stat = fs.statSync(fullPath);
            objects.push({
              name: fullName,
              size: stat.size,
              lastModified: stat.mtime,
              etag: undefined,
            });

            if (maxKeys && objects.length >= maxKeys) {
              break;
            }
          }
        }
      }
    };

    scanDirectory(bucketPath);
    return objects;
  }
}
