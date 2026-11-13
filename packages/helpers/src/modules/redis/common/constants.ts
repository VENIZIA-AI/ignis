import {
  RetryBackoffStrategies,
  RetryJitterModes,
  type IRetryBackoffOptions,
} from '@/modules/retry';

/** Reconnect defaults of a Redis helper. */
export class RedisDefaults {
  /** The port of a data node when none is given. */
  static readonly PORT = 6379;
  /** Reconnect attempts before the helper gives up: `0` never reconnects, `RETRY_FOREVER` never stops. */
  static readonly MAX_RETRY = 5;
  static readonly RETRY_FOREVER = -1;

  /** The wait before reconnect attempt N, computed by `RetryHelper.computeBackoffDelayMs`. */
  static readonly RECONNECT_BACKOFF = {
    strategy: RetryBackoffStrategies.EXPONENTIAL,
    initialDelayMs: 1000,
    multiplier: 2,
    maxDelayMs: 30_000,
    jitter: RetryJitterModes.EQUAL,
  } satisfies IRetryBackoffOptions;
}

/** Ceiling on a caller-sized fan-out over one connection; a burst larger than this queues rather than piles up. */
export class RedisConcurrency {
  static readonly PUBLISH_LIMIT = 32;
}
