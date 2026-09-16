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
  /** @deprecated Use {@link StaticAssetStorageTypes.BUN_S3}, which reaches MinIO over the same S3 API. */
  static readonly MINIO = 'minio';
  static readonly BUN_S3 = 'bun-s3';

  static readonly SCHEME_SET = new Set([this.DISK, this.MINIO, this.BUN_S3]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

export type TStaticAssetStorageType = TConstValue<typeof StaticAssetStorageTypes>;

/** Where a signed policy may write. The final key is never inside it, so content cannot be replaced after the commit. */
export const DEFAULT_PENDING_PREFIX = 'pending/';

/** Reported in the body, never thrown: the bytes are stored, only the row is not. A CODE, because a 200 bypasses the middleware that strips the driver's `detail`/`table`/`constraint`. */
export const META_LINK_CREATE_FAILED = 'META_LINK_CREATE_FAILED';
