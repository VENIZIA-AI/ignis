import { Readable } from 'node:stream';

// -------------------------------------------------------------------------
export interface IUploadFile {
  originalName: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  encoding?: string;
  folderPath?: string;
  [key: string | symbol]: any;
}

// -------------------------------------------------------------------------
export interface IUploadResult {
  bucketName: string;
  objectName: string;
  link: string;
  metaLink?: any;
  metaLinkError?: any;
}

// -------------------------------------------------------------------------
export interface IFileStat {
  size: number;
  metadata: Record<string, any>;
  lastModified?: Date;
  etag?: string;
  versionId?: string;
}

// -------------------------------------------------------------------------
export interface IBucketInfo {
  name: string;
  creationDate: Date;
}

// -------------------------------------------------------------------------
export interface IObjectInfo {
  name?: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
  prefix?: string;
}

// -------------------------------------------------------------------------
export interface IListObjectsOptions {
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}

// -------------------------------------------------------------------------
export interface IStorageHelperOptions {
  scope?: string;
  identifier?: string;
}

// -------------------------------------------------------------------------
export interface IStorageHelper {
  // Name validation
  isValidName(name: string): boolean;

  // Bucket operations
  isBucketExists(opts: { name: string }): Promise<boolean>;
  getBuckets(): Promise<IBucketInfo[]>;
  getBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  createBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  removeBucket(opts: { name: string }): Promise<boolean>;

  // File operations
  upload(opts: {
    bucket: string;
    files: IUploadFile[];
    normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
    normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  }): Promise<IUploadResult[]>;

  getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable>;
  getStat(opts: { bucket: string; name: string }): Promise<IFileStat>;
  removeObject(opts: { bucket: string; name: string }): Promise<void>;
  removeObjects(opts: { bucket: string; names: string[] }): Promise<void>;
  listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;

  // Utility
  getFileType(opts: { mimeType: string }): string;
}
