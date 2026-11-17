import { ObjectUtility } from '@venizia/ignis-inversion';
import { ContentTypeTable, MimeTypes } from '@/common';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { EchoUtility } from '@/utilities/echo.utility';
import { PromiseUtility } from '@/utilities/promise.utility';
import type { Readable } from 'node:stream';
import {
  type IBucketInfo,
  type IBucketRef,
  type IFileStat,
  type IListObjectsOptions,
  type IObjectInfo,
  type IObjectLocation,
  type IPostPolicy,
  type IObjectRef,
  type IStorageHelper,
  type IStorageReadCondition,
  type ICopyObjectOptions,
  type IPresignGetOptions,
  type IPresignPostOptions,
  type IPresignPutOptions,
  type IUploadOptions,
  type IWriteStreamOptions,
  type TObjectStreamOptions,
  type IUploadFile,
  type IUploadResult,
  type TUploadNaming,
} from './common';
import { StorageUtility, StorageConcurrency, StorageErrors, StorageLimits } from './common';

/** Shared base for storage helpers: MIME lookup, name and path validation, and upload naming. Concrete helpers implement the backend calls. */
export abstract class BaseStorageHelper extends BaseHelper implements IStorageHelper {
  constructor(opts: { scope: string; identifier: string }) {
    super(opts);
  }

  getMimeType(opts: { filename: string }): string {
    return ContentTypeTable.resolve(opts);
  }

  static readonly DEFAULT_MAX_FOLDER_DEPTH = 2;

  private static readonly UTF8 = new TextEncoder();

  private static readonly DANGEROUS_NAME_CHARACTERS = /[;|&$`<>{}[\]!#]/;

  /** Control characters, lone surrogates, the line and paragraph separators (U+2028, U+2029) and the bidirectional marks and overrides: never part of a file name or a key (the overrides make `gpj.exe` display as `exe.jpg`), and a control character or a surrogate cannot be encoded into a header. */
  private static readonly UNSAFE_NAME_CHARACTERS =
    /[\p{Cc}\p{Cs}\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;

  /** Every way a segment can be refused, first match wins. */
  private static readonly SEGMENT_RULES: Array<{
    reason: string;
    isViolated: (name: string) => boolean;
  }> = [
    { reason: 'Name is empty or whitespace only', isViolated: (name) => name.trim().length === 0 },
    {
      reason: 'Name contains invalid path characters',
      isViolated: (name) => name.includes('..') || name.includes('/') || name.includes('\\'),
    },
    { reason: 'Name cannot start with a dot', isViolated: (name) => name.startsWith('.') },
    {
      reason: 'Name contains dangerous characters',
      isViolated: (name) => BaseStorageHelper.DANGEROUS_NAME_CHARACTERS.test(name),
    },
    {
      reason: 'Name contains a control or bidirectional character',
      isViolated: (name) => BaseStorageHelper.UNSAFE_NAME_CHARACTERS.test(name),
    },
    {
      reason: `Name is longer than ${StorageLimits.MAX_SEGMENT_BYTES} bytes`,
      isViolated: (name) =>
        BaseStorageHelper.UTF8.encode(name).byteLength > StorageLimits.MAX_SEGMENT_BYTES,
    },
  ];

  /** One path segment or file name: at most 255 UTF-8 bytes, no separator, no traversal, no control or shell character. */
  isValidSegment(opts: { segment: string }): boolean {
    const name = opts.segment;

    const reason =
      typeof name === 'string'
        ? BaseStorageHelper.SEGMENT_RULES.find((rule) => rule.isViolated(name))?.reason
        : 'Name is not a string';

    if (reason === undefined) {
      return true;
    }

    this.logger
      .for(this.isValidSegment.name)
      .error('%s | name: %s', reason, EchoUtility.toSafeEcho({ value: name }));

    return false;
  }

  /** A bucket name is one segment; a separator in it would silently address a different bucket. */
  isValidBucketName(opts: { bucket: IBucketRef }): boolean {
    return this.isValidSegment({ segment: opts.bucket.name });
  }

  /** A whole object key: every segment valid, no trailing `/`, and no deeper than `maxDepth` folders. */
  isValidObjectKey(opts: { object: IObjectRef; maxDepth?: number }): boolean {
    const { key } = opts.object;

    if (typeof key === 'string' && key.endsWith('/')) {
      this.logger
        .for(this.isValidObjectKey.name)
        .error('Object key ends with a slash: %s', EchoUtility.toSafeEcho({ value: key }));

      return false;
    }

    return this.isValidKeyPath({ path: key, maxDepth: opts.maxDepth });
  }

  /** The shared rule behind `isValidObjectKey` and the folder check inside `upload`. */
  protected isValidKeyPath(opts: { path: string; maxDepth?: number }): boolean {
    const { path: pathStr } = opts;
    const maxDepth = opts.maxDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;

    if (typeof pathStr !== 'string' || !pathStr || ObjectUtility.isEmpty({ value: pathStr })) {
      this.logger.for(this.isValidKeyPath.name).error('Empty or invalid path provided');

      return false;
    }

    const normalized = pathStr.replace(/^\/+|\/+$/g, '');

    if (!normalized) {
      this.logger
        .for(this.isValidKeyPath.name)
        .error('Path resolved to empty after trimming slashes');

      return false;
    }

    const segments = normalized.split('/');

    if (segments.some((s) => s.length === 0)) {
      this.logger
        .for(this.isValidKeyPath.name)
        .error(
          'Path contains empty segments (double slashes): %s',
          EchoUtility.toSafeEcho({ value: pathStr }),
        );

      return false;
    }

    // segments include the filename, so depth is one less.
    const folderDepth = segments.length - 1;

    if (folderDepth > maxDepth) {
      this.logger
        .for(this.isValidKeyPath.name)
        .error(
          'Path exceeds max folder depth (%d): %s (depth: %d)',
          maxDepth,
          EchoUtility.toSafeEcho({ value: pathStr }),
          folderDepth,
        );

      return false;
    }

    for (const segment of segments) {
      if (!this.isValidSegment({ segment })) {
        this.logger
          .for(this.isValidKeyPath.name)
          .error(
            'Path segment failed validation: %s (in path: %s)',
            EchoUtility.toSafeEcho({ value: segment }),
            EchoUtility.toSafeEcho({ value: pathStr }),
          );

        return false;
      }
    }

    const byteLength = BaseStorageHelper.UTF8.encode(normalized).byteLength;

    if (byteLength > StorageLimits.MAX_KEY_BYTES) {
      this.logger
        .for(this.isValidKeyPath.name)
        .error(
          'Path is too long (%d bytes): %s',
          byteLength,
          EchoUtility.toSafeEcho({ value: pathStr }),
        );

      return false;
    }

    return true;
  }

  getMediaType(opts: { mimeType: string }): string {
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

  /** Public URL prefix; keeps its trailing slash. */
  protected abstract get defaultLinkPrefix(): string;

  /** Backend write step; owns its metadata and error handling. */
  protected abstract writeObject(opts: IObjectLocation & { file: IUploadFile }): Promise<void>;

  /** The key `upload` writes when no naming hook is given: lowercase, spaces become `_`, under the folder when there is one. Public so a naming hook can start from the very key the helper would have written. */
  static normalizeObjectName(opts: { file: TUploadNaming }): string {
    const { originalName, folderPath } = opts.file;
    const normalizedFileName = originalName.toLowerCase().replace(/ /g, '_');

    if (!folderPath) {
      return normalizedFileName;
    }

    return `${folderPath.toLowerCase().replace(/ /g, '_')}/${normalizedFileName}`;
  }

  protected normalizeObjectLink(opts: IObjectLocation): string {
    const bucketName = opts.bucket.name;
    const encodedName = opts.object.key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${this.defaultLinkPrefix}${bucketName}/${encodedName}`;
  }

  /** An original name that is only metadata - the key is resolved elsewhere and validated on its own. */
  protected isValidOriginalName(opts: { name: string }): boolean {
    const { name } = opts;

    if (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      name.length > StorageLimits.MAX_SEGMENT_BYTES
    ) {
      this.logger
        .for(this.isValidOriginalName.name)
        .error('Invalid original name: %s', EchoUtility.toSafeEcho({ value: name }));

      return false;
    }

    if (BaseStorageHelper.UNSAFE_NAME_CHARACTERS.test(name)) {
      this.logger
        .for(this.isValidOriginalName.name)
        .error(
          'Original name contains a control character or a lone surrogate: %s',
          EchoUtility.toSafeEcho({ value: name }),
        );

      return false;
    }

    return true;
  }

  /** `isKeyResolvedByCaller`: a `normalizeNameFn` decides the key, so the original name is metadata and meets the metadata rule, not the key rule. */
  protected validateUploadFiles(opts: {
    files: IUploadFile[];
    maxFolderDepth?: number;
    isKeyResolvedByCaller?: boolean;
  }): void {
    const { files, maxFolderDepth, isKeyResolvedByCaller = false } = opts;

    for (const file of files) {
      this.validateUploadFile({ file, maxFolderDepth, isKeyResolvedByCaller });
    }
  }

  private validateUploadFile(opts: {
    file: IUploadFile;
    maxFolderDepth?: number;
    isKeyResolvedByCaller: boolean;
  }): void {
    const { file, maxFolderDepth, isKeyResolvedByCaller } = opts;
    const { originalName, size, folderPath } = file;

    const isNameValid = isKeyResolvedByCaller
      ? this.isValidOriginalName({ name: originalName })
      : this.isValidSegment({ segment: originalName });

    if (!isNameValid) {
      throw getError({ message: '[upload] Invalid original file name' });
    }

    // Checked against the CALLER's depth, before the body is spooled. `isValidKeyPath` measures an
    // object path (one folder deeper than a bare folderPath), so the depth is checked directly.
    if (folderPath) {
      const depthLimit = maxFolderDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;
      const folderSegments = folderPath.replace(/^\/+|\/+$/g, '').split('/');

      if (folderSegments.length > depthLimit) {
        throw getError({
          error: StorageErrors.FOLDER_DEPTH_EXCEEDED,
          message: `[upload] Invalid folder path | depth: ${folderSegments.length} | max: ${depthLimit}`,
        });
      }

      if (!this.isValidKeyPath({ path: folderPath, maxDepth: depthLimit })) {
        throw getError({
          error: StorageErrors.FOLDER_PATH_INVALID,
          message: '[upload] Invalid folder path',
        });
      }
    }

    // Missing or negative is invalid; zero is a legitimate empty file.
    if (size === undefined || size === null || size < 0) {
      throw getError({ message: `[upload] Invalid file size | size: ${size}` });
    }
  }

  async upload(opts: IUploadOptions): Promise<IUploadResult[]> {
    const { bucket, files, normalizeNameFn, normalizeLinkFn, maxFolderDepth } = opts;
    const maxKeyDepth = opts.maxKeyDepth ?? maxFolderDepth;

    if (!files || files.length === 0) {
      return [];
    }

    const isExists = await this.hasBucket({ bucket });

    if (!isExists) {
      throw getError({
        message: `[upload] Bucket does not exist | name: ${EchoUtility.toSafeText({ value: bucket.name })}`,
      });
    }

    this.validateUploadFiles({
      files,
      maxFolderDepth,
      isKeyResolvedByCaller: normalizeNameFn !== undefined,
    });

    // Every key is resolved and validated before the first write, so one bad key stores nothing.
    const keys = files.map((file) => {
      const naming: TUploadNaming = {
        originalName: file.originalName,
        folderPath: file.folderPath,
      };
      const key = normalizeNameFn
        ? normalizeNameFn({ file: naming })
        : BaseStorageHelper.normalizeObjectName({ file: naming });

      if (!this.isValidObjectKey({ object: { key }, maxDepth: maxKeyDepth })) {
        throw getError({
          message: `[upload] Invalid normalized object name | name: ${EchoUtility.toSafeText({ value: key })}`,
        });
      }

      return key;
    });

    return this.mapWithConcurrency({
      items: files,
      task: async ({ item: file, index }) => {
        const { mimetype: mimeType, size, encoding } = file;
        const t = performance.now();
        const key = keys[index];

        const object: IObjectRef = { key };
        const link = normalizeLinkFn
          ? normalizeLinkFn({ bucket, object })
          : this.normalizeObjectLink({ bucket, object });

        await this.writeObject({ bucket, object, file });

        this.logger
          .for(this.upload.name)
          .info(
            'Uploaded: %s | Took: %s (ms)',
            EchoUtility.toSafeEcho({ value: { key, link, mimeType, encoding, size } }),
            performance.now() - t,
          );

        return {
          bucket: { name: bucket.name },
          object: { key, size, contentType: mimeType },
          link,
        };
      },
    });
  }

  async getObjectStream(_opts: TObjectStreamOptions): Promise<ReadableStream<Uint8Array>> {
    throw this.unsupported({ operation: 'getObjectStream', feature: 'Streaming a read' });
  }

  /**
   * Correct anywhere, and the wrong path to stay on: it buffers, so a backend whose transport takes
   * a stream overrides it. `BunS3Helper` does.
   */
  async writeStream(opts: IWriteStreamOptions): Promise<void> {
    const { bucket, object, source, contentType } = opts;

    // The same depth rule `upload` applies, as `BunS3Helper.writeStream` does: one object, two doors, one answer.
    if (!this.isValidObjectKey({ object, maxDepth: opts.maxFolderDepth })) {
      throw getError({
        message: `[writeStream] Invalid object name | key: ${EchoUtility.toSafeText({ value: object.key })}`,
      });
    }

    if (!this.isValidBucketName({ bucket })) {
      throw getError({
        message: `[storage] Invalid bucket name | bucket: ${EchoUtility.toSafeText({ value: bucket.name })}`,
      });
    }

    // As `upload` does: a write never creates the bucket.
    const isExists = await this.hasBucket({ bucket });

    if (!isExists) {
      throw getError({
        message: `[writeStream] Bucket does not exist | name: ${EchoUtility.toSafeText({ value: bucket.name })}`,
      });
    }

    const body =
      source instanceof Response || source instanceof Request ? source : new Response(source);
    const result = await body.arrayBuffer();
    const buffer = Buffer.from(result);

    await this.writeObject({
      bucket,
      object,
      file: {
        originalName: object.key,
        mimetype: contentType ?? this.getMimeType({ filename: object.key }),
        buffer,
        size: buffer.length,
      },
    });
  }

  /** Bounded fan-out on the shared limiter; unbounded exhausts sockets and gets rate limited. */
  protected async mapWithConcurrency<Item, Result>(opts: {
    items: Item[];
    limit?: number;
    task: (taskOptions: { item: Item; index: number }) => Promise<Result>;
  }): Promise<Result[]> {
    const { items, task } = opts;

    if (items.length === 0) {
      return [];
    }

    return PromiseUtility.executeWithLimit({
      limit: Math.max(1, opts.limit ?? StorageConcurrency.DEFAULT_LIMIT),
      tasks: items.map((item, index) => () => task({ item, index })),
    });
  }

  /** A "not there" failure becomes a catalogued 404; every other failure passes through unchanged. */
  protected asStorageError(opts: IObjectLocation & { error: unknown; operation: string }): unknown {
    const { error, operation, bucket, object } = opts;

    if (!StorageUtility.isNotFoundError({ error })) {
      return error;
    }

    return getError({
      error: StorageErrors.OBJECT_NOT_FOUND,
      message: `[${operation}] Object not found | bucket: ${EchoUtility.toSafeText({ value: bucket.name })} | key: ${EchoUtility.toSafeText({ value: object.key })}`,
    });
  }

  /** For a backend with no ETag or versions to condition a read on: refusing is honest, ignoring would read unpinned. */
  protected refuseReadCondition(opts: { condition: IStorageReadCondition; operation: string }) {
    if (opts.condition.ifMatch !== undefined || opts.condition.versionId !== undefined) {
      throw this.unsupported({
        operation: opts.operation,
        feature: 'A conditional read (ifMatch, versionId)',
      });
    }
  }

  /** The error of an operation this helper has no transport for: throwing beats returning undefined, which reads as a valid empty result. */
  private unsupported(opts: { operation: string; feature: string }) {
    return getError({
      message: `[${this.constructor.name}.${opts.operation}] ${opts.feature} is not supported by this helper`,
    });
  }

  async copyObject(_opts: ICopyObjectOptions): Promise<void> {
    throw this.unsupported({ operation: 'copyObject', feature: 'Server-side copy' });
  }

  async presignPost(_opts: IPresignPostOptions): Promise<IPostPolicy> {
    throw this.unsupported({ operation: 'presignPost', feature: 'Signed POST policies' });
  }

  async presignPut(_opts: IPresignPutOptions): Promise<string> {
    throw this.unsupported({ operation: 'presignPut', feature: 'Presigned PUT URLs' });
  }

  async presignGet(_opts: IPresignGetOptions): Promise<string> {
    throw this.unsupported({ operation: 'presignGet', feature: 'Presigned GET URLs' });
  }

  async getObjectTags(_opts: IObjectLocation): Promise<Record<string, string>> {
    throw this.unsupported({ operation: 'getObjectTags', feature: 'Object tagging' });
  }

  async replaceObjectTags(
    _opts: IObjectLocation & { tags: Record<string, string> },
  ): Promise<void> {
    throw this.unsupported({ operation: 'replaceObjectTags', feature: 'Object tagging' });
  }

  abstract hasBucket(opts: { bucket: IBucketRef }): Promise<boolean>;
  abstract getBuckets(): Promise<IBucketInfo[]>;
  abstract getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  abstract createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  abstract removeBucket(opts: { bucket: IBucketRef }): Promise<boolean>;

  abstract getObject(opts: IObjectLocation & { options?: unknown }): Promise<Readable>;
  abstract getStat(opts: IObjectLocation): Promise<IFileStat>;
  abstract removeObject(opts: IObjectLocation): Promise<void>;
  abstract removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void>;
  abstract listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;
}
