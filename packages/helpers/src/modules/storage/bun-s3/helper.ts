import { S3Client } from 'bun';
import { Readable } from 'node:stream';
import { getError } from '@/modules/error';
import { BaseStorageHelper } from '../base';
import type {
  IBucketInfo,
  IFileStat,
  IObjectInfo,
  IStorageHelperOptions,
  IUploadFile,
  IUploadResult,
} from '../types';
import { buildSignedRequest } from './utility';

export interface IBunS3HelperOptions extends IStorageHelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region?: string;
  sessionToken?: string;
}

export class BunS3Helper extends BaseStorageHelper {
  private client: S3Client;
  private credentials: {
    accessKey: string;
    secretKey: string;
    endpoint: string;
    region: string;
    sessionToken?: string;
  };

  constructor(options: IBunS3HelperOptions) {
    super({
      scope: options.scope ?? BunS3Helper.name,
      identifier: options.identifier ?? BunS3Helper.name,
    });

    this.credentials = {
      accessKey: options.accessKey,
      secretKey: options.secretKey,
      endpoint: options.endpoint,
      region: options.region ?? 'us-east-1',
      sessionToken: options.sessionToken,
    };

    this.client = new S3Client({
      accessKeyId: options.accessKey,
      secretAccessKey: options.secretKey,
      endpoint: options.endpoint,
      region: options.region,
      sessionToken: options.sessionToken,
    });
  }

  async isBucketExists(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    if (!this.isValidName(name)) {
      return false;
    }

    try {
      await this.client.list({ maxKeys: 1 }, { bucket: name });
      return true;
    } catch {
      return false;
    }
  }

  async getBuckets(): Promise<IBucketInfo[]> {
    const { accessKey, secretKey, endpoint, region, sessionToken } = this.credentials;

    const { url, headers } = await buildSignedRequest({
      method: 'GET',
      endpoint,
      path: '/',
      accessKey,
      secretKey,
      region,
      sessionToken,
    });

    const res = await fetch(url, { method: 'GET', headers });
    const xml = await res.text();

    if (!res.ok) {
      throw getError({ message: `[getBuckets] S3 error: ${xml}` });
    }

    const buckets: IBucketInfo[] = [];
    const bucketMatches = xml.matchAll(
      /<Bucket>\s*<Name>(.*?)<\/Name>\s*<CreationDate>(.*?)<\/CreationDate>\s*<\/Bucket>/gs,
    );

    for (const match of bucketMatches) {
      buckets.push({
        name: match[1],
        creationDate: new Date(match[2]),
      });
    }

    return buckets;
  }

  async getBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const isExists = await this.isBucketExists(opts);
    if (!isExists) {
      return null;
    }

    const buckets = await this.getBuckets();
    return buckets.find(b => b.name === opts.name) ?? null;
  }

  async createBucket(opts: { name: string }): Promise<IBucketInfo | null> {
    const { name } = opts;
    if (!this.isValidName(name)) {
      throw getError({ message: '[createBucket] Invalid name to create bucket!' });
    }

    const { accessKey, secretKey, endpoint, region, sessionToken } = this.credentials;

    const { url, headers } = await buildSignedRequest({
      method: 'PUT',
      endpoint,
      path: `/${name}`,
      accessKey: accessKey,
      secretKey,
      region,
      sessionToken,
    });

    const res = await fetch(url, { method: 'PUT', headers });

    if (!res.ok) {
      const xml = await res.text();
      throw getError({ message: `[createBucket] S3 error: ${xml}` });
    }

    return this.getBucket({ name });
  }

  async removeBucket(opts: { name: string }): Promise<boolean> {
    const { name } = opts;
    if (!this.isValidName(name)) {
      throw getError({ message: '[removeBucket] Invalid name to remove bucket!' });
    }

    const { accessKey, secretKey, endpoint, region, sessionToken } = this.credentials;

    const { url, headers } = await buildSignedRequest({
      method: 'DELETE',
      endpoint,
      path: `/${name}`,
      accessKey: accessKey,
      secretKey: secretKey,
      region,
      sessionToken,
    });

    const res = await fetch(url, { method: 'DELETE', headers });

    if (!res.ok) {
      const xml = await res.text();
      throw getError({ message: `[removeBucket] S3 error: ${xml}` });
    }

    return true;
  }

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
      throw getError({ message: `[upload] Bucket does not exist | name: ${bucket}` });
    }

    for (const file of files) {
      const { originalName, size, folderPath } = file;

      if (!this.isValidName(originalName)) {
        throw getError({ message: '[upload] Invalid original file name' });
      }

      if (folderPath && !this.isValidName(folderPath)) {
        throw getError({ message: '[upload] Invalid folder path' });
      }

      if (!size) {
        throw getError({ message: '[upload] Invalid file size' });
      }
    }

    const uploadPromises = files.map(async file => {
      const { folderPath, originalName, mimetype: mimeType, buffer, size, encoding } = file;
      const t = performance.now();

      const normalizeName = normalizeNameFn
        ? normalizeNameFn({ originalName, folderPath })
        : folderPath
          ? `${folderPath.toLowerCase().replace(/ /g, '_')}/${originalName.toLowerCase().replace(/ /g, '_')}`
          : originalName.toLowerCase().replace(/ /g, '_');

      const normalizeLink = normalizeLinkFn
        ? normalizeLinkFn({ bucketName: bucket, normalizeName })
        : `/static-assets/${bucket}/${encodeURIComponent(normalizeName)}`;

      await this.client.write(normalizeName, buffer, { bucket, type: mimeType });

      this.logger
        .for(this.upload.name)
        .info(
          'Uploaded: %j | Took: %s (ms)',
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

  async getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable> {
    const { bucket, name } = opts;
    const s3file = this.client.file(name, { bucket });
    return Readable.fromWeb(s3file.stream() as any);
  }

  async getStat(opts: { bucket: string; name: string }): Promise<IFileStat> {
    const { bucket, name } = opts;
    const stat = await this.client.stat(name, { bucket });
    return {
      size: stat.size,
      metadata: { contentType: stat.type, mimetype: stat.type },
      lastModified: stat.lastModified,
      etag: stat.etag,
    };
  }

  async removeObject(opts: { bucket: string; name: string }): Promise<void> {
    const { bucket, name } = opts;
    await this.client.delete(name, { bucket });
  }

  async removeObjects(opts: { bucket: string; names: string[] }): Promise<void> {
    const { bucket, names } = opts;
    await Promise.all(names.map(name => this.removeObject({ bucket, name })));
  }

  async listObjects(opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<IObjectInfo[]> {
    const { bucket, prefix, maxKeys } = opts;

    const response = await this.client.list({ prefix, maxKeys }, { bucket });

    return (response.contents ?? []).map(obj => ({
      name: obj.key,
      size: obj.size,
      lastModified: obj.lastModified ? new Date(obj.lastModified) : undefined,
      etag: obj.eTag,
    }));
  }
}
