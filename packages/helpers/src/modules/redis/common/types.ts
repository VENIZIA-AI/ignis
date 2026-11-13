import type { Cluster, ClusterOptions, Redis, RedisOptions } from 'ioredis';
import type { TRedisSentinelRole } from './constants';
import type { IRedisHelper } from './interfaces';

/** The ioredis client a helper wraps: a single or Sentinel `Redis`, or a `Cluster`. */
export type TRedisClient = Redis | Cluster;

/** The address of one Redis node. A node has no credentials of its own: ioredis reads only the host and port of a Sentinel endpoint, and applies a cluster node's credentials to the startup nodes only. */
export interface IRedisNode {
  host: string;
  /** @default RedisDefaults.PORT (6379), or RedisDefaults.SENTINEL_PORT (26379) for a Sentinel node */
  port?: string | number;
}

/** An ACL user and its password. Omit both to authenticate as the `default` user with no password. */
export interface IRedisCredentials {
  /** The Redis ACL user, with `password`. Omit it to authenticate as the `default` user. */
  username?: string;
  /** Omit it for a Redis with no password. */
  password?: string;
}

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

/** Connection settings for a Redis Cluster: the startup `nodes` and one credential pair for every node, plus raw ioredis `clusterOptions` that override the helper defaults. The credentials go through `redisOptions`, so nodes found after startup get them too. */
export interface IRedisClusterHelperProps extends IRedisCredentials {
  name: string;
  nodes: IRedisNode[];
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

/** Connection settings for Redis behind Sentinel. Top-level `username` and `password` are the data nodes'; everything Sentinel-specific is in `sentinel`. Precedence (low -> high): the helper defaults, `redisOptions`, then the first-class fields; an auth field left unset falls back to `redisOptions`. */
export interface IRedisSentinelHelperProps extends IRedisCredentials {
  name: string;
  /** The monitored group, which side to read, the Sentinel processes' own credentials (not the data nodes') and their addresses. */
  sentinel: IRedisCredentials & {
    /** `username` and `password` here are the Sentinel processes' own (ioredis `sentinelUsername`, `sentinelPassword`), never the data nodes'. */
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
