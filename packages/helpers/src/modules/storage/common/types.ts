import { Readable } from 'node:stream';

export interface IUploadFile {
  originalName: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  encoding?: string;
  folderPath?: string;
  [key: string | symbol]: any;
}

/**
 * Scoped, not flat pairs: `bucketName` + `objectName` were two entities flattened into a field pair.
 * `metaLink` is a discriminated union because the old `metaLink` + `metaLinkError` pair let both be
 * present, or neither, and only one of those four states ever means anything.
 */
export interface IUploadResult {
  bucket: { name: string };
  object: { key: string; size: number; contentType: string };
  link: string;
  metaLink?: { data: any } | { error: string };
}

export interface IFileStat {
  size: number;
  metadata: Record<string, any>;
  lastModified?: Date;
  etag?: string;
  versionId?: string;
}

export interface IBucketInfo {
  name: string;
  creationDate: Date;
}

export interface IObjectInfo {
  name?: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
  prefix?: string;
}

export interface IListObjectsOptions {
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}

export interface IStorageHelperOptions {
  scope?: string;
  identifier?: string;
}

export interface IStorageHelper {
  isValidName(opts: { name: string }): boolean;
  isValidPath(opts: { path: string; maxDepth?: number }): boolean;

  hasBucket(opts: { name: string }): Promise<boolean>;
  getBuckets(): Promise<IBucketInfo[]>;
  getBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  createBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  removeBucket(opts: { name: string }): Promise<boolean>;

  getObject(opts: { bucket: string; name: string; options?: any }): Promise<Readable>;

  /**
   * The same bytes as `getObject`, as a web stream. This is what a `Response` body wants, so an HTTP
   * backend avoids the round trip through a Node `Readable` and back. `range` is a byte range,
   * inclusive of `end` like the HTTP header - it is what makes a video seekable.
   */
  getObjectStream(opts: {
    bucket: string;
    name: string;
    range?: { start: number; end?: number };
  }): Promise<ReadableStream<Uint8Array>>;
  getStat(opts: { bucket: string; name: string }): Promise<IFileStat>;
  listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;

  upload(opts: {
    bucket: string;
    files: IUploadFile[];
    maxFolderDepth?: number;
    normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
    normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  }): Promise<IUploadResult[]>;

  removeObject(opts: { bucket: string; name: string }): Promise<void>;
  removeObjects(opts: { bucket: string; names: string[] }): Promise<void>;

  presignPut(opts: { bucket: string; name: string; expiresInSeconds?: number }): Promise<string>;
  presignGet(opts: {
    bucket: string;
    name: string;
    expiresInSeconds?: number;
    responseContentType?: string;
    responseContentDisposition?: string;
  }): Promise<string>;

  getObjectTags(opts: { bucket: string; name: string }): Promise<Record<string, string>>;
  replaceObjectTags(opts: {
    bucket: string;
    name: string;
    tags: Record<string, string>;
  }): Promise<void>;

  getMediaType(opts: { mimeType: string }): string;
  getMimeType(opts: { filename: string }): string;
}
