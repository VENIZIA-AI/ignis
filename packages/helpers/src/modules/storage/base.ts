import { MimeTypes } from '@/common';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { executePromiseWithLimit } from '@/utilities/promise.utility';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import { Readable } from 'node:stream';
import { IBucketInfo, IFileStat, IStorageHelper, IUploadFile, IUploadResult } from './common';
import { isNotFoundError, StorageConcurrency, StorageErrors } from './common';

export abstract class BaseStorageHelper extends BaseHelper implements IStorageHelper {
  protected static MIME_MAP: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.zip': 'application/zip',
    '.csv': 'text/csv',
    '.xml': 'application/xml',
  };

  constructor(opts: { scope: string; identifier: string }) {
    super(opts);
  }

  getMimeType(opts: { filename: string }): string {
    const ext = path.extname(opts.filename).toLowerCase();
    return BaseStorageHelper.MIME_MAP[ext] || 'application/octet-stream';
  }

  isValidName(opts: { name: string }): boolean {
    const { name } = opts;

    if (typeof name !== 'string') {
      this.logger.for(this.isValidName.name).error('Invalid name provided: %j', name);
      return false;
    }

    if (!name || isEmpty(name)) {
      this.logger.for(this.isValidName.name).error('Empty name provided');
      return false;
    }

    // Prevent path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      this.logger
        .for(this.isValidName.name)
        .error('Name contains invalid path characters: %s', name);
      return false;
    }

    // Prevent hidden files (starting with dot)
    if (name.startsWith('.')) {
      this.logger.for(this.isValidName.name).error('Name cannot start with a dot: %s', name);
      return false;
    }

    // Prevent special shell characters
    const dangerousChars = /[;|&$`<>{}[\]!#]/;
    if (dangerousChars.test(name)) {
      this.logger.for(this.isValidName.name).error('Name contains dangerous characters: %s', name);
      return false;
    }

    // Prevent newlines/carriage returns (header injection)
    if (name.includes('\n') || name.includes('\r') || name.includes('\0')) {
      this.logger
        .for(this.isValidName.name)
        .error('Name contains invalid control characters: %s', name);
      return false;
    }

    // Prevent extremely long names (DoS)
    if (name.length > 255) {
      this.logger
        .for(this.isValidName.name)
        .error('Name is too long (%d characters): %s', name.length, name);
      return false;
    }

    // Prevent empty or whitespace-only names
    if (name.trim().length === 0) {
      this.logger
        .for(this.isValidName.name)
        .error('Name cannot be empty or whitespace only: "%s"', name);
      return false;
    }

    return true;
  }

  static readonly DEFAULT_MAX_FOLDER_DEPTH = 2;

  isValidPath(opts: { path: string; maxDepth?: number }): boolean {
    const { path: pathStr } = opts;
    const maxDepth = opts.maxDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;

    if (typeof pathStr !== 'string' || !pathStr || isEmpty(pathStr)) {
      this.logger.for(this.isValidPath.name).error('Empty or invalid path provided');
      return false;
    }

    // Trim leading/trailing slashes for normalization
    const normalized = pathStr.replace(/^\/+|\/+$/g, '');
    if (!normalized) {
      this.logger.for(this.isValidPath.name).error('Path resolved to empty after trimming slashes');
      return false;
    }

    const segments = normalized.split('/');

    // Reject empty segments (double slashes like "a//b")
    if (segments.some(s => s.length === 0)) {
      this.logger
        .for(this.isValidPath.name)
        .error('Path contains empty segments (double slashes): %s', pathStr);
      return false;
    }

    // Enforce max depth: segments include folders + filename, so depth = segments.length - 1
    const folderDepth = segments.length - 1;
    if (folderDepth > maxDepth) {
      this.logger
        .for(this.isValidPath.name)
        .error(
          'Path exceeds max folder depth (%d): %s (depth: %d)',
          maxDepth,
          pathStr,
          folderDepth,
        );
      return false;
    }

    for (const segment of segments) {
      if (!this.isValidName({ name: segment })) {
        this.logger
          .for(this.isValidPath.name)
          .error('Path segment failed validation: %s (in path: %s)', segment, pathStr);
        return false;
      }
    }

    if (normalized.length > 1024) {
      this.logger
        .for(this.isValidPath.name)
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

  /** Backend specific public URL prefix of an uploaded object; must keep its trailing slash. */
  protected abstract get defaultLinkPrefix(): string;

  /** Backend specific write step; owns its own metadata persistence and error handling. */
  protected abstract writeObject(opts: {
    bucket: string;
    normalizeName: string;
    file: IUploadFile;
  }): Promise<void>;

  protected normalizeObjectName(opts: { originalName: string; folderPath?: string }): string {
    const { originalName, folderPath } = opts;
    const normalizedFileName = originalName.toLowerCase().replace(/ /g, '_');

    if (!folderPath) {
      return normalizedFileName;
    }

    return `${folderPath.toLowerCase().replace(/ /g, '_')}/${normalizedFileName}`;
  }

  protected normalizeObjectLink(opts: { bucketName: string; normalizeName: string }): string {
    const { bucketName, normalizeName } = opts;
    const encodedName = normalizeName
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

    if (!this.isValidName({ name: originalName })) {
      throw getError({ message: '[upload] Invalid original file name' });
    }

    // Honours the CALLER's depth (not the hard default) so a deeper-tree app fails fast here rather than after spooling the whole body; isValidPath measures an OBJECT path (folder + filename, one folder more than a bare folderPath), so folderPath's depth is checked directly instead.
    if (folderPath) {
      const depthLimit = maxFolderDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;
      const folderSegments = folderPath.replace(/^\/+|\/+$/g, '').split('/');

      if (folderSegments.length > depthLimit) {
        throw getError({
          message: `[upload] Invalid folder path | depth: ${folderSegments.length} | max: ${depthLimit}`,
        });
      }

      if (!this.isValidPath({ path: folderPath, maxDepth: depthLimit })) {
        throw getError({ message: '[upload] Invalid folder path' });
      }
    }

    // What is invalid is a missing or negative size, not a zero-byte upload - a bare `!size` also rejected a legitimate EMPTY file.
    if (size === undefined || size === null || size < 0) {
      throw getError({ message: `[upload] Invalid file size | size: ${size}` });
    }
  }

  async upload(opts: {
    bucket: string;
    files: IUploadFile[];
    normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
    normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
    /** Folder nesting the CALLER allows. Omitted -> DEFAULT_MAX_FOLDER_DEPTH. */
    maxFolderDepth?: number;
  }): Promise<IUploadResult[]> {
    const { bucket, files, normalizeNameFn, normalizeLinkFn, maxFolderDepth } = opts;

    if (!files || files.length === 0) {
      return [];
    }

    const isExists = await this.hasBucket({ name: bucket });
    if (!isExists) {
      throw getError({
        message: `[upload] Bucket does not exist | name: ${bucket}`,
      });
    }

    this.validateUploadFiles({ files, maxFolderDepth });

    return this.mapWithConcurrency({
      items: files,
      task: async ({ item: file }) => {
        const { originalName, mimetype: mimeType, size, encoding, folderPath } = file;
        const t = performance.now();

        const normalizeName = normalizeNameFn
          ? normalizeNameFn({ originalName, folderPath })
          : this.normalizeObjectName({ originalName, folderPath });

        // The caller's normalizeNameFn output is what DiskHelper path.join()s under the bucket root - an unvalidated `../../../etc/cron.d/pwn` writes outside it; the original name was validated above, this validates what actually reaches the filesystem.
        if (!this.isValidPath({ path: normalizeName, maxDepth: maxFolderDepth })) {
          throw getError({
            message: `[upload] Invalid normalized object name | name: ${normalizeName}`,
          });
        }

        const normalizeLink = normalizeLinkFn
          ? normalizeLinkFn({ bucketName: bucket, normalizeName })
          : this.normalizeObjectLink({ bucketName: bucket, normalizeName });

        await this.writeObject({ bucket, normalizeName, file });

        this.logger
          .for(this.upload.name)
          .info(
            'Uploaded: %j | Took: %s (ms)',
            { normalizeName, normalizeLink, mimeType, encoding, size },
            performance.now() - t,
          );

        return {
          bucket: { name: bucket },
          object: { key: normalizeName, size, contentType: mimeType },
          link: normalizeLink,
        };
      },
    });
  }

  /**
   * Correct for any backend, and overridden by the ones that can do better: a helper whose transport is
   * already a web stream should return it untouched rather than round trip through a Node `Readable`.
   */
  async getObjectStream(opts: {
    bucket: string;
    name: string;
    range?: { start: number; end?: number };
  }): Promise<ReadableStream<Uint8Array>> {
    const { bucket, name, range } = opts;
    const source = await this.getObject({ bucket, name });

    if (!range) {
      return Readable.toWeb(source) as ReadableStream<Uint8Array>;
    }

    // No native range on this backend: take the requested window off the front of the full stream.
    const { start, end } = range;
    let offset = 0;

    const sliced = new ReadableStream<Uint8Array>({
      async start(controller) {
        for await (const chunk of source) {
          const bytes = chunk as Uint8Array;
          const chunkEnd = offset + bytes.byteLength;
          const from = Math.max(start - offset, 0);
          const to =
            end === undefined ? bytes.byteLength : Math.min(end + 1 - offset, bytes.byteLength);

          if (chunkEnd > start && from < to) {
            controller.enqueue(bytes.subarray(from, to));
          }

          offset = chunkEnd;

          if (end !== undefined && offset > end) {
            break;
          }
        }

        source.destroy();
        controller.close();
      },
    });

    return sliced;
  }

  /**
   * Bounded fan-out over a caller-supplied list, on the repository's one limiter rather than a second
   * implementation of it. An unbounded `Promise.all` here turns a 10,000-key delete into 10,000
   * simultaneous requests, which exhausts sockets locally and gets rate limited at the provider.
   */
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

  /**
   * Turns a backend's own "not there" failure into one catalogued error carrying a 404, and leaves every
   * other failure exactly as it was - a storage outage must never be reported as a missing object.
   */
  protected asStorageError(opts: {
    error: unknown;
    operation: string;
    bucket: string;
    name: string;
  }): unknown {
    const { error, operation, bucket, name } = opts;

    if (!isNotFoundError({ error })) {
      return error;
    }

    return getError({
      error: StorageErrors.OBJECT_NOT_FOUND,
      message: `[${operation}] Object not found | bucket: ${bucket} | name: ${name}`,
    });
  }

  // A backend with no presign/tagging transport says so - returning undefined would read as a valid, empty link or tag set.
  async presignPut(_opts: {
    bucket: string;
    name: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    throw getError({
      message: `[${this.constructor.name}.presignPut] Presigned PUT URLs are not supported by this helper`,
    });
  }

  async presignGet(_opts: {
    bucket: string;
    name: string;
    expiresInSeconds?: number;
    responseContentType?: string;
  }): Promise<string> {
    throw getError({
      message: `[${this.constructor.name}.presignGet] Presigned GET URLs are not supported by this helper`,
    });
  }

  async getObjectTags(_opts: { bucket: string; name: string }): Promise<Record<string, string>> {
    throw getError({
      message: `[${this.constructor.name}.getObjectTags] Object tagging is not supported by this helper`,
    });
  }

  async replaceObjectTags(_opts: {
    bucket: string;
    name: string;
    tags: Record<string, string>;
  }): Promise<void> {
    throw getError({
      message: `[${this.constructor.name}.replaceObjectTags] Object tagging is not supported by this helper`,
    });
  }

  abstract hasBucket(opts: { name: string }): Promise<boolean>;
  abstract getBuckets(): Promise<IBucketInfo[]>;
  abstract getBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  abstract createBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  abstract removeBucket(opts: { name: string }): Promise<boolean>;

  abstract getObject(opts: { bucket: string; name: string; options?: any }): Promise<Readable>;
  abstract getStat(opts: { bucket: string; name: string }): Promise<IFileStat>;
  abstract removeObject(opts: { bucket: string; name: string }): Promise<void>;
  abstract removeObjects(opts: { bucket: string; names: string[] }): Promise<void>;
  abstract listObjects(opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<import('./common').IObjectInfo[]>;
}
