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

/** Storage backends a static asset controller can serve from. `isValid` checks a string against them. */
export class StaticAssetStorageTypes {
  static readonly DISK = 'disk';
  static readonly BUN_S3 = 'bun-s3';

  static readonly SCHEME_SET = new Set([this.DISK, this.BUN_S3]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

/** One of the `StaticAssetStorageTypes` values. */
export type TStaticAssetStorageType = TConstValue<typeof StaticAssetStorageTypes>;

/** What `recreate-metalink` did: refreshed the rows of an object, or created its first one. */
export class MetaLinkRecreateActions {
  static readonly CREATED = 'created';
  static readonly REFRESHED = 'refreshed';

  static readonly SCHEME_SET = new Set([this.CREATED, this.REFRESHED]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** One of the `MetaLinkRecreateActions` values. */
export type TMetaLinkRecreateAction = TConstValue<typeof MetaLinkRecreateActions>;

/** The failures of the presigned-URL proxy itself that `proxy.errorResponse` is offered. */
export class AssetProxyFailures {
  static readonly PATH_REFUSED = 'PATH_REFUSED';
  static readonly UPSTREAM_FAILED = 'UPSTREAM_FAILED';

  static readonly SCHEME_SET = new Set([this.PATH_REFUSED, this.UPSTREAM_FAILED]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** One of the `AssetProxyFailures` values. */
export type TAssetProxyFailure = TConstValue<typeof AssetProxyFailures>;

/** The most file parts one upload request may carry unless `parseMultipartBody.maxFiles` says otherwise. */
export const DEFAULT_MAX_UPLOAD_FILES = 20;

/** Reported in the body, never thrown: the bytes are stored, only the row is not. A CODE, because a 200 bypasses the middleware that strips the driver's `detail`/`table`/`constraint`. */
export const META_LINK_CREATE_FAILED = 'META_LINK_CREATE_FAILED';
