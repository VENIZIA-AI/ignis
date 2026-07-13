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
