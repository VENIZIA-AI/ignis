import type { ClusterOptions } from 'ioredis';
import type {
  IRedisCredentials,
  IRedisHelperCallbacks,
  IRedisModuleOption,
  IRedisNode,
} from './../common';

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

/** Options for `RedisClusterHelper`: connection props, lifecycle callbacks and an optional `ioredis` module. */
export interface IRedisClusterHelperOptions
  extends IRedisClusterHelperProps, IRedisHelperCallbacks, IRedisModuleOption {}
