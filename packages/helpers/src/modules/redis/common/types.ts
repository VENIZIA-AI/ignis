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

export interface IRedisSingleHelperOptions extends IRedisSingleHelperProps, IRedisHelperCallbacks {}

export interface IRedisClusterHelperOptions
  extends IRedisClusterHelperProps, IRedisHelperCallbacks {}

export interface IRedisSentinelHelperOptions
  extends IRedisSentinelHelperProps, IRedisHelperCallbacks {}
