import { afterEach, describe, expect, it } from 'bun:test';
import { RedisDefaults, RedisSingleHelper } from '@/modules/redis';

describe('RedisSingleHelper', () => {
  let helper: RedisSingleHelper | undefined;

  afterEach(() => {
    helper?.getClient().disconnect();
    helper = undefined;
  });

  it('maps host/port/db and stays disconnected with autoConnect:false', () => {
    helper = new RedisSingleHelper({
      name: 'single-test',
      host: '127.0.0.1',
      port: '6380',
      password: 'secret',
      database: 3,
      autoConnect: false,
    });
    const options = helper.getClient().options;
    expect(options.host).toBe('127.0.0.1');
    expect(options.port).toBe(6380);
    expect(options.db).toBe(3);
    expect(options.lazyConnect).toBe(true);
    expect(helper.getClient().status).toBe('wait');
  });

  it('passes a Redis ACL username to the client beside the password', () => {
    helper = new RedisSingleHelper({
      name: 'single-acl',
      host: '127.0.0.1',
      port: 6379,
      username: 'worker',
      password: 'secret',
      autoConnect: false,
    });
    const options = helper.getClient().options;

    expect(options.username).toBe('worker');
    expect(options.password).toBe('secret');
  });

  it('takes no password for a Redis that has none', () => {
    helper = new RedisSingleHelper({
      name: 'single-test',
      host: '127.0.0.1',
      port: 6379,
      autoConnect: false,
    });
    // ioredis stores a missing password as null and sends no AUTH for it.
    expect(helper.getClient().options.password ?? null).toBeNull();
  });

  it('applies the maxRetry-bounded retry strategy', () => {
    helper = new RedisSingleHelper({
      name: 'single-test',
      host: '127.0.0.1',
      port: 6379,
      password: 'x',
      autoConnect: false,
      maxRetry: 5,
    });
    const retryStrategy = helper.getClient().options.retryStrategy!;
    expect(retryStrategy(5)).toBeNumber();
    expect(retryStrategy(6)).toBeUndefined();
  });
});

describe('Redis reconnect policy', () => {
  const build = (opts: { maxRetry?: number }) =>
    new RedisSingleHelper({
      name: 'retry-test',
      host: '127.0.0.1',
      port: 6379,
      autoConnect: false,
      ...opts,
    });

  it('defaults to 5 attempts', () => {
    const helper = build({});
    const retryStrategy = helper.getClient().options.retryStrategy!;

    expect(RedisDefaults.MAX_RETRY).toBe(5);
    expect(retryStrategy(5)).toBeNumber();
    expect(retryStrategy(6)).toBeUndefined();
    helper.getClient().disconnect();
  });

  it('waits an exponential backoff with equal jitter, capped at the maximum', () => {
    const helper = build({ maxRetry: RedisDefaults.RETRY_FOREVER });
    const retryStrategy = helper.getClient().options.retryStrategy!;

    for (let index = 0; index < 100; index++) {
      expect(retryStrategy(1)).toBeWithin(500, 1000);
      expect(retryStrategy(3)).toBeWithin(2000, 4000);
      expect(retryStrategy(50)).toBeWithin(15_000, 30_000);
    }

    helper.getClient().disconnect();
  });

  it('0 never reconnects, -1 never gives up', () => {
    const none = build({ maxRetry: 0 });
    const forever = build({ maxRetry: RedisDefaults.RETRY_FOREVER });

    expect(none.getClient().options.retryStrategy!(1)).toBeUndefined();
    expect(forever.getClient().options.retryStrategy!(10_000)).toBeNumber();
    none.getClient().disconnect();
    forever.getClient().disconnect();
  });

  it.each([-2, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses maxRetry %p at construction',
    (maxRetry) => {
      expect(() => build({ maxRetry })).toThrow(/maxRetry must be 0/);
    },
  );
});
