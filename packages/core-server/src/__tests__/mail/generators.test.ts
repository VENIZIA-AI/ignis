import { afterEach, describe, expect, test } from 'bun:test';
import { MailMimeUtility } from '@/components/mail/utilities';
import { NumericCodeGenerator } from '@/components/mail/services/generators/numeric-code';
import { RandomTokenGenerator } from '@/components/mail/services/generators/random-token';

/** The values of `crypto.getRandomValues` the next calls return, one array of bytes per call; real bytes after that. */
const realGetRandomValues = crypto.getRandomValues.bind(crypto);
const scriptDraws = (draws: ReadonlyArray<ReadonlyArray<number>>): { calls: () => number } => {
  let call = 0;
  const patched = <T extends ArrayBufferView | null>(array: T): T => {
    const scripted = draws[call];
    call += 1;
    if (!scripted || array === null) {
      return realGetRandomValues(array);
    }

    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(scripted);
    return array;
  };
  Object.defineProperty(crypto, 'getRandomValues', {
    value: patched,
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

describe('NumericCodeGenerator', () => {
  const generator = new NumericCodeGenerator();

  test('a code has exactly the length asked for and only digits', () => {
    for (const length of [1, 4, 6, 8, 10, 14]) {
      for (let i = 0; i < 50; i++) {
        expect(generator.generateCode(length)).toMatch(new RegExp(`^[0-9]{${length}}$`));
      }
    }
  });

  test('a small value is padded with leading zeros', () => {
    scriptDraws([[0, 0, 0, 0, 0, 42]]);

    expect(generator.generateCode(6)).toBe('000042');
  });

  test('a draw in the biased tail is thrown away and drawn again', () => {
    // max 10 over 48 bits: the biased tail is [2 ** 48 - 6, 2 ** 48), so six bytes of 0xff are refused.
    const draws = scriptDraws([
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      [0, 0, 0, 0, 0, 7],
    ]);

    expect(generator.generateCode(1)).toBe('7');
    expect(draws.calls()).toBe(2);
  });

  test('the last accepted draw is used, the first refused one is not', () => {
    const accepted = 2 ** 48 - 7; // the largest value below the limit for max 10
    const bytes = [...new Uint8Array(new BigUint64Array([BigInt(accepted)]).buffer)]
      .slice(0, 6)
      .reverse();
    const draws = scriptDraws([bytes]);

    expect(generator.generateCode(1)).toBe(String(accepted % 10));
    expect(draws.calls()).toBe(1);
  });

  test('a draw exactly at the limit is refused, the one below it is not', () => {
    // max 10: the limit is 2 ** 48 - 6, so that value is in the biased tail and is drawn again.
    const limit = 2 ** 48 - 6;
    const toBytes = (value: number) =>
      [...new Uint8Array(new BigUint64Array([BigInt(value)]).buffer)].slice(0, 6).reverse();
    const draws = scriptDraws([toBytes(limit), toBytes(limit - 1)]);

    expect(generator.generateCode(1)).toBe(String((limit - 1) % 10));
    expect(draws.calls()).toBe(2);
  });

  test('every digit comes up about equally often (chi-square, 9 degrees of freedom)', () => {
    const counts = new Array<number>(10).fill(0);
    const draws = 30_000;
    for (let i = 0; i < draws; i++) {
      counts[Number(generator.generateCode(1))] += 1;
    }

    const expected = draws / 10;
    const chiSquare = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);

    // 60 is far past the 0.001 critical value (27.9): a uniform source fails this about never, a biased one always.
    expect(chiSquare).toBeLessThan(60);
  });

  test('a length whose range does not fit in 48 bits is refused', () => {
    expect(() => generator.generateCode(15)).toThrow();
  });

  test('a length that is not a positive integer is refused', () => {
    expect(() => generator.generateCode(-1)).toThrow();
    expect(() => generator.generateCode(Number.NaN)).toThrow();
    expect(() => generator.generateCode(1.5)).toThrow();
  });
});

describe('RandomTokenGenerator', () => {
  const generator = new RandomTokenGenerator();

  test('a token is base64url text of the bytes asked for', () => {
    const token = generator.generateToken(32);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  test('two tokens differ', () => {
    expect(generator.generateToken(16)).not.toBe(generator.generateToken(16));
  });

  test('a size that is not a non-negative integer is refused, not turned into an empty token', () => {
    for (const size of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, undefined, null, '8']) {
      expect(() => generator.generateToken(size as unknown as number)).toThrow();
    }
  });

  test('no bytes is the empty text', () => {
    expect(generator.generateToken(0)).toBe('');
  });

  test('a token longer than one fill of getRandomValues is random all the way through', () => {
    const bytes = Buffer.from(generator.generateToken(150_000), 'base64url');

    expect(bytes).toHaveLength(150_000);
    for (const start of [0, 65_536, 131_072]) {
      expect(bytes.subarray(start, start + 1_000).some((byte) => byte !== 0)).toBe(true);
    }
  });
});

describe('the MIME message ids', () => {
  const buildRaw = async () => {
    const raw = await MailMimeUtility.buildRawMessage({
      message: {
        from: 'a@example.com',
        to: 'b@example.com',
        subject: 'ids',
        text: 'plain',
        html: '<p>html</p>',
      },
    });
    return raw.toString('utf-8');
  };

  test('Message-ID is 16 random bytes in hex, and differs between messages', async () => {
    const first = await buildRaw();
    const second = await buildRaw();
    const idOf = (raw: string) =>
      raw.match(/\r\nMessage-ID: <([0-9a-f]{32})@example\.com>\r\n/)?.[1];

    expect(idOf(first)).toBeDefined();
    expect(idOf(first)).not.toBe(idOf(second));
  });

  test('a multipart boundary is 12 random bytes in hex after its label', async () => {
    const raw = await buildRaw();

    expect(raw).toMatch(/boundary="?----=_Alt_[0-9a-f]{24}"?/);
  });
});
