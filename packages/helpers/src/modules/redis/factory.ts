import { getError } from '@/modules/error';
import { type AbstractRedisHelper } from './base';
import { RedisClusterHelper } from './cluster';
import { RedisModes } from './common';
import type {
  IRedisClusterHelperOptions,
  IRedisSentinelHelperOptions,
  IRedisSingleHelperOptions,
} from './common';
import { RedisSentinelHelper } from './sentinel';
import { RedisSingleHelper } from './single';

/** Options for `RedisHelperFactory.create`: the helper options of one mode, discriminated by `mode`. */
export type TCreateRedisHelperOptions =
  | ({ mode: typeof RedisModes.SINGLE } & IRedisSingleHelperOptions)
  | ({ mode: typeof RedisModes.CLUSTER } & IRedisClusterHelperOptions)
  | ({ mode: typeof RedisModes.SENTINEL } & IRedisSentinelHelperOptions);

/** Creates the Redis helper for a `mode`; the overloads return the concrete helper type. Throws on an unsupported mode. */
export class RedisHelperFactory {
  static create(
    opts: { mode: typeof RedisModes.SINGLE } & IRedisSingleHelperOptions,
  ): RedisSingleHelper;

  static create(
    opts: { mode: typeof RedisModes.CLUSTER } & IRedisClusterHelperOptions,
  ): RedisClusterHelper;

  static create(
    opts: { mode: typeof RedisModes.SENTINEL } & IRedisSentinelHelperOptions,
  ): RedisSentinelHelper;

  static create(opts: TCreateRedisHelperOptions): AbstractRedisHelper;

  static create(opts: TCreateRedisHelperOptions): AbstractRedisHelper {
    switch (opts.mode) {
      case RedisModes.SINGLE: {
        return new RedisSingleHelper(opts);
      }
      case RedisModes.CLUSTER: {
        return new RedisClusterHelper(opts);
      }
      case RedisModes.SENTINEL: {
        return new RedisSentinelHelper(opts);
      }
      default: {
        throw getError({ message: '[RedisHelperFactory.create] Unsupported redis mode!' });
      }
    }
  }
}
