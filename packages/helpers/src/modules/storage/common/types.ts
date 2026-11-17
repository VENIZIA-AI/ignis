import { type IDuration } from '@/common';
import { type Readable } from 'node:stream';
import type { TStorageType } from './constants';

/** One file handed to `upload`. `buffer` is the whole body; `folderPath`, when set, nests the object under that folder and is depth-checked. */
export interface IUploadFile {
  originalName: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  encoding?: string;
  folderPath?: string;
  [key: string | symbol]: unknown;
}

/** `metaLink` is a union: the old pair allowed both present, or neither. */
export interface IUploadResult {
  bucket: IBucketRef;
  object: IObjectRef & { size: number; contentType: string };
  link: string;
  metaLink?: { data: unknown } | { error: string };
}

/** `mimetype` is named because consumers persist it; `any` let it be renamed silently. */
export interface IObjectMetadata {
  mimetype?: string;
  [key: string]: unknown;
}

/** What `getStat` reports for one object. `size` is in bytes. */
export interface IFileStat {
  size: number;
  metadata: IObjectMetadata;
  lastModified?: Date;
  etag?: string;
  versionId?: string;
}

/** A bucket as `getBuckets`, `getBucket` and `createBucket` report it. */
export interface IBucketInfo {
  name: string;
  creationDate: Date;
}

/** One entry of `listObjects`. `name` is the full object key. */
export interface IObjectInfo {
  name?: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
  prefix?: string;
}

/** One bucket. */
export interface IBucketRef {
  name: string;
}

/** The parts of an upload a naming hook needs; `IUploadFile` already declares both. */
export type TUploadNaming = Pick<IUploadFile, 'originalName' | 'folderPath'>;

/** One object. `key` is the S3 term. */
export interface IObjectRef {
  key: string;
}

/** Which bucket, which object. */
export interface IObjectLocation {
  bucket: IBucketRef;
  object: IObjectRef;
}

/** Filters for `listObjects`. `maxKeys` caps the result, and `0` returns nothing. */
export interface IListObjectsOptions {
  bucket: IBucketRef;
  prefix?: string;

  /**
   * Whether the listing descends into folders.
   *
   * @default false
   */
  useRecursive?: boolean;
  maxKeys?: number;
}

/** What `presignPost` hands a browser: where to post, the fields to post with it, and when the grant dies. */
export interface IPostPolicy {
  postURL: string;
  formData: Record<string, string>;
  expiresAt: string;
}

/** Logger `scope` and `identifier` for a storage helper. */
export interface IStorageHelperOptions {
  scope?: string;
  identifier?: string;
}

/** What a read may require of the object: its ETag, or an exact version. A read that finds other content fails with `StorageErrors.PRECONDITION_FAILED`. A backend that cannot honour it refuses the read. */
export interface IStorageReadCondition {
  ifMatch?: string;
  versionId?: string;
}

/** A byte window of an object. `end` is inclusive, like the HTTP `Range` header. */
export interface IByteRange {
  start: number;
  end?: number;
}

/** `getObjectStream`: one object, an optional byte window, and what the object must still be. */
export type TObjectStreamOptions = IObjectLocation & { range?: IByteRange } & IStorageReadCondition;

/** `upload`: the files, and the rules their names and keys must meet. */
export interface IUploadOptions {
  bucket: IBucketRef;
  files: IUploadFile[];
  /**
   * Folders the caller's `folderPath` may carry.
   *
   * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
   */
  maxFolderDepth?: number;
  /**
   * Folders the finished key may carry, a scope the `normalizeNameFn` adds included.
   *
   * @default `maxFolderDepth`
   */
  maxKeyDepth?: number;
  normalizeNameFn?: (opts: { file: TUploadNaming }) => string;
  normalizeLinkFn?: (opts: IObjectLocation) => string;
}

/** `writeStream`: one object written from a stream, so a large body never lands in this process. */
export interface IWriteStreamOptions extends IObjectLocation {
  source: ReadableStream<Uint8Array> | Blob | Response | Request;
  contentType?: string;
  /**
   * Folder nesting the key may carry, as `upload` takes it.
   *
   * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
   */
  maxFolderDepth?: number;
}

/** `copyObject`: a copy within one bucket. */
export interface ICopyObjectOptions {
  bucket: IBucketRef;
  source: IObjectRef;
  destination: IObjectRef;
  /** Copy only if the source still has this ETag; otherwise `StorageErrors.PRECONDITION_FAILED`. */
  ifMatch?: string;
  /** Copy this exact version of the source. */
  sourceVersionId?: string;
}

/** `presignPost`: the one object a browser form may be posted under, and its size ceiling. */
export interface IPresignPostOptions extends IObjectLocation {
  maxBytes: number;
  contentType?: string;
  expiresIn?: IDuration;
}

/** `presignPut`. Every option is SIGNED - the client must send it back unchanged. */
export interface IPresignPutOptions extends IObjectLocation {
  expiresIn?: IDuration;
  /** The object's tag set, written at the moment it is stored. */
  tagging?: Record<string, string>;
  /** Pins the body to EXACTLY this many bytes. A retry at a different size is refused. */
  contentLength?: number;
  /** Pins the stored content type. Unsigned, the uploader picks what is stored - and the stored type is what a browser later renders. */
  contentType?: string;
}

/** `presignGet`. */
export interface IPresignGetOptions extends IObjectLocation {
  expiresIn?: IDuration;
  responseContentType?: string;
  responseContentDisposition?: string;
}

/** The contract every storage backend (disk, in-memory, S3) implements. Buckets and objects are addressed by `IBucketRef` and `IObjectRef`. */
export interface IStorageHelper {
  /** The backend this helper writes to. The helpers IGNIS ships declare it; a custom helper may leave it out. */
  readonly storageType?: TStorageType;

  isValidSegment(opts: { segment: string }): boolean;
  isValidBucketName(opts: { bucket: IBucketRef }): boolean;
  isValidObjectKey(opts: { object: IObjectRef; maxDepth?: number }): boolean;

  hasBucket(opts: { bucket: IBucketRef }): Promise<boolean>;
  getBuckets(): Promise<IBucketInfo[]>;
  getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  removeBucket(opts: { bucket: IBucketRef }): Promise<boolean>;

  getObject(opts: IObjectLocation & { options?: unknown }): Promise<Readable>;

  /** A web stream, what a `Response` body wants. `range` includes `end`, like the HTTP header. */
  getObjectStream(opts: TObjectStreamOptions): Promise<ReadableStream<Uint8Array>>;
  getStat(opts: IObjectLocation): Promise<IFileStat>;
  listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;

  upload(opts: IUploadOptions): Promise<IUploadResult[]>;

  /**
   * Writes an object from a stream, so a large body never lands in this process. A backend whose
   * transport takes a stream overrides it; the default buffers, which is the thing to avoid.
   */
  writeStream(opts: IWriteStreamOptions): Promise<void>;

  /** Copies within one bucket, server side - the bytes never travel through this process. */
  copyObject(opts: ICopyObjectOptions): Promise<void>;

  removeObject(opts: IObjectLocation): Promise<void>;
  removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void>;

  /**
   * The form a browser posts straight to the storage, good for exactly ONE object: the policy signs
   * `object.key` as it stands, and `formData` carries that key, so the client does not add it.
   * Unlike a presigned PUT, a policy carries `content-length-range`, so "at most N bytes" is
   * expressible - a signed PUT binds the length to one exact value.
   */
  presignPost(opts: IPresignPostOptions): Promise<IPostPolicy>;

  /** A URL a browser may PUT one object to. Every option is SIGNED; a pinned size is exact, never a ceiling - for a ceiling use {@link IStorageHelper.presignPost}. */
  presignPut(opts: IPresignPutOptions): Promise<string>;
  presignGet(opts: IPresignGetOptions): Promise<string>;

  getObjectTags(opts: IObjectLocation): Promise<Record<string, string>>;
  replaceObjectTags(opts: IObjectLocation & { tags: Record<string, string> }): Promise<void>;

  getMediaType(opts: { mimeType: string }): string;
  getMimeType(opts: { filename: string }): string;
}
