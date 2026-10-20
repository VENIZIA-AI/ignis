import { describe, expect, it } from 'bun:test';
import {
  createRedisHelper,
  RedisClusterHelper,
  RedisModes,
  RedisSentinelHelper,
  RedisSingleHelper,
} from '@/modules/redis';

describe('createRedisHelper', () => {
  it('builds a single helper', () => {
    const helper = createRedisHelper({
      mode: RedisModes.SINGLE,
      name: 's',
      host: '127.0.0.1',
      port: 6379,
      password: 'x',
      autoConnect: false,
    });
    expect(helper).toBeInstanceOf(RedisSingleHelper);
    helper.getClient().disconnect();
  });

  it('builds a cluster helper', () => {
    const helper = createRedisHelper({
      mode: RedisModes.CLUSTER,
      name: 'c',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
      clusterOptions: { lazyConnect: true },
    });
    expect(helper).toBeInstanceOf(RedisClusterHelper);
    helper.getClient().disconnect();
  });

  it('builds a sentinel helper', () => {
    const helper = createRedisHelper({
      mode: RedisModes.SENTINEL,
      name: 'se',
      masterName: 'mymaster',
      sentinels: [{ host: '127.0.0.1', port: 26379 }],
      autoConnect: false,
    });
    expect(helper).toBeInstanceOf(RedisSentinelHelper);
    helper.getClient().disconnect();
  });

  it('throws on an unsupported mode', () => {
    // @ts-expect-error - exercising the runtime guard with an invalid mode
    expect(() => createRedisHelper({ mode: 'nope', name: 'x' })).toThrow();
  });
});
