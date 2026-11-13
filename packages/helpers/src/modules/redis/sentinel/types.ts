import type { RedisOptions } from 'ioredis';
import type {
  IRedisCredentials,
  IRedisHelperCallbacks,
  IRedisModuleOption,
  IRedisNode,
} from './../common';
import type { TRedisSentinelRole } from './constants';

/** Connection settings for Redis behind Sentinel. Top-level `username` and `password` are the data nodes' (master and replica) credentials; everything Sentinel-specific is in `sentinel`. Precedence (low -> high): the helper defaults, `redisOptions`, then the first-class fields; an auth field left unset falls back to `redisOptions`. */
export interface IRedisSentinelHelperProps extends IRedisCredentials {
  name: string;
  /** The monitored group, which side to read, the Sentinel processes' own credentials and their addresses. `username` and `password` here are the Sentinel processes' (ioredis `sentinelUsername`, `sentinelPassword`), never the data nodes'. */
  sentinel: IRedisCredentials & {
    /** The group name in sentinel.conf (`sentinel monitor <masterName> ...`). Maps to ioredis `name`. */
    masterName: string;
    /** Connect to the master or to a replica. @default RedisSentinelRoles.MASTER */
    role?: TRedisSentinelRole;
    nodes: IRedisNode[];
  };
  /** @default 0 */
  database?: number;
  /** @default true */
  autoConnect?: boolean;
  /** Reconnect attempts: `0` never reconnects, `-1` never gives up; any other value is refused. @default RedisDefaults.MAX_RETRY (5) */
  maxRetry?: number;
  redisOptions?: Partial<RedisOptions>;
}

/** Options for `RedisSentinelHelper`: connection props, lifecycle callbacks and an optional `ioredis` module. */
export interface IRedisSentinelHelperOptions
  extends IRedisSentinelHelperProps, IRedisHelperCallbacks, IRedisModuleOption {}
