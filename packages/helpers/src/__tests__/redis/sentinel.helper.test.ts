import { afterEach, describe, expect, it } from 'bun:test';
import { Redis } from 'ioredis';
import { RedisSentinelHelper, type IRedisSentinelHelperProps } from '@/modules/redis';

describe('RedisSentinelHelper', () => {
  let helper: RedisSentinelHelper | undefined;

  const build = (
    overrides: Record<string, unknown> = {},
    sentinel: Partial<IRedisSentinelHelperProps['sentinel']> = {},
  ) => {
    helper = new RedisSentinelHelper({
      name: 'sentinel-test',
      sentinel: {
        masterName: 'mymaster',
        nodes: [
          { host: '127.0.0.1', port: 26379 },
          { host: '127.0.0.2', port: '26380' },
        ],
        ...sentinel,
      },
      autoConnect: false,
      ...overrides,
    });

    return helper;
  };

  afterEach(() => {
    helper?.getClient().disconnect();
    helper = undefined;
  });

  it('maps sentinel.masterName to ioredis name and coerces/defaults sentinel ports', () => {
    helper = new RedisSentinelHelper({
      name: 'sentinel-test',
      sentinel: {
        masterName: 'mymaster',
        nodes: [{ host: '127.0.0.1' }, { host: '127.0.0.2', port: '26380' }],
      },
      autoConnect: false,
    });
    const options = helper.getClient().options;
    expect(options.name).toBe('mymaster');
    expect(options.sentinels).toEqual([
      { host: '127.0.0.1', port: 26379 },
      { host: '127.0.0.2', port: 26380 },
    ]);
  });

  it('defaults sentinel.role to master and respects slave', () => {
    expect(build().getClient().options.role).toBe('master');
    expect(build({}, { role: 'slave' }).getClient().options.role).toBe('slave');
  });

  it('honors autoConnect:false and the maxRetry-bounded retry strategy', () => {
    const client = build({ maxRetry: 5 }).getClient();
    expect(client.options.lazyConnect).toBe(true);
    expect(client.status).toBe('wait');
    const retryStrategy = client.options.retryStrategy!;
    expect(retryStrategy(5)).toBeNumber();
    expect(retryStrategy(6)).toBeUndefined();
  });

  it('layers options: builder defaults < redisOptions < first-class fields', () => {
    const options = build({
      database: 2,
      redisOptions: { keyPrefix: 'app:', name: 'nope', maxRetriesPerRequest: 7 },
    }).getClient().options;
    expect(options.keyPrefix).toBe('app:'); // passthrough survives
    expect(options.maxRetriesPerRequest).toBe(7); // redisOptions overrides the builder default (null)
    expect(options.name).toBe('mymaster'); // first-class field wins over redisOptions
    expect(options.db).toBe(2); // first-class field
  });

  it('does NOT clobber a redisOptions auth value when the first-class field is omitted', () => {
    const options = build({
      redisOptions: { password: 'from-redis-options' },
      // password (first-class) intentionally omitted
    }).getClient().options;
    expect(options.password).toBe('from-redis-options');
  });

  it('sends the data-node user and password as username and password, and the Sentinel credentials as sentinelUsername and sentinelPassword', () => {
    const options = build(
      { username: 'data-user', password: 'data-secret' },
      {
        username: 'sentinel-user',
        password: 'sentinel-secret',
        nodes: [{ host: '127.0.0.1' }],
      },
    ).getClient().options;

    expect(options.username).toBe('data-user');
    expect(options.password).toBe('data-secret');
    expect(options.sentinelUsername).toBe('sentinel-user');
    expect(options.sentinelPassword).toBe('sentinel-secret');
    expect(options.sentinels).toEqual([{ host: '127.0.0.1', port: 26379 }]);
  });

  it('keeps the Sentinel credentials apart from the data-node ones', () => {
    const options = build({ password: 'data-secret' }, { password: 'sentinel-secret' }).getClient()
      .options;

    expect(options.username ?? null).toBeNull();
    expect(options.sentinelUsername ?? null).toBeNull();
    expect(options.password).toBe('data-secret');
    expect(options.sentinelPassword).toBe('sentinel-secret');
  });

  it('first-class credentials win over redisOptions, and an omitted one does not clobber it', () => {
    const wins = build(
      {
        username: 'data-user',
        redisOptions: {
          username: 'raw-user',
          sentinelUsername: 'raw-sentinel-user',
          sentinelPassword: 'raw-sentinel-secret',
        },
      },
      { username: 'sentinel-user', password: 'sentinel-secret' },
    ).getClient().options;
    const kept = build({
      redisOptions: {
        sentinelUsername: 'raw-sentinel-user',
        sentinelPassword: 'raw-sentinel-secret',
      },
    }).getClient().options;

    expect(wins.username).toBe('data-user');
    expect(wins.sentinelUsername).toBe('sentinel-user');
    expect(wins.sentinelPassword).toBe('sentinel-secret');
    expect(kept.sentinelUsername).toBe('raw-sentinel-user');
    expect(kept.sentinelPassword).toBe('raw-sentinel-secret');
  });

  it('duplicateClient keeps the data-node and Sentinel credentials', () => {
    const source = build(
      { username: 'data-user', password: 'data-secret' },
      { username: 'sentinel-user', password: 'sentinel-secret' },
    );
    const copy = source.duplicateClient();

    if (!(copy instanceof Redis)) {
      throw new Error('a Sentinel helper duplicates to a Redis client');
    }

    expect(copy.options.username).toBe('data-user');
    expect(copy.options.password).toBe('data-secret');
    expect(copy.options.sentinelUsername).toBe('sentinel-user');
    expect(copy.options.sentinelPassword).toBe('sentinel-secret');
    copy.disconnect();
  });

  it('does NOT clobber a redisOptions username when the first-class field is omitted', () => {
    const options = build({ redisOptions: { username: 'from-redis-options' } }).getClient().options;

    expect(options.username).toBe('from-redis-options');
  });

  it('first-class password wins over redisOptions when both are provided', () => {
    const options = build({
      password: 'first-class',
      redisOptions: { password: 'from-redis-options' },
    }).getClient().options;
    expect(options.password).toBe('first-class');
  });
});
