import { getError } from '@/modules/error';
import { AbstractRedisHelper } from './base';
import { RedisClusterHelper } from './cluster';
import { RedisModes } from './common';
import type {
  IRedisClusterHelperOptions,
  IRedisSentinelHelperOptions,
  IRedisSingleHelperOptions,
} from './common';
import { RedisSentinelHelper } from './sentinel';
import { RedisSingleHelper } from './single';

export type TCreateRedisHelperOptions =
  | ({ mode: typeof RedisModes.SINGLE } & IRedisSingleHelperOptions)
  | ({ mode: typeof RedisModes.CLUSTER } & IRedisClusterHelperOptions)
  | ({ mode: typeof RedisModes.SENTINEL } & IRedisSentinelHelperOptions);

export function createRedisHelper(
  opts: { mode: typeof RedisModes.SINGLE } & IRedisSingleHelperOptions,
): RedisSingleHelper;

export function createRedisHelper(
  opts: { mode: typeof RedisModes.CLUSTER } & IRedisClusterHelperOptions,
): RedisClusterHelper;

export function createRedisHelper(
  opts: { mode: typeof RedisModes.SENTINEL } & IRedisSentinelHelperOptions,
): RedisSentinelHelper;

export function createRedisHelper(opts: TCreateRedisHelperOptions): AbstractRedisHelper {
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
      throw getError({ message: '[createRedisHelper] Unsupported redis mode!' });
    }
  }
}
