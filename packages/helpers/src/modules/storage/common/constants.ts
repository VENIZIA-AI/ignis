/** Presign expiry defaults, in seconds - a PUT carries a file and needs more time; a GET is a redirect. */
export class StoragePresignDefaults {
  static readonly PUT_EXPIRES_IN_SECONDS = 600;
  static readonly GET_EXPIRES_IN_SECONDS = 60;
}

/**
 * How many object operations run at once. An unbounded `Promise.all` over a caller-supplied list turns
 * a 10,000-key delete into 10,000 simultaneous requests, which exhausts sockets here and rate limits
 * at the provider. Sequential is the other extreme and is needlessly slow.
 */
export class StorageConcurrency {
  static readonly DEFAULT_LIMIT = 16;
}
