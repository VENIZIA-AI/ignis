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
  static readonly TAGGING = 'x-amz-tagging';
  static readonly CONTENT_SHA256 = 'x-amz-content-sha256';
  static readonly DATE = 'x-amz-date';
  static readonly SECURITY_TOKEN = 'x-amz-security-token';
}

/** The fixed words of an AWS Signature V4 signature for S3. */
export class S3Signing {
  static readonly ALGORITHM = 'AWS4-HMAC-SHA256';
  static readonly SERVICE = 's3';
  static readonly REQUEST_TYPE = 'aws4_request';
  static readonly UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
}

/** S3 values the helper falls back to or recognises. */
export class S3Defaults {
  static readonly REGION = 'us-east-1';

  /** What S3 answers as the version id of an object in a bucket where versioning is off or suspended. */
  static readonly NULL_VERSION_ID = 'null';
}

/** Size ceilings the storage helpers enforce: a name or key in UTF-8 bytes, and the keys one S3 listing call returns. */
export class StorageLimits {
  static readonly MAX_SEGMENT_BYTES = 255;
  static readonly MAX_KEY_BYTES = 1024;
  static readonly MAX_LIST_KEYS = 1000;
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
}

/** The host a signed artifact names: `server` (the host this process talks to) or `browser` (the host a browser is handed). */
export type TS3Audience = TConstValue<typeof S3Audiences>;
