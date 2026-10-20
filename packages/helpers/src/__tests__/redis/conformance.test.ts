import { describe, expect, it } from 'bun:test';
import {
  AbstractRedisHelper,
  RedisClusterHelper,
  RedisSentinelHelper,
  RedisSingleHelper,
  type IRedisHelper,
} from '@/modules/redis';

describe('redis interface conformance', () => {
  it('single, cluster, and sentinel helpers satisfy IRedisHelper and extend AbstractRedisHelper', () => {
    const single = new RedisSingleHelper({
      name: 's',
      host: '127.0.0.1',
      port: 6379,
      password: 'x',
      autoConnect: false,
    });
    const cluster = new RedisClusterHelper({
      name: 'c',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
      clusterOptions: { lazyConnect: true },
    });
    const sentinel = new RedisSentinelHelper({
      name: 'se',
      masterName: 'mymaster',
      sentinels: [{ host: '127.0.0.1', port: 26379 }],
      autoConnect: false,
    });

    // Compile-time contract check: each concrete helper must satisfy IRedisHelper.
    const asInterfaceSingle: IRedisHelper = single;
    const asInterfaceCluster: IRedisHelper = cluster;
    const asInterfaceSentinel: IRedisHelper = sentinel;

    expect(single).toBeInstanceOf(AbstractRedisHelper);
    expect(cluster).toBeInstanceOf(AbstractRedisHelper);
    expect(sentinel).toBeInstanceOf(AbstractRedisHelper);
    expect(typeof asInterfaceSingle.getClient).toBe('function');
    expect(typeof asInterfaceCluster.publish).toBe('function');
    expect(typeof asInterfaceSentinel.del).toBe('function');

    single.getClient().disconnect();
    cluster.getClient().disconnect();
    sentinel.getClient().disconnect();
  });
});
