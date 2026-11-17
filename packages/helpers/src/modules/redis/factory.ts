import { RedisClusterHelper, type IRedisClusterHelperOptions } from './cluster';
import { RedisSentinelHelper, type IRedisSentinelHelperOptions } from './sentinel';
import { RedisSingleHelper, type IRedisSingleHelperOptions } from './single';

/** Creates the Redis helper of one topology: `single`, `cluster` or `sentinel`. Each returns its concrete helper type. */
export class RedisHelperFactory {
  static single(opts: IRedisSingleHelperOptions) {
    return new RedisSingleHelper(opts);
  }

  static cluster(opts: IRedisClusterHelperOptions) {
    return new RedisClusterHelper(opts);
  }

  static sentinel(opts: IRedisSentinelHelperOptions) {
    return new RedisSentinelHelper(opts);
  }
}
