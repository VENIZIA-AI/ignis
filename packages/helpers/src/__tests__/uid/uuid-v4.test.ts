import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createUuidV4 } from '@/modules/uid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Built with `crypto.randomUUID` absent - a page on a plain-http origin - so the pool path runs. */
const buildFallback = (): (() => string) => {
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    return createUuidV4();
  } finally {
    Reflect.deleteProperty(crypto, 'randomUUID');
  }
};

afterEach(() => {
  spyOn(crypto, 'getRandomValues').mockRestore();
});

describe('uuidV4 - getRandomValues fallback', () => {
  test('draws its entropy from getRandomValues, not randomUUID', () => {
    const draws = spyOn(crypto, 'getRandomValues');
    const generate = buildFallback();

    generate();

    expect(draws).toHaveBeenCalled();
  });

  // 256 ids per pool, so 10k crosses about 40 refills.
  test('10k ids are RFC 9562 v4 and none repeats, across pool refills', () => {
    const generate = buildFallback();
    const ids = Array.from({ length: 10_000 }, () => generate());

    expect(ids.filter(id => !UUID_V4.test(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every random position varies - no block is constant', () => {
    const generate = buildFallback();
    const ids = Array.from({ length: 2_000 }, () => generate().replaceAll('-', ''));

    // Position 12 is the version nibble; 16 carries the two variant bits, so only 4 values.
    const constantPositions: Array<number> = [];
    for (let position = 0; position < 32; position++) {
      if (position === 12) {
        continue;
      }

      const seen = new Set(ids.map(id => id[position]));
      const floor = position === 16 ? 4 : 16;
      if (seen.size < floor) {
        constantPositions.push(position);
      }
    }

    expect(constantPositions).toEqual([]);
  });
});
