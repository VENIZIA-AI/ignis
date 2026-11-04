import type { Cluster, ClusterOptions, Redis, RedisOptions } from 'ioredis';
import type { TRedisSentinelRole } from './constants';
import type { IRedisHelper } from './interfaces';

/** The ioredis client a helper wraps: a single or Sentinel `Redis`, or a `Cluster`. */
export type TRedisClient = Redis | Cluster;

/** Connection settings for a single Redis node. `database` and `maxRetry` default to 0 in the helper; `autoConnect` defaults to true. */
export interface IRedisSingleHelperProps {
  name: string;
  host: string;
  port: string | number;
  user?: string;
  /** Omit it for a Redis with no password. */
  password?: string;
  database?: number;
  autoConnect?: boolean;
  maxRetry?: number;
}

/** Connection settings for a Redis Cluster: the startup `nodes`, plus raw ioredis `clusterOptions` that override the helper defaults. */
export interface IRedisClusterHelperProps {
  name: string;
  nodes: Array<{ host: string; port: string | number; password?: string }>;
  /** Same meaning as on single and sentinel: `false` holds the client open for a later `connect()`. */
  autoConnect?: boolean;
  clusterOptions?: ClusterOptions;
}

/** Connection settings for Redis behind Sentinel. Sentinel `port` defaults to 26379, `role` to master, `database` and `maxRetry` to 0, `autoConnect` to true; `redisOptions` overrides the helper defaults. */
export interface IRedisSentinelHelperProps {
  name: string;
  sentinels: Array<{ host: string; port?: string | number }>;
  masterName: string;
  role?: TRedisSentinelRole;
  password?: string;
  sentinelPassword?: string;
  sentinelUsername?: string;
  database?: number;
  autoConnect?: boolean;
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
