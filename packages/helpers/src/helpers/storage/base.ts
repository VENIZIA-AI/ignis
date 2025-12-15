import { MimeTypes } from '@/common';
import { BaseHelper } from '@/helpers/base';
import isEmpty from 'lodash/isEmpty';
import { Readable } from 'node:stream';
import { IBucketInfo, IFileStat, IStorageHelper, IUploadFile, IUploadResult } from './types';

// -------------------------------------------------------------------------
export abstract class BaseStorageHelper extends BaseHelper implements IStorageHelper {
  constructor(opts: { scope: string; identifier: string }) {
    super(opts);
  }

  // -------------------------------------------------------------------------
  isValidName(name: string): boolean {
    if (typeof name !== 'string') {
      this.logger.error('[isValidName] Invalid name provided: %j', name);
      return false;
    }

    if (!name || isEmpty(name)) {
      this.logger.error('[isValidName] Empty name provided');
      return false;
    }

    // Prevent path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      this.logger.error('[isValidName] Name contains invalid path characters: %s', name);
      return false;
    }

    // Prevent hidden files (starting with dot)
    if (name.startsWith('.')) {
      this.logger.error('[isValidName] Name cannot start with a dot: %s', name);
      return false;
    }

    // Prevent special shell characters
    const dangerousChars = /[;|&$`<>{}[\]!#]/;
    if (dangerousChars.test(name)) {
      this.logger.error('[isValidName] Name contains dangerous characters: %s', name);
      return false;
    }

    // Prevent newlines/carriage returns (header injection)
    if (name.includes('\n') || name.includes('\r') || name.includes('\0')) {
      this.logger.error('[isValidName] Name contains invalid control characters: %s', name);
      return false;
    }

    // Prevent extremely long names (DoS)
    if (name.length > 255) {
      this.logger.error('[isValidName] Name is too long (%d characters): %s', name.length, name);
      return false;
    }

    // Prevent empty or whitespace-only names
    if (name.trim().length === 0) {
      this.logger.error('[isValidName] Name cannot be empty or whitespace only: "%s"', name);
      return false;
    }

    return true;
  }

  // -------------------------------------------------------------------------
  getFileType(opts: { mimeType: string }): string {
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

  // -------------------------------------------------------------------------
  abstract isBucketExists(opts: { name: string }): Promise<boolean>;
  abstract getBuckets(): Promise<IBucketInfo[]>;
  abstract getBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  abstract createBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  abstract removeBucket(opts: { name: string }): Promise<boolean>;

  abstract upload(opts: {
    bucket: string;
    files: IUploadFile[];
    normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
    normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  }): Promise<IUploadResult[]>;

  abstract getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable>;
  abstract getStat(opts: { bucket: string; name: string }): Promise<IFileStat>;
  abstract removeObject(opts: { bucket: string; name: string }): Promise<void>;
  abstract removeObjects(opts: { bucket: string; names: string[] }): Promise<void>;
  abstract listObjects(opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<import('./types').IObjectInfo[]>;
}
