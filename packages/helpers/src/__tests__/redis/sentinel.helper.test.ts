import { afterEach, describe, expect, it } from 'bun:test';
import { RedisSentinelHelper } from '@/modules/redis';

describe('RedisSentinelHelper', () => {
  let helper: RedisSentinelHelper | undefined;

  const build = (overrides: Record<string, unknown> = {}) => {
    helper = new RedisSentinelHelper({
      name: 'sentinel-test',
      masterName: 'mymaster',
      sentinels: [
        { host: '127.0.0.1', port: 26379 },
        { host: '127.0.0.2', port: '26380' },
      ],
      autoConnect: false,
      ...overrides,
    });
    return helper;
  };

  afterEach(() => {
    helper?.getClient().disconnect();
    helper = undefined;
  });

  it('maps masterName to ioredis name and coerces/defaults sentinel ports', () => {
    helper = new RedisSentinelHelper({
      name: 'sentinel-test',
      masterName: 'mymaster',
      sentinels: [{ host: '127.0.0.1' }, { host: '127.0.0.2', port: '26380' }],
      autoConnect: false,
    });
    const options = helper.getClient().options;
    expect(options.name).toBe('mymaster');
    expect(options.sentinels).toEqual([
      { host: '127.0.0.1', port: 26379 },
      { host: '127.0.0.2', port: 26380 },
    ]);
  });

  it('defaults role to master and respects slave', () => {
    expect(build().getClient().options.role).toBe('master');
    expect(build({ role: 'slave' }).getClient().options.role).toBe('slave');
  });

  it('honors autoConnect:false and the maxRetry-bounded retry strategy', () => {
    const client = build({ maxRetry: 5 }).getClient();
    expect(client.options.lazyConnect).toBe(true);
    expect(client.status).toBe('wait');
    const retryStrategy = client.options.retryStrategy!;
    expect(retryStrategy(1)).toBe(2000);
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

  it('first-class password wins over redisOptions when both are provided', () => {
    const options = build({
      password: 'first-class',
      redisOptions: { password: 'from-redis-options' },
    }).getClient().options;
    expect(options.password).toBe('first-class');
  });
});
