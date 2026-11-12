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

describe('RedisClusterHelper reconnect policy', () => {
  const build = (opts: {
    maxRetry?: number;
    clusterOptions?: ConstructorParameters<typeof RedisClusterHelper>[0]['clusterOptions'];
  }) =>
    new RedisClusterHelper({
      name: 'cluster-retry',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
      autoConnect: false,
      ...opts,
    });

  it('reconnects with the same default and backoff as the other modes, and BullMQ-safe requests', () => {
    const client = build({}).getClient();
    const strategy = client.options.clusterRetryStrategy!;

    expect(strategy(5, new Error('down'))).toBeNumber();
    expect(strategy(6, new Error('down'))).toBeUndefined();
    expect(client.options.redisOptions?.maxRetriesPerRequest).toBeNull();
    client.disconnect();
  });

  it('maxRetry 0 never reconnects, and a bad value is refused', () => {
    const client = build({ maxRetry: 0 }).getClient();

    expect(client.options.clusterRetryStrategy!(1, new Error('down'))).toBeUndefined();
    expect(() => build({ maxRetry: -3 })).toThrow(/maxRetry must be 0/);
    client.disconnect();
  });

  it('an app redisOptions (a password) keeps maxRetriesPerRequest null', () => {
    const client = build({ clusterOptions: { redisOptions: { password: 'secret' } } }).getClient();

    expect(client.options.redisOptions?.password).toBe('secret');
    expect(client.options.redisOptions?.maxRetriesPerRequest).toBeNull();
    client.disconnect();
  });

  it('clusterOptions still overrides the defaults', () => {
    const client = build({
      clusterOptions: { clusterRetryStrategy: () => 7, redisOptions: { maxRetriesPerRequest: 2 } },
    }).getClient();

    expect(client.options.clusterRetryStrategy!(1, new Error('down'))).toBe(7);
    expect(client.options.redisOptions?.maxRetriesPerRequest).toBe(2);
    client.disconnect();
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

describe('RedisClusterHelper.connect is safe to call twice', () => {
  // ioredis rejects a second connect() while a cluster is in `connect`, the step between `connecting` and `ready`.
  it('answers false without calling the client while the cluster is between connecting and ready', async () => {
    const helper = new RedisClusterHelper({
      name: 'cluster-connect-twice',
      nodes: [{ host: '127.0.0.1', port: 7000 }],
      autoConnect: false,
    });
    const client = helper.getClient();
    let calls = 0;
    const original = client.connect.bind(client);

    client.connect = () => {
      calls += 1;

      return original();
    };

    Reflect.set(client, 'status', 'connect');

    const connected = await helper.connect();

    expect(connected).toBe(false);
    expect(calls).toBe(0);

    Reflect.set(client, 'status', 'wait');
    client.disconnect();
  });
});
