import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { UuidV7Generator } from '@/modules/uid';

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
const buildFallback = (): UuidV7Generator => {
  const native = Bun.randomUUIDv7;
  Bun.randomUUIDv7 = undefined as never;

  try {
    return new UuidV7Generator();
  } finally {
    Bun.randomUUIDv7 = native;
  }
};

const generateMany = (opts: { generator: UuidV7Generator; count: number }): string[] =>
  Array.from({ length: opts.count }, () => opts.generator.nextId());

afterEach(() => {
  spyOn(Date, 'now').mockRestore();
});

test('one shared instance, so every caller draws from one ordered sequence', () => {
  expect(UuidV7Generator.getInstance()).toBe(UuidV7Generator.getInstance());
});

const paths = [
  { name: 'native Bun.randomUUIDv7', build: () => UuidV7Generator.getInstance() },
  { name: 'getRandomValues fallback', build: buildFallback },
];

for (const path of paths) {
  describe(`UuidV7Generator - ${path.name}`, () => {
    test('RFC 9562 version 7 shape: version nibble 7, variant 10xx, lowercase hex', () => {
      const ids = generateMany({ generator: path.build(), count: 1000 });

      expect(ids.filter(id => !UUID_V7.test(id))).toEqual([]);
    });

    test('the first 48 bits are the unix time in milliseconds', () => {
      const generator = path.build();
      const before = Date.now();
      const id = generator.nextId();
      const after = Date.now();

      expect(timestampOf({ id })).toBeGreaterThanOrEqual(before);
      expect(timestampOf({ id })).toBeLessThanOrEqual(after + 1);
    });

    test('100k ids in a row sort as text in generation order, with no duplicate', () => {
      const ids = generateMany({ generator: path.build(), count: 100_000 });

      expect(firstUnordered({ ids })).toBe(-1);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
}

describe('UuidV7Generator - fallback clock handling', () => {
  test('10k ids inside one frozen millisecond stay ordered past the 4096-step counter', () => {
    const generator = buildFallback();
    spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);

    const ids = generateMany({ generator, count: 10_000 });

    expect(firstUnordered({ ids })).toBe(-1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('a clock that steps backwards never makes a later id sort earlier', () => {
    const generator = buildFallback();
    const clock = spyOn(Date, 'now').mockReturnValue(1_900_000_000_000);
    const first = generateMany({ generator, count: 10 });

    clock.mockReturnValue(1_899_999_990_000);
    const second = generateMany({ generator, count: 10 });

    expect(firstUnordered({ ids: [...first, ...second] })).toBe(-1);
  });
});
