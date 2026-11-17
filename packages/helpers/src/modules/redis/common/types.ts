import type { Cluster, Redis } from 'ioredis';
import type { IRedisHelper } from './interfaces';

/** The ioredis client a helper wraps: a single or Sentinel `Redis`, or a `Cluster`. */
export type TRedisClient = Redis | Cluster;

/** The address of one Redis node. A node has no credentials of its own: ioredis reads only the host and port of a Sentinel endpoint, and applies a cluster node's credentials to the startup nodes only. */
export interface IRedisNode {
  host: string;
  /** @default RedisDefaults.PORT (6379), or RedisSentinelDefaults.PORT (26379) for a Sentinel node */
  port?: string | number;
}

/** An ACL user and its password. Omit both to authenticate as the `default` user with no password. */
export interface IRedisCredentials {
  /** The Redis ACL user, with `password`. Omit it to authenticate as the `default` user. */
  username?: string;
  /** Omit it for a Redis with no password. */
  password?: string;
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
