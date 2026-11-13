import type { Cluster, ClusterOptions, Redis, RedisOptions } from 'ioredis';
import type { TRedisSentinelRole } from './constants';
import type { IRedisHelper } from './interfaces';

/** The ioredis client a helper wraps: a single or Sentinel `Redis`, or a `Cluster`. */
export type TRedisClient = Redis | Cluster;

/** Connection settings for a single Redis node. */
export interface IRedisSingleHelperProps {
  name: string;
  host: string;
  port: string | number;
  /** The Redis ACL user to authenticate as, with `password`. Omit it to authenticate as the `default` user. */
  username?: string;
  /** Omit it for a Redis with no password. */
  password?: string;
  /** @default 0 */
  database?: number;
  /** @default true */
  autoConnect?: boolean;
  /** Reconnect attempts: `0` never reconnects, `-1` never gives up; any other value is refused. @default RedisDefaults.MAX_RETRY (5) */
  maxRetry?: number;
}

/** Connection settings for a Redis Cluster: the startup `nodes`, plus raw ioredis `clusterOptions` that override the helper defaults. */
export interface IRedisClusterHelperProps {
  name: string;
  nodes: Array<{ host: string; port: string | number }>;
  /** The Redis ACL user of every data node, with `password`. Omit it to authenticate as the `default` user. Applied through `redisOptions`, so nodes found after startup get it too. */
  username?: string;
  /** The password of every data node. Omit it for a cluster with no password. */
  password?: string;
  /**
   * Same meaning as on single and sentinel: `false` holds the client open for a later `connect()`.
   *
   * @default true
   */
  autoConnect?: boolean;
  /** Reconnect attempts: `0` never reconnects, `-1` never gives up; any other value is refused. `clusterOptions` still overrides. @default RedisDefaults.MAX_RETRY (5) */
  maxRetry?: number;
  clusterOptions?: ClusterOptions;
}

/** Connection settings for Redis behind Sentinel. `redisOptions` overrides the helper defaults. */
export interface IRedisSentinelHelperProps {
  name: string;
  /** Everything that belongs to Sentinel: the monitored group, which side to read, the processes' own ACL user and password (not the data nodes') and their addresses. */
  sentinel: {
    /** The group name in sentinel.conf (`sentinel monitor <masterName> ...`). Maps to ioredis `name`. */
    masterName: string;
    /** Connect to the master or to a replica. @default RedisSentinelRoles.MASTER */
    role?: TRedisSentinelRole;
    username?: string;
    password?: string;
    nodes: Array<{
      host: string;
      /** @default 26379 */
      port?: string | number;
    }>;
  };
  /** The Redis ACL user of the data nodes (master and replicas), with `password`. Omit it to authenticate as the `default` user. The Sentinel processes' own credentials are `sentinel.username` and `sentinel.password`. */
  username?: string;
  password?: string;
  /** @default 0 */
  database?: number;
  /** @default true */
  autoConnect?: boolean;
  /** Reconnect attempts: `0` never reconnects, `-1` never gives up; any other value is refused. @default RedisDefaults.MAX_RETRY (5) */
  maxRetry?: number;
  redisOptions?: Partial<RedisOptions>;
}

/** Lifecycle hooks a Redis helper calls; each receives the helper name and the helper itself. */
export interface IRedisHelperCallbacks {
  onInitialized?: (opts: { name: string; helper: IRedisHelper }) => void;
  onConnected?: (opts: { name: string; helper: IRedisHelper }) => void;
  onReady?: (opts: { name: string; helper: IRedisHelper }) => void;
  onError?: (opts: { name: string; helper: IRedisHelper; error: unknown }) => void;
}

/**
 * `ioredis` is an optional peer, loaded when a client is built. A `bun build --compile` binary
 * carries no `node_modules` to load it from: pass the module here, or register it once with
 * `ModuleUtility.register({ modules: { ioredis } })` at the entry.
 */
export interface IRedisModuleOption {
  module?: typeof import('ioredis');
}

/** Options for `RedisSingleHelper`: connection props, lifecycle callbacks and an optional `ioredis` module. */
export interface IRedisSingleHelperOptions
  extends IRedisSingleHelperProps, IRedisHelperCallbacks, IRedisModuleOption {}

/** Options for `RedisClusterHelper`: connection props, lifecycle callbacks and an optional `ioredis` module. */
export interface IRedisClusterHelperOptions
  extends IRedisClusterHelperProps, IRedisHelperCallbacks, IRedisModuleOption {}

/** Options for `RedisSentinelHelper`: connection props, lifecycle callbacks and an optional `ioredis` module. */
export interface IRedisSentinelHelperOptions
  extends IRedisSentinelHelperProps, IRedisHelperCallbacks, IRedisModuleOption {}
