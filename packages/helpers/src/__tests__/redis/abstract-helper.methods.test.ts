import type { AnyType } from '@/common/types';
/**
 * AbstractRedisHelper - arg-mapping, empty-array guards, boolean mapping, camelCase cleanup.
 * Uses a mock ioredis client substituted into RedisSingleHelper via bracket access.
 */

import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import { RedisSingleHelper } from '@/modules/redis';

// ---------------------------------------------------------------------------
// Minimal mock ioredis client
// ---------------------------------------------------------------------------

type TMockFn = ReturnType<typeof mock>;

class MockRedisClient extends EventEmitter {
  status: string = 'ready';

  duplicate: TMockFn = mock(() => new MockRedisClient());
  connect: TMockFn = mock(() => Promise.resolve());
  quit: TMockFn = mock(() => Promise.resolve('OK'));

  // Key lifecycle
  exists: TMockFn = mock((..._keys: string[]) => Promise.resolve(0));
  expire: TMockFn = mock(() => Promise.resolve(0));
  expireat: TMockFn = mock(() => Promise.resolve(0));
  ttl: TMockFn = mock(() => Promise.resolve(-1));
  persist: TMockFn = mock(() => Promise.resolve(0));
  incr: TMockFn = mock(() => Promise.resolve(1));
  decr: TMockFn = mock(() => Promise.resolve(0));
  incrby: TMockFn = mock(() => Promise.resolve(1));
  decrby: TMockFn = mock(() => Promise.resolve(0));

  // Key-value
  set: TMockFn = mock(() => Promise.resolve('OK'));
  get: TMockFn = mock(() => Promise.resolve(null));
  del: TMockFn = mock(() => Promise.resolve(0));
  mset: TMockFn = mock(() => Promise.resolve('OK'));
  mget: TMockFn = mock(() => Promise.resolve([]));
  keys: TMockFn = mock(() => Promise.resolve([]));

  // Hash
  hset: TMockFn = mock(() => Promise.resolve(0));
  hgetall: TMockFn = mock(() => Promise.resolve(null));
  hget: TMockFn = mock(() => Promise.resolve(null));
  hdel: TMockFn = mock(() => Promise.resolve(0));
  hexists: TMockFn = mock(() => Promise.resolve(0));
  hkeys: TMockFn = mock(() => Promise.resolve([]));
  hvals: TMockFn = mock(() => Promise.resolve([]));
  hincrby: TMockFn = mock(() => Promise.resolve(0));
  hlen: TMockFn = mock(() => Promise.resolve(0));

  // Set
  sadd: TMockFn = mock(() => Promise.resolve(0));
  srem: TMockFn = mock(() => Promise.resolve(0));
  smembers: TMockFn = mock(() => Promise.resolve([]));
  sismember: TMockFn = mock(() => Promise.resolve(0));
  scard: TMockFn = mock(() => Promise.resolve(0));

  // List
  lpush: TMockFn = mock(() => Promise.resolve(0));
  rpush: TMockFn = mock(() => Promise.resolve(0));
  lpop: TMockFn = mock(() => Promise.resolve(null));
  rpop: TMockFn = mock(() => Promise.resolve(null));
  lrange: TMockFn = mock(() => Promise.resolve([]));
  llen: TMockFn = mock(() => Promise.resolve(0));

  // Pub/Sub + raw
  publish: TMockFn = mock(() => Promise.resolve(0));
  subscribe: TMockFn = mock(() => {});
  unsubscribe: TMockFn = mock(() => {});
  call: TMockFn = mock(() => Promise.resolve(null));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHelper() {
  const mockClient = new MockRedisClient();
  const helper = new RedisSingleHelper({
    name: 'test',
    host: '127.0.0.1',
    port: 6379,
    password: 'x',
    autoConnect: false,
  });
  // Inject mock client via bracket access (client is a public field on AbstractRedisHelper)
  (helper as AnyType as { client: MockRedisClient }).client = mockClient;
  return { helper, mockClient };
}

// ---------------------------------------------------------------------------
// Part A: camelCase-only — lowercase aliases removed
// ---------------------------------------------------------------------------

describe('camelCase cleanup — lowercase methods removed', () => {
  it('hset is undefined on the helper', () => {
    const { helper } = buildHelper();
    expect((helper as AnyType as Record<string, unknown>).hset).toBeUndefined();
  });

  it('hgetall is undefined on the helper', () => {
    const { helper } = buildHelper();
    expect((helper as AnyType as Record<string, unknown>).hgetall).toBeUndefined();
  });

  it('mset is undefined on the helper', () => {
    const { helper } = buildHelper();
    expect((helper as AnyType as Record<string, unknown>).mset).toBeUndefined();
  });

  it('mget is undefined on the helper', () => {
    const { helper } = buildHelper();
    expect((helper as AnyType as Record<string, unknown>).mget).toBeUndefined();
  });

  it('camelCase hSet, hGetAll, mSet, mGet are present', () => {
    const { helper } = buildHelper();
    expect(typeof helper.hSet).toBe('function');
    expect(typeof helper.hGetAll).toBe('function');
    expect(typeof helper.mSet).toBe('function');
    expect(typeof helper.mGet).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Part B: empty-array early-return — ioredis NOT called
// ---------------------------------------------------------------------------

describe('empty-array early-return', () => {
  let helper: RedisSingleHelper;
  let mockClient: MockRedisClient;

  beforeEach(() => {
    ({ helper, mockClient } = buildHelper());
  });

  it('exists([]) returns 0 without calling client.exists', async () => {
    const result = await helper.exists({ keys: [] });
    expect(result).toBe(0);
    expect(mockClient.exists).not.toHaveBeenCalled();
  });

  it('hDel with empty fields returns 0 without calling client.hdel', async () => {
    const result = await helper.hDel({ key: 'k', fields: [] });
    expect(result).toBe(0);
    expect(mockClient.hdel).not.toHaveBeenCalled();
  });

  it('sAdd with empty members returns 0 without calling client.sadd', async () => {
    const result = await helper.sAdd({ key: 'k', members: [] });
    expect(result).toBe(0);
    expect(mockClient.sadd).not.toHaveBeenCalled();
  });

  it('sRem with empty members returns 0 without calling client.srem', async () => {
    const result = await helper.sRem({ key: 'k', members: [] });
    expect(result).toBe(0);
    expect(mockClient.srem).not.toHaveBeenCalled();
  });

  it('lPush with empty values returns 0 without calling client.lpush', async () => {
    const result = await helper.lPush({ key: 'k', values: [] });
    expect(result).toBe(0);
    expect(mockClient.lpush).not.toHaveBeenCalled();
  });

  it('rPush with empty values returns 0 without calling client.rpush', async () => {
    const result = await helper.rPush({ key: 'k', values: [] });
    expect(result).toBe(0);
    expect(mockClient.rpush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Part B: arg-mapping — correct ioredis call shapes
// ---------------------------------------------------------------------------

describe('arg-mapping', () => {
  let helper: RedisSingleHelper;
  let mockClient: MockRedisClient;

  beforeEach(() => {
    ({ helper, mockClient } = buildHelper());
  });

  it('sAdd spreads members correctly: sadd(key, 1, "a")', async () => {
    await helper.sAdd({ key: 'myset', members: [1, 'a'] });
    expect(mockClient.sadd).toHaveBeenCalledWith('myset', 1, 'a');
  });

  it('sRem spreads members correctly', async () => {
    await helper.sRem({ key: 'myset', members: ['x', 'y'] });
    expect(mockClient.srem).toHaveBeenCalledWith('myset', 'x', 'y');
  });

  it('lPush spreads values correctly', async () => {
    await helper.lPush({ key: 'mylist', values: [1, 2, 3] });
    expect(mockClient.lpush).toHaveBeenCalledWith('mylist', 1, 2, 3);
  });

  it('rPush spreads values correctly', async () => {
    await helper.rPush({ key: 'mylist', values: ['a', 'b'] });
    expect(mockClient.rpush).toHaveBeenCalledWith('mylist', 'a', 'b');
  });

  it('hDel spreads fields correctly', async () => {
    await helper.hDel({ key: 'myhash', fields: ['f1', 'f2'] });
    expect(mockClient.hdel).toHaveBeenCalledWith('myhash', 'f1', 'f2');
  });

  it('exists spreads keys correctly', async () => {
    await helper.exists({ keys: ['k1', 'k2'] });
    expect(mockClient.exists).toHaveBeenCalledWith('k1', 'k2');
  });

  it('expireAt calls expireat with epoch seconds', async () => {
    await helper.expireAt({ key: 'k', atEpochSeconds: 9999999 });
    expect(mockClient.expireat).toHaveBeenCalledWith('k', 9999999);
  });

  it('expire calls expire with seconds', async () => {
    await helper.expire({ key: 'k', seconds: 60 });
    expect(mockClient.expire).toHaveBeenCalledWith('k', 60);
  });

  it('incrBy calls incrby(key, value)', async () => {
    await helper.incrBy({ key: 'counter', value: 5 });
    expect(mockClient.incrby).toHaveBeenCalledWith('counter', 5);
  });

  it('decrBy calls decrby(key, value)', async () => {
    await helper.decrBy({ key: 'counter', value: 3 });
    expect(mockClient.decrby).toHaveBeenCalledWith('counter', 3);
  });

  it('hGet calls hget(key, field)', async () => {
    await helper.hGet({ key: 'myhash', field: 'name' });
    expect(mockClient.hget).toHaveBeenCalledWith('myhash', 'name');
  });

  it('hExists calls hexists(key, field)', async () => {
    await helper.hExists({ key: 'myhash', field: 'name' });
    expect(mockClient.hexists).toHaveBeenCalledWith('myhash', 'name');
  });

  it('hIncrBy calls hincrby(key, field, value)', async () => {
    await helper.hIncrBy({ key: 'myhash', field: 'score', value: 10 });
    expect(mockClient.hincrby).toHaveBeenCalledWith('myhash', 'score', 10);
  });

  it('sIsMember calls sismember(key, member)', async () => {
    await helper.sIsMember({ key: 'myset', member: 'foo' });
    expect(mockClient.sismember).toHaveBeenCalledWith('myset', 'foo');
  });

  it('lRange calls lrange(key, start, stop)', async () => {
    await helper.lRange({ key: 'mylist', start: 0, stop: -1 });
    expect(mockClient.lrange).toHaveBeenCalledWith('mylist', 0, -1);
  });
});

// ---------------------------------------------------------------------------
// Part B: boolean mapping — === 1 conversions
// ---------------------------------------------------------------------------

describe('boolean mapping', () => {
  it('expire returns true when client returns 1', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.expire = mock(() => Promise.resolve(1));
    const rs = await helper.expire({ key: 'k', seconds: 10 });
    expect(rs).toBe(true);
  });

  it('expire returns false when client returns 0', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.expire = mock(() => Promise.resolve(0));
    const rs = await helper.expire({ key: 'k', seconds: 10 });
    expect(rs).toBe(false);
  });

  it('expireAt returns true when client returns 1', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.expireat = mock(() => Promise.resolve(1));
    const rs = await helper.expireAt({ key: 'k', atEpochSeconds: 1000 });
    expect(rs).toBe(true);
  });

  it('persist returns true when client returns 1', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.persist = mock(() => Promise.resolve(1));
    const rs = await helper.persist({ key: 'k' });
    expect(rs).toBe(true);
  });

  it('persist returns false when client returns 0', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.persist = mock(() => Promise.resolve(0));
    const rs = await helper.persist({ key: 'k' });
    expect(rs).toBe(false);
  });

  it('hExists returns true when client returns 1', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.hexists = mock(() => Promise.resolve(1));
    const rs = await helper.hExists({ key: 'h', field: 'f' });
    expect(rs).toBe(true);
  });

  it('hExists returns false when client returns 0', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.hexists = mock(() => Promise.resolve(0));
    const rs = await helper.hExists({ key: 'h', field: 'f' });
    expect(rs).toBe(false);
  });

  it('sIsMember returns true when client returns 1', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.sismember = mock(() => Promise.resolve(1));
    const rs = await helper.sIsMember({ key: 's', member: 'x' });
    expect(rs).toBe(true);
  });

  it('sIsMember returns false when client returns 0', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.sismember = mock(() => Promise.resolve(0));
    const rs = await helper.sIsMember({ key: 's', member: 'x' });
    expect(rs).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Part B: set with expiresIn
// ---------------------------------------------------------------------------

describe('set with expiresIn', () => {
  it('set without expiresIn calls client.set(key, json) — no PX', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.set({ key: 'mykey', value: { name: 'Alice' } });
    expect(mockClient.set).toHaveBeenCalledWith('mykey', JSON.stringify({ name: 'Alice' }));
  });

  it('set with expiresIn calls client.set(key, json, "PX", ms)', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.set({ key: 'mykey', value: { name: 'Alice' }, options: { expiresIn: 5000 } });
    expect(mockClient.set).toHaveBeenCalledWith(
      'mykey',
      JSON.stringify({ name: 'Alice' }),
      'PX',
      5000,
    );
  });

  it('set with expiresIn = 0 does NOT use PX (zero is not positive)', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.set({ key: 'mykey', value: 'v', options: { expiresIn: 0 } });
    expect(mockClient.set).toHaveBeenCalledWith('mykey', JSON.stringify('v'));
  });

  it('set with negative expiresIn does NOT use PX', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.set({ key: 'mykey', value: 'v', options: { expiresIn: -1 } });
    expect(mockClient.set).toHaveBeenCalledWith('mykey', JSON.stringify('v'));
  });
});

// ---------------------------------------------------------------------------
// Empty-input guards on del / mGet / mSet (ioredis throws on empty args)
// ---------------------------------------------------------------------------

describe('empty-input guards (del / mGet / mSet)', () => {
  it('del([]) returns 0 without calling client.del', async () => {
    const { helper, mockClient } = buildHelper();
    const result = await helper.del({ keys: [] });
    expect(result).toBe(0);
    expect(mockClient.del).not.toHaveBeenCalled();
  });

  it('mGet([]) returns [] without calling client.mget', async () => {
    const { helper, mockClient } = buildHelper();
    const result = await helper.mGet({ keys: [] });
    expect(result).toEqual([]);
    expect(mockClient.mget).not.toHaveBeenCalled();
  });

  it('mSet([]) resolves without calling client.mset', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.mSet({ payload: [] });
    expect(mockClient.mset).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Pub/Sub never throws inside the ioredis callback (production-safe logging)
// ---------------------------------------------------------------------------

describe('pub/sub callback error handling', () => {
  it('subscribe logs and does not throw when ioredis reports an error', () => {
    const { helper, mockClient } = buildHelper();
    mockClient.subscribe = mock(
      (_topic: string, cb: (err: Error | null, count: number) => void) => {
        cb(new Error('boom'), 0);
      },
    );
    expect(() => helper.subscribe({ topic: 'events' })).not.toThrow();
  });

  it('unsubscribe logs and does not throw when ioredis reports an error', () => {
    const { helper, mockClient } = buildHelper();
    mockClient.unsubscribe = mock(
      (_topic: string, cb: (err: Error | null, count: number) => void) => {
        cb(new Error('boom'), 0);
      },
    );
    expect(() => helper.unsubscribe({ topic: 'events' })).not.toThrow();
  });

  it('subscribe with an empty topic does NOT call client.subscribe', () => {
    const { helper, mockClient } = buildHelper();
    helper.subscribe({ topic: '' });
    expect(mockClient.subscribe).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// del non-empty arg shape (ioredis del accepts a key array)
// ---------------------------------------------------------------------------

describe('del arg-mapping', () => {
  it('del with keys calls client.del(keysArray)', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.del({ keys: ['a', 'b'] });
    expect(mockClient.del).toHaveBeenCalledWith(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// get/getObject transform + serialization
// ---------------------------------------------------------------------------

describe('get transform and getObject', () => {
  it('get applies the transform to a non-null value', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.get = mock(() => Promise.resolve('raw'));
    const result = await helper.get({ key: 'k', transform: (v: string) => v.toUpperCase() });
    expect(result).toBe('RAW');
  });

  it('get returns null (no transform call) when the value is missing', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.get = mock(() => Promise.resolve(null));
    const transform = mock((v: string) => v);
    const result = await helper.get({ key: 'k', transform });
    expect(result).toBeNull();
    expect(transform).not.toHaveBeenCalled();
  });

  it('getObject JSON-parses the stored value', async () => {
    const { helper, mockClient } = buildHelper();
    mockClient.get = mock(() => Promise.resolve('{"a":1}'));
    const result = await helper.getObject<{ a: number }>({ key: 'k' });
    expect(result).toEqual({ a: 1 });
  });

  it('set serializes the value with JSON.stringify', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.set({ key: 'k', value: { a: 1 } });
    expect(mockClient.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }));
  });
});

// ---------------------------------------------------------------------------
// publish: per-topic, empty-topics guard, compression
// ---------------------------------------------------------------------------

describe('publish', () => {
  it('publishes a Buffer to each valid topic', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.publish({ topics: ['t1', 't2'], payload: { a: 1 } });
    expect(mockClient.publish).toHaveBeenCalledTimes(2);
    const [firstTopic, firstPacket] = mockClient.publish.mock.calls[0] as [string, Buffer];
    expect(firstTopic).toBe('t1');
    expect(Buffer.isBuffer(firstPacket)).toBe(true);
    expect(firstPacket.toString()).toBe(JSON.stringify({ a: 1 }));
  });

  it('does NOT publish when there are no valid topics', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.publish({ topics: [], payload: { a: 1 } });
    expect(mockClient.publish).not.toHaveBeenCalled();
  });

  it('compresses the payload when useCompress is true', async () => {
    const { helper, mockClient } = buildHelper();
    await helper.publish({ topics: ['t'], payload: { a: 1 }, useCompress: true });
    const [, packet] = mockClient.publish.mock.calls[0] as [string, Buffer];
    // zlib-deflated bytes differ from the raw JSON bytes.
    expect(packet.toString()).not.toBe(JSON.stringify({ a: 1 }));
    expect(Buffer.isBuffer(packet)).toBe(true);
  });
});
