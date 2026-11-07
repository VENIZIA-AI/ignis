import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { DerivedKeyCache } from '@/modules/crypto/algorithms/derived-key-cache';

describe('DerivedKeyCache', () => {
  test('is bounded: distinct keys past the limit evict the least recently used', async () => {
    const cache = new DerivedKeyCache();

    for (let index = 0; index < DerivedKeyCache.MAX_ENTRIES * 3; index += 1) {
      await cache.deriveOnce({ key: `k${index}`, derive: async () => Buffer.from(String(index)) });
    }

    expect(cache.size).toBe(DerivedKeyCache.MAX_ENTRIES);
  });

  test('a repeated key shares one derivation, also while it runs', async () => {
    const cache = new DerivedKeyCache();
    let runs = 0;

    const derive = async () => {
      runs += 1;

      return Buffer.from('key');
    };

    const [first, second] = await Promise.all([
      cache.deriveOnce({ key: 'same', derive }),
      cache.deriveOnce({ key: 'same', derive }),
    ]);

    expect(first).toBe(second);
    expect(runs).toBe(1);
  });

  test('a key in use survives eviction pressure', async () => {
    const cache = new DerivedKeyCache();
    let runs = 0;

    const derive = async () => {
      runs += 1;

      return Buffer.from('hot');
    };

    await cache.deriveOnce({ key: 'hot', derive });

    for (let index = 0; index < DerivedKeyCache.MAX_ENTRIES * 2; index += 1) {
      await cache.deriveOnce({ key: 'hot', derive });
      await cache.deriveOnce({ key: `other${index}`, derive: async () => Buffer.from('x') });
    }

    expect(runs).toBe(1);
  });

  test('a failed derivation is not kept', async () => {
    const cache = new DerivedKeyCache();
    let attempts = 0;

    const derive = async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error('boom');
      }

      return Buffer.from('ok');
    };

    let message = '';

    try {
      await cache.deriveOnce({ key: 'flaky', derive });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toBe('boom');
    await Promise.resolve();

    const result = await cache.deriveOnce({ key: 'flaky', derive });
    expect(result.toString()).toBe('ok');
  });

  test('the key is a digest: the secret is not in it, and part boundaries matter', () => {
    const key = DerivedKeyCache.keyOf({ parts: ['sha256', 1, 32, 'salt', 'super-secret-value'] });

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('super-secret');
    expect(DerivedKeyCache.keyOf({ parts: ['ab', 'c'] })).not.toBe(
      DerivedKeyCache.keyOf({ parts: ['a', 'bc'] }),
    );
  });

  test('the key is keyed per process: it is stable here and is not the plain SHA-256 of the inputs', () => {
    const parts = ['sha256', 1, 32, 'salt', 'weak'];
    const plain = createHash('sha256')
      .update(parts.map((part) => `${String(part).length}:${String(part)}`).join(''))
      .digest('hex');

    expect(DerivedKeyCache.keyOf({ parts })).toBe(DerivedKeyCache.keyOf({ parts }));
    expect(DerivedKeyCache.keyOf({ parts })).not.toBe(plain);
  });
});
