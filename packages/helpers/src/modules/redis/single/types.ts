import type {
  IRedisCredentials,
  IRedisHelperCallbacks,
  IRedisModuleOption,
  IRedisNode,
} from './../common';

/** Connection settings for a single Redis node. */
export interface IRedisSingleHelperProps extends IRedisNode, IRedisCredentials {
  name: string;
  /** @default 0 */
  database?: number;
  /** @default true */
  autoConnect?: boolean;
  /** Reconnect attempts: `0` never reconnects, `-1` never gives up; any other value is refused. @default RedisDefaults.MAX_RETRY (5) */
  maxRetry?: number;
}

/** Options for `RedisSingleHelper`: connection props, lifecycle callbacks and an optional `ioredis` module. */
export interface IRedisSingleHelperOptions
  extends IRedisSingleHelperProps, IRedisHelperCallbacks, IRedisModuleOption {}
