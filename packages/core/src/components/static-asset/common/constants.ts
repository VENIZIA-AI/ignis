import type { TConstValue } from '@venizia/ignis-helpers';
import { HTTP } from '@venizia/ignis-helpers';

export const WHITELIST_HEADERS = [
  HTTP.Headers.CONTENT_TYPE,
  HTTP.Headers.CONTENT_ENCODING,
  HTTP.Headers.CACHE_CONTROL,
  HTTP.Headers.ETAG,
  HTTP.Headers.LAST_MODIFIED,
] as const;

export class StaticAssetStorageTypes {
  static readonly DISK = 'disk';
  static readonly MINIO = 'minio';
  static readonly BUN_S3 = 'bun-s3';

  static readonly SCHEME_SET = new Set([this.DISK, this.MINIO, this.BUN_S3]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

export type TStaticAssetStorageType = TConstValue<typeof StaticAssetStorageTypes>;
