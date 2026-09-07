import type { TConstValue } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';

/** `content-type` is absent on purpose: it is decided from the object name, never from the backend. */
export const WHITELIST_HEADERS = [
  HTTP.Headers.CONTENT_ENCODING,
  HTTP.Headers.CACHE_CONTROL,
  HTTP.Headers.ETAG,
  HTTP.Headers.LAST_MODIFIED,
] as const;

/**
 * Types the controller will let a browser render, keyed off the object name. Anything absent here is
 * served as an attachment, because a renderable upload on the API origin is stored XSS - and `nosniff`
 * cannot stop a type we declared ourselves. `image/svg+xml` is deliberately excluded: SVG carries script.
 */
export const RENDERABLE_CONTENT_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'application/pdf',
  'text/plain',
  'text/csv',
]);

export class StaticAssetStorageTypes {
  static readonly DISK = 'disk';
  static readonly BUN_S3 = 'bun-s3';

  static readonly SCHEME_SET = new Set([this.DISK, this.BUN_S3]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

export type TStaticAssetStorageType = TConstValue<typeof StaticAssetStorageTypes>;
