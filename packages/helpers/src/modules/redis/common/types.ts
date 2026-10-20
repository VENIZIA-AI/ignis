import type { Cluster, ClusterOptions, Redis, RedisOptions } from 'ioredis';
import type { TRedisSentinelRole } from './constants';
import type { IRedisHelper } from './interfaces';

export type TRedisClient = Redis | Cluster;

export interface IRedisSingleHelperProps {
  name: string;
  host: string;
  port: string | number;
  user?: string;
  password: string;
  database?: number;
  autoConnect?: boolean;
  maxRetry?: number;
}

export interface IRedisClusterHelperProps {
  name: string;
  nodes: Array<{ host: string; port: string | number; password?: string }>;
  /** Same meaning as on single and sentinel: `false` holds the client open for a later `connect()`. */
  autoConnect?: boolean;
  clusterOptions?: ClusterOptions;
}

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

export interface IRedisSingleHelperOptions
  extends IRedisSingleHelperProps, IRedisHelperCallbacks, IRedisModuleOption {}

export interface IRedisClusterHelperOptions
  extends IRedisClusterHelperProps, IRedisHelperCallbacks, IRedisModuleOption {}

export interface IRedisSentinelHelperOptions
  extends IRedisSentinelHelperProps, IRedisHelperCallbacks, IRedisModuleOption {}
