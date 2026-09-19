import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createUuidV7, uuidV7 } from '@/modules/uid';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const timestampOf = (opts: { id: string }): number =>
  Number.parseInt(opts.id.slice(0, 8) + opts.id.slice(9, 13), 16);

const firstUnordered = (opts: { ids: string[] }): number => {
  const { ids } = opts;
  for (let index = 1; index < ids.length; index++) {
    if (ids[index] <= ids[index - 1]) {
      return index;
    }
  }
  return -1;
};

/** Built with `Bun.randomUUIDv7` hidden, so the `getRandomValues` path a browser takes is the one tested. */
const buildFallback = (): (() => string) => {
  const native = Bun.randomUUIDv7;
  Bun.randomUUIDv7 = undefined as never;

  try {
    return createUuidV7();
  } finally {
    Bun.randomUUIDv7 = native;
  }
};

const generateMany = (opts: { generator: () => string; count: number }): string[] =>
  Array.from({ length: opts.count }, () => opts.generator());

afterEach(() => {
  spyOn(Date, 'now').mockRestore();
});

test('one shared sequence per realm, so every caller draws from the same counter', () => {
  const ids = Array.from({ length: 2_000 }, () => uuidV7());

  expect(ids).toEqual([...ids].sort());
  expect(new Set(ids).size).toBe(ids.length);
});

const paths = [
  { name: 'native Bun.randomUUIDv7', build: () => uuidV7 },
  { name: 'getRandomValues fallback', build: buildFallback },
];

for (const path of paths) {
  describe(`uuidV7 - ${path.name}`, () => {
    test('RFC 9562 version 7 shape: version nibble 7, variant 10xx, lowercase hex', () => {
      const ids = generateMany({ generator: path.build(), count: 1000 });

      expect(ids.filter(id => !UUID_V7.test(id))).toEqual([]);
    });

    // A burst borrows the next millisecond when the 4096-step counter runs out, so an id minted
    // after 100k of them reads slightly ahead of the wall clock - measured 29 ms on the native path.
    test('the first 48 bits are the unix time in milliseconds', () => {
      const generate = path.build();
      const before = Date.now();
      const id = generate();
      const after = Date.now();

      expect(timestampOf({ id })).toBeGreaterThanOrEqual(before);
      expect(timestampOf({ id })).toBeLessThanOrEqual(after + 1000);
    });

    test('100k ids in a row sort as text in generation order, with no duplicate', () => {
      const ids = generateMany({ generator: path.build(), count: 100_000 });

      expect(firstUnordered({ ids })).toBe(-1);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
}

describe('uuidV7 - fallback clock handling', () => {
  test('10k ids inside one frozen millisecond stay ordered past the 4096-step counter', () => {
    const generate = buildFallback();
    spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);

    const ids = generateMany({ generator: generate, count: 10_000 });

    expect(firstUnordered({ ids })).toBe(-1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('a clock that steps backwards never makes a later id sort earlier', () => {
    const generate = buildFallback();
    const clock = spyOn(Date, 'now').mockReturnValue(1_900_000_000_000);
    const first = generateMany({ generator: generate, count: 10 });

    clock.mockReturnValue(1_899_999_990_000);
    const second = generateMany({ generator: generate, count: 10 });

    expect(firstUnordered({ ids: [...first, ...second] })).toBe(-1);
  });
});
