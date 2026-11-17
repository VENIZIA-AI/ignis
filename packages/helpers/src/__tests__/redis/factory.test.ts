import { describe, expect, it } from 'bun:test';
import {
  RedisHelperFactory,
  RedisClusterHelper,
  RedisSentinelHelper,
  RedisSingleHelper,
} from '@/modules/redis';

describe('RedisHelperFactory', () => {
  it('builds a single helper', () => {
    const helper = RedisHelperFactory.single({
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
    const helper = RedisHelperFactory.cluster({
      name: 'c',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
      clusterOptions: { lazyConnect: true },
    });
    expect(helper).toBeInstanceOf(RedisClusterHelper);
    helper.getClient().disconnect();
  });

  it('builds a sentinel helper', () => {
    const helper = RedisHelperFactory.sentinel({
      name: 'se',
      sentinel: { masterName: 'mymaster', nodes: [{ host: '127.0.0.1', port: 26379 }] },
      autoConnect: false,
    });
    expect(helper).toBeInstanceOf(RedisSentinelHelper);
    helper.getClient().disconnect();
  });
});
