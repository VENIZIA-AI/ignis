import type { TConstValue } from '@/common/types';
import {
  RetryBackoffStrategies,
  RetryJitterModes,
  type IRetryBackoffOptions,
} from '@/modules/retry';

/** Deployment modes a Redis helper can be built for; selects the helper in `RedisHelperFactory.create`. */
export class RedisModes {
  static readonly SINGLE = 'single';
  static readonly CLUSTER = 'cluster';
  static readonly SENTINEL = 'sentinel';

  static readonly SCHEME_SET = new Set([this.SINGLE, this.CLUSTER, this.SENTINEL]);

  static isValid(scheme: string): scheme is TRedisMode {
    return this.SCHEME_SET.has(scheme);
  }
}

/** Union of the `RedisModes` values. */
export type TRedisMode = TConstValue<typeof RedisModes>;

/** Role of the node a Sentinel-backed client connects to. */
export class RedisSentinelRoles {
  static readonly MASTER = 'master';
  static readonly SLAVE = 'slave';

  static readonly ROLE_SET = new Set([this.MASTER, this.SLAVE]);

  static isValid(role: string): role is TRedisSentinelRole {
    return this.ROLE_SET.has(role);
  }
}

/** Union of the `RedisSentinelRoles` values. */
export type TRedisSentinelRole = TConstValue<typeof RedisSentinelRoles>;

/** Reconnect defaults of a Redis helper. */
export class RedisDefaults {
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
