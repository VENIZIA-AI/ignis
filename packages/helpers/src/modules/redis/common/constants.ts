import type { TConstValue } from '@/common/types';
import {
  RetryBackoffStrategies,
  RetryJitterModes,
  type IRetryBackoffOptions,
} from '@/modules/retry';

/** Role of the node a Sentinel-backed client connects to. */
export class RedisSentinelRoles {
  static readonly MASTER = 'master';
  static readonly SLAVE = 'slave';
}

/** Union of the `RedisSentinelRoles` values. */
export type TRedisSentinelRole = TConstValue<typeof RedisSentinelRoles>;

/** Reconnect defaults of a Redis helper. */
export class RedisDefaults {
  /** The port of a data node when none is given. */
  static readonly PORT = 6379;
  /** The port of a Sentinel process when none is given. */
  static readonly SENTINEL_PORT = 26379;

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
