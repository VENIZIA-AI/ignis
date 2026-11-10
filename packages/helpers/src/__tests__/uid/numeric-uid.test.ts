import { afterEach, describe, expect, test } from 'bun:test';
import { DEFAULT_NUMERIC_LENGTH, NumericUidHelper } from '@/modules/uid';

const realGetRandomValues = crypto.getRandomValues.bind(crypto);

/** The bytes of each `crypto.getRandomValues` call, one array per call; real bytes once the script runs out. */
const scriptDraws = (draws: ReadonlyArray<ReadonlyArray<number>>): { calls: () => number } => {
  let call = 0;

  Object.defineProperty(crypto, 'getRandomValues', {
    value: <T extends ArrayBufferView | null>(array: T): T => {
      const scripted = draws[call];
      call += 1;

      if (!scripted || array === null) {
        return realGetRandomValues(array);
      }

      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(scripted);

      return array;
    },
    configurable: true,
    writable: true,
  });

  return { calls: () => call };
};

afterEach(() => {
  Object.defineProperty(crypto, 'getRandomValues', {
    value: realGetRandomValues,
    configurable: true,
    writable: true,
  });
});

describe('NumericUidHelper', () => {
  test('the default is six digits', () => {
    expect(DEFAULT_NUMERIC_LENGTH).toBe(6);

    for (let i = 0; i < 100; i++) {
      expect(new NumericUidHelper().nextId()).toMatch(/^[0-9]{6}$/);
    }
  });

  test('a code has exactly the length asked for, from 1 to 14, and only digits', () => {
    for (const length of [1, 2, 4, 8, 10, 14]) {
      const helper = new NumericUidHelper({ length });

      for (let i = 0; i < 50; i++) {
        expect(helper.nextId()).toMatch(new RegExp(`^[0-9]{${length}}$`));
      }
    }
  });

  test('a small value is padded with leading zeros', () => {
    scriptDraws([[0, 0, 0, 0, 0, 42]]);

    expect(new NumericUidHelper({ length: 6 }).nextId()).toBe('000042');
  });

  test('a draw in the biased tail is thrown away and drawn again', () => {
    // max 10 over 48 bits: the biased tail is [2 ** 48 - 6, 2 ** 48), so six bytes of 0xff are refused.
    const draws = scriptDraws([
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      [0, 0, 0, 0, 0, 7],
    ]);

    expect(new NumericUidHelper({ length: 1 }).nextId()).toBe('7');
    expect(draws.calls()).toBe(2);
  });

  test('every digit comes up about equally often (chi-square, 9 degrees of freedom)', () => {
    const helper = new NumericUidHelper({ length: 1 });
    const counts = new Array<number>(10).fill(0);
    const draws = 30_000;

    for (let i = 0; i < draws; i++) {
      counts[Number(helper.nextId())] += 1;
    }

    const expected = draws / 10;
    const chiSquare = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);

    // 60 is far past the 0.001 critical value (27.9): a uniform source fails this about never, a biased one always.
    expect(chiSquare).toBeLessThan(60);
  });

  test('a length whose range does not fit in 48 bits is refused when the helper is built', () => {
    expect(() => new NumericUidHelper({ length: 15 })).toThrow(/Invalid length/);
  });

  test('a length that is not a positive integer is refused', () => {
    for (const length of [-1, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() => new NumericUidHelper({ length })).toThrow(/Invalid length/);
    }
  });
});
