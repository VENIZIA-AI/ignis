import { MimeTypes } from '@/common';
import { BaseHelper } from '@/helpers/base';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import { Readable } from 'node:stream';
import { IBucketInfo, IFileStat, IStorageHelper, IUploadFile, IUploadResult } from './types';

// -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    return BaseStorageHelper.MIME_MAP[ext] || 'application/octet-stream';
  }

  // -------------------------------------------------------------------------
  isValidName(name: string): boolean {
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
