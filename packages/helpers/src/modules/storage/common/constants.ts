import { DurationUnits, IDuration } from '@/common';

/** Presign expiry defaults - a PUT carries a file and needs more time; a GET is a redirect. */
export class StoragePresignDefaults {
  static readonly PUT_EXPIRES_IN: IDuration = { unit: DurationUnits.MINUTE, value: 10 };
  static readonly GET_EXPIRES_IN: IDuration = { unit: DurationUnits.MINUTE, value: 1 };
}

/** SigV4 refuses a presigned URL valid for longer than 7 days. */
export class StoragePresignLimits {
  static readonly MAX_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;
}

/** Concurrent object operations. Unbounded exhausts sockets and gets rate limited. */
export class StorageConcurrency {
  static readonly DEFAULT_LIMIT = 16;
}
