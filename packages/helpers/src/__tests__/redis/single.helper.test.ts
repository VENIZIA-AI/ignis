import { afterEach, describe, expect, it } from 'bun:test';
import { RedisSingleHelper } from '@/modules/redis';

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
    expect(retryStrategy(1)).toBe(2000);
    expect(retryStrategy(3)).toBe(5000);
    expect(retryStrategy(6)).toBeUndefined();
  });
});
