import { ContentTypeTable, IDuration, MimeTypes } from '@/common';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { executePromiseWithLimit } from '@/utilities/promise.utility';
import isEmpty from 'lodash/isEmpty';
import { Readable } from 'node:stream';
import {
  IBucketInfo,
  IBucketRef,
  IFileStat,
  IListObjectsOptions,
  IObjectInfo,
  IObjectLocation,
  IObjectRef,
  IStorageHelper,
  IUploadFile,
  IUploadResult,
  TUploadNaming,
} from './common';
import { isNotFoundError, StorageConcurrency, StorageErrors } from './common';

export abstract class BaseStorageHelper extends BaseHelper implements IStorageHelper {
  constructor(opts: { scope: string; identifier: string }) {
    super(opts);
  }

  getMimeType(opts: { filename: string }): string {
    return ContentTypeTable.resolve(opts);
  }

  /** One path segment or file name: no separator, no traversal, no control or shell character. */
  isValidSegment(opts: { segment: string }): boolean {
    const name = opts.segment;

    if (typeof name !== 'string') {
      this.logger.for(this.isValidSegment.name).error('Invalid name provided: %j', name);
      return false;
    }

    if (!name || isEmpty(name)) {
      this.logger.for(this.isValidSegment.name).error('Empty name provided');
      return false;
    }

    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      this.logger
        .for(this.isValidSegment.name)
        .error('Name contains invalid path characters: %s', name);
      return false;
    }

    if (name.startsWith('.')) {
      this.logger.for(this.isValidSegment.name).error('Name cannot start with a dot: %s', name);
      return false;
    }

    const dangerousChars = /[;|&$`<>{}[\]!#]/;
    if (dangerousChars.test(name)) {
      this.logger
        .for(this.isValidSegment.name)
        .error('Name contains dangerous characters: %s', name);
      return false;
    }

    if (name.includes('\n') || name.includes('\r') || name.includes('\0')) {
      this.logger
        .for(this.isValidSegment.name)
        .error('Name contains invalid control characters: %s', name);
      return false;
    }

    if (name.length > 255) {
      this.logger
        .for(this.isValidSegment.name)
        .error('Name is too long (%d characters): %s', name.length, name);
      return false;
    }

    if (name.trim().length === 0) {
      this.logger
        .for(this.isValidSegment.name)
        .error('Name cannot be empty or whitespace only: "%s"', name);
      return false;
    }

    return true;
  }

  static readonly DEFAULT_MAX_FOLDER_DEPTH = 2;

  /** A bucket name is one segment; a separator in it would silently address a different bucket. */
  isValidBucketName(opts: { bucket: IBucketRef }): boolean {
    return this.isValidSegment({ segment: opts.bucket.name });
  }

  /** A whole object key: every segment valid, and no deeper than `maxDepth` folders. */
  isValidObjectKey(opts: { object: IObjectRef; maxDepth?: number }): boolean {
    return this.isValidKeyPath({ path: opts.object.key, maxDepth: opts.maxDepth });
  }

  /** The shared rule behind `isValidObjectKey` and the folder check inside `upload`. */
  protected isValidKeyPath(opts: { path: string; maxDepth?: number }): boolean {
    const { path: pathStr } = opts;
    const maxDepth = opts.maxDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;

    if (typeof pathStr !== 'string' || !pathStr || isEmpty(pathStr)) {
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

    if (segments.some(s => s.length === 0)) {
      this.logger
        .for(this.isValidKeyPath.name)
        .error('Path contains empty segments (double slashes): %s', pathStr);
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
          pathStr,
          folderDepth,
        );
      return false;
    }

    for (const segment of segments) {
      if (!this.isValidSegment({ segment })) {
        this.logger
          .for(this.isValidKeyPath.name)
          .error('Path segment failed validation: %s (in path: %s)', segment, pathStr);
        return false;
      }
    }

    if (normalized.length > 1024) {
      this.logger
        .for(this.isValidKeyPath.name)
        .error('Path is too long (%d characters): %s', normalized.length, pathStr);
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

  protected normalizeObjectName(opts: { file: TUploadNaming }): string {
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
      .map(segment => encodeURIComponent(segment))
      .join('/');

    return `${this.defaultLinkPrefix}${bucketName}/${encodedName}`;
  }

  protected validateUploadFiles(opts: { files: IUploadFile[]; maxFolderDepth?: number }): void {
    const { files, maxFolderDepth } = opts;

    for (const file of files) {
      this.validateUploadFile({ file, maxFolderDepth });
    }
  }

  private validateUploadFile(opts: { file: IUploadFile; maxFolderDepth?: number }): void {
    const { file, maxFolderDepth } = opts;
    const { originalName, size, folderPath } = file;

    if (!this.isValidSegment({ segment: originalName })) {
      throw getError({ message: '[upload] Invalid original file name' });
    }

    // Checked against the CALLER's depth, before the body is spooled. `isValidKeyPath` measures an
    // object path (one folder deeper than a bare folderPath), so the depth is checked directly.
    if (folderPath) {
      const depthLimit = maxFolderDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;
      const folderSegments = folderPath.replace(/^\/+|\/+$/g, '').split('/');

      if (folderSegments.length > depthLimit) {
        throw getError({
          message: `[upload] Invalid folder path | depth: ${folderSegments.length} | max: ${depthLimit}`,
        });
      }

      if (!this.isValidKeyPath({ path: folderPath, maxDepth: depthLimit })) {
        throw getError({ message: '[upload] Invalid folder path' });
      }
    }

    // Missing or negative is invalid; zero is a legitimate empty file.
    if (size === undefined || size === null || size < 0) {
      throw getError({ message: `[upload] Invalid file size | size: ${size}` });
    }
  }

  async upload(opts: {
    bucket: IBucketRef;
    files: IUploadFile[];
    normalizeNameFn?: (opts: { file: TUploadNaming }) => string;
    normalizeLinkFn?: (opts: IObjectLocation) => string;
    /** Folder nesting allowed. Omitted -> DEFAULT_MAX_FOLDER_DEPTH. */
    maxFolderDepth?: number;
  }): Promise<IUploadResult[]> {
    const { bucket, files, normalizeNameFn, normalizeLinkFn, maxFolderDepth } = opts;

    if (!files || files.length === 0) {
      return [];
    }

    const isExists = await this.hasBucket({ bucket });
    if (!isExists) {
      throw getError({
        message: `[upload] Bucket does not exist | name: ${bucket.name}`,
      });
    }

    this.validateUploadFiles({ files, maxFolderDepth });

    return this.mapWithConcurrency({
      items: files,
      task: async ({ item: file }) => {
        const { originalName, mimetype: mimeType, size, encoding, folderPath } = file;
        const t = performance.now();

        const naming: TUploadNaming = { originalName, folderPath };
        const key = normalizeNameFn
          ? normalizeNameFn({ file: naming })
          : this.normalizeObjectName({ file: naming });

        // `normalizeNameFn` output is what reaches the filesystem; the original name was validated
        // above, this validates what a caller's own normalizer produced.
        if (!this.isValidObjectKey({ object: { key }, maxDepth: maxFolderDepth })) {
          throw getError({
            message: `[upload] Invalid normalized object name | name: ${key}`,
          });
        }

        const object: IObjectRef = { key };
        const link = normalizeLinkFn
          ? normalizeLinkFn({ bucket, object })
          : this.normalizeObjectLink({ bucket, object });

        await this.writeObject({ bucket, object, file });

        this.logger
          .for(this.upload.name)
          .info(
            'Uploaded: %j | Took: %s (ms)',
            { key, link, mimeType, encoding, size },
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

  /** Correct anywhere; overridden by a backend whose transport is already a web stream. */
  async getObjectStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } },
  ): Promise<ReadableStream<Uint8Array>> {
    const { bucket, object, range } = opts;
    const source = await this.getObject({ bucket, object });

    if (!range) {
      return Readable.toWeb(source) as ReadableStream<Uint8Array>;
    }

    // No native range here: take the window off the front of the full stream. `pull` rather than
    // `start`, so one chunk is read per demand instead of the whole range landing in memory.
    const { start, end } = range;
    const chunks = source[Symbol.asyncIterator]();
    let offset = 0;

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        while (true) {
          const next = await chunks.next();

          if (next.done) {
            controller.close();
            return;
          }

          const bytes = next.value as Uint8Array;
          const chunkEnd = offset + bytes.byteLength;
          const from = Math.max(start - offset, 0);
          const to =
            end === undefined ? bytes.byteLength : Math.min(end + 1 - offset, bytes.byteLength);
          const isWanted = chunkEnd > start && from < to;

          if (isWanted) {
            controller.enqueue(bytes.subarray(from, to));
          }

          offset = chunkEnd;

          if (end !== undefined && offset > end) {
            source.destroy();
            controller.close();
            return;
          }

          if (isWanted) {
            return;
          }
        }
      },

      // Without this a client that aborts leaves the backend stream draining to nowhere.
      cancel() {
        source.destroy();
      },
    });
  }

  /**
   * Correct anywhere, and the wrong path to stay on: it buffers, so a backend whose transport takes
   * a stream overrides it. `BunS3Helper` does.
   */
  async writeStream(
    opts: IObjectLocation & {
      source: ReadableStream<Uint8Array> | Blob | Response | Request;
      contentType?: string;
      maxFolderDepth?: number;
    },
  ): Promise<void> {
    const { bucket, object, source, contentType } = opts;
    const body =
      source instanceof Response || source instanceof Request ? source : new Response(source);
    const buffer = Buffer.from(await body.arrayBuffer());

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

    return executePromiseWithLimit({
      limit: Math.max(1, opts.limit ?? StorageConcurrency.DEFAULT_LIMIT),
      tasks: items.map((item, index) => () => task({ item, index })),
    });
  }

  /** A "not there" failure becomes a catalogued 404; every other failure passes through unchanged. */
  protected asStorageError(opts: IObjectLocation & { error: unknown; operation: string }): unknown {
    const { error, operation, bucket, object } = opts;

    if (!isNotFoundError({ error })) {
      return error;
    }

    return getError({
      error: StorageErrors.OBJECT_NOT_FOUND,
      message: `[${operation}] Object not found | bucket: ${bucket.name} | key: ${object.key}`,
    });
  }

  // No transport for these: throwing beats returning undefined, which reads as a valid empty result.
  async presignPut(_opts: IObjectLocation & { expiresIn?: IDuration }): Promise<string> {
    throw getError({
      message: `[${this.constructor.name}.presignPut] Presigned PUT URLs are not supported by this helper`,
    });
  }

  async presignGet(
    _opts: IObjectLocation & { expiresIn?: IDuration; responseContentType?: string },
  ): Promise<string> {
    throw getError({
      message: `[${this.constructor.name}.presignGet] Presigned GET URLs are not supported by this helper`,
    });
  }

  async getObjectTags(_opts: IObjectLocation): Promise<Record<string, string>> {
    throw getError({
      message: `[${this.constructor.name}.getObjectTags] Object tagging is not supported by this helper`,
    });
  }

  async replaceObjectTags(
    _opts: IObjectLocation & { tags: Record<string, string> },
  ): Promise<void> {
    throw getError({
      message: `[${this.constructor.name}.replaceObjectTags] Object tagging is not supported by this helper`,
    });
  }

  abstract hasBucket(opts: { bucket: IBucketRef }): Promise<boolean>;
  abstract getBuckets(): Promise<IBucketInfo[]>;
  abstract getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  abstract createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  abstract removeBucket(opts: { bucket: IBucketRef }): Promise<boolean>;

  abstract getObject(opts: IObjectLocation & { options?: any }): Promise<Readable>;
  abstract getStat(opts: IObjectLocation): Promise<IFileStat>;
  abstract removeObject(opts: IObjectLocation): Promise<void>;
  abstract removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void>;
  abstract listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;
}
