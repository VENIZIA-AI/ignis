import type { AnyType } from '@/common/types';
import { afterEach, describe, expect, it } from 'bun:test';
import { RedisClusterHelper } from '@/modules/redis';

describe('RedisClusterHelper', () => {
  let helper: RedisClusterHelper | undefined;

  afterEach(() => {
    helper?.getClient().disconnect();
    helper = undefined;
  });

  it('coerces startup-node ports and exposes a Cluster client', () => {
    helper = new RedisClusterHelper({
      name: 'cluster-test',
      nodes: [
        { host: '127.0.0.1', port: '7000' },
        { host: '127.0.0.2', port: 7001 },
      ],
      clusterOptions: { lazyConnect: true },
    });
    const nodes = (
      helper.getClient() as AnyType as {
        startupNodes: Array<{ host: string; port: number; password?: string }>;
      }
    ).startupNodes;
    expect(nodes).toEqual([
      { host: '127.0.0.1', port: 7000, password: undefined },
      { host: '127.0.0.2', port: 7001, password: undefined },
    ]);
  });

  it('duplicateClient returns a fresh Cluster', () => {
    helper = new RedisClusterHelper({
      name: 'cluster-test',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
      clusterOptions: { lazyConnect: true },
    });
    const dup = helper.duplicateClient();
    expect(dup).not.toBe(helper.getClient());
    dup.disconnect();
  });
});

describe('RedisClusterHelper connection timing', () => {
  let helper: RedisClusterHelper | undefined;

  afterEach(() => {
    helper?.getClient().disconnect();
    helper = undefined;
  });

  it('autoConnect:false holds the cluster open for a later connect()', () => {
    helper = new RedisClusterHelper({
      name: 'cluster-lazy',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
      autoConnect: false,
    });

    expect(helper.getClient().options.lazyConnect).toBe(true);
    expect(helper.getClient().status).toBe('wait');
  });

  it('stays eager by default, as it was before autoConnect existed', () => {
    helper = new RedisClusterHelper({
      name: 'cluster-eager',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
    });

    expect(helper.getClient().options.lazyConnect).toBe(false);
  });

  it('guarantees enableOfflineQueue instead of inheriting the ioredis default', () => {
    helper = new RedisClusterHelper({
      name: 'cluster-queue',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
      autoConnect: false,
      clusterOptions: { enableReadyCheck: false },
    });

    expect(helper.getClient().options.enableOfflineQueue).toBe(true);
  });

  it('lets an explicit clusterOptions still win, so a caller threading it today is untouched', () => {
    helper = new RedisClusterHelper({
      name: 'cluster-escape-hatch',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
      autoConnect: true,
      clusterOptions: { lazyConnect: true, enableOfflineQueue: false },
    });

    expect(helper.getClient().options.lazyConnect).toBe(true);
    expect(helper.getClient().options.enableOfflineQueue).toBe(false);
  });
});
