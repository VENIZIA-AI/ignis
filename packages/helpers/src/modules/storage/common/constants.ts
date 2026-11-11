import { DurationUnits, type IDuration, type TConstValue } from '@/common';

/** The backend a storage helper writes to. A helper declares its own, so a caller never tells one apart with `instanceof`. */
export class StorageTypes {
  static readonly DISK = 'disk';
  static readonly BUN_S3 = 'bun-s3';
}

/** One of the `StorageTypes` values. */
export type TStorageType = TConstValue<typeof StorageTypes>;

/** The `x-amz-*` request and response headers the S3 helper reads and sends. */
export class S3Headers {
  static readonly COPY_SOURCE = 'x-amz-copy-source';
  static readonly COPY_SOURCE_IF_MATCH = 'x-amz-copy-source-if-match';
  static readonly VERSION_ID = 'x-amz-version-id';
}

/** Presign expiry defaults - a PUT or a POST form carries a file and needs more time; a GET is a redirect. */
export class StoragePresignDefaults {
  static readonly PUT_EXPIRES_IN: IDuration = { unit: DurationUnits.MINUTE, value: 10 };
  static readonly GET_EXPIRES_IN: IDuration = { unit: DurationUnits.MINUTE, value: 1 };

  /** A browser upload form: the user has to pick the file and the bytes have to travel. */
  static readonly POST_EXPIRES_IN: IDuration = { unit: DurationUnits.MINUTE, value: 15 };
}

/** SigV4 refuses a presigned URL valid for longer than 7 days. */
export class StoragePresignLimits {
  static readonly MAX_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;
}

/** Concurrent object operations. Unbounded exhausts sockets and gets rate limited. */
export class StorageConcurrency {
  static readonly DEFAULT_LIMIT = 16;
}

/** Which host a signed artifact names. `host` is inside every SigV4 signature, so this is decided at signing time and cannot be patched afterwards. */
export class S3Audiences {
  /** The host THIS process talks to: every bucket operation, copy and tagging call. */
  static readonly SERVER = 'server';

  /** The host a BROWSER is handed: presigned URLs and POST policies. */
  static readonly BROWSER = 'browser';

  static readonly SCHEME_SET = new Set<string>([this.SERVER, this.BROWSER]);

  static isValid(audience: string): boolean {
    return this.SCHEME_SET.has(audience);
  }
}

/** The host a signed artifact names: `server` (the host this process talks to) or `browser` (the host a browser is handed). */
export type TS3Audience = TConstValue<typeof S3Audiences>;
