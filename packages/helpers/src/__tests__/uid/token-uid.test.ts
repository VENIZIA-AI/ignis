import { describe, expect, test } from 'bun:test';
import { crc32 } from 'node:zlib';
import {
  DEFAULT_TOKEN_BYTES,
  MIN_TOKEN_BYTES,
  type ITokenUidOptions,
  TokenUidHelper,
  UidAlphabets,
  UidTokenEncodings,
} from '@/modules/uid';
import { Crc32 } from '@/modules/uid/common/crc32';
import { UidRandom } from '@/modules/uid/common/random';

const realGetRandomValues = crypto.getRandomValues.bind(crypto);

/** Makes the next `crypto.getRandomValues` calls fill the given bytes, then restores the real one. */
const scriptBytes = (bytes: ReadonlyArray<number>) => {
  Object.defineProperty(crypto, 'getRandomValues', {
    value: <T extends ArrayBufferView | null>(array: T): T => {
      new Uint8Array(array!.buffer, array!.byteOffset, array!.byteLength).set(
        bytes.slice(0, array!.byteLength),
      );

      return array;
    },
    configurable: true,
    writable: true,
  });

  return () =>
    Object.defineProperty(crypto, 'getRandomValues', {
      value: realGetRandomValues,
      configurable: true,
      writable: true,
    });
};

describe('TokenUidHelper - the default', () => {
  test('32 bytes of BASE62 is 43 characters of the base62 alphabet', () => {
    const helper = new TokenUidHelper();

    for (let i = 0; i < 200; i++) {
      expect(helper.nextId()).toMatch(/^[0-9A-Za-z]{43}$/);
    }

    expect(DEFAULT_TOKEN_BYTES).toBe(32);
  });

  test('two tokens differ', () => {
    const helper = new TokenUidHelper();

    expect(helper.nextId()).not.toBe(helper.nextId());
  });
});

describe('TokenUidHelper - length per bytes and encoding', () => {
  // ceil(bytes * 8 / log2(62)): log2(62) = 5.9542, worked out by hand.
  test.each([
    { bytes: 16, length: 22 },
    { bytes: 24, length: 33 },
    { bytes: 32, length: 43 },
    { bytes: 48, length: 65 },
    { bytes: 64, length: 86 },
  ])('BASE62, $bytes bytes is $length characters', ({ bytes, length }) => {
    const token = new TokenUidHelper({ bytes }).nextId();

    expect(token).toHaveLength(length);
    expect(token).toMatch(/^[0-9A-Za-z]+$/);
  });

  test.each([
    { bytes: 16, length: 32 },
    { bytes: 17, length: 34 },
    { bytes: 32, length: 64 },
  ])('HEX, $bytes bytes is $length lowercase hex characters', ({ bytes, length }) => {
    const token = new TokenUidHelper({ bytes, encoding: UidTokenEncodings.HEX }).nextId();

    expect(token).toMatch(new RegExp(`^[0-9a-f]{${length}}$`));
  });

  // ceil(bytes * 4 / 3), no padding: 16 -> 22, 17 -> 23, 18 -> 24, 32 -> 43.
  test.each([
    { bytes: 16, length: 22 },
    { bytes: 17, length: 23 },
    { bytes: 18, length: 24 },
    { bytes: 32, length: 43 },
  ])('BASE64URL, $bytes bytes is $length characters without padding', ({ bytes, length }) => {
    const token = new TokenUidHelper({ bytes, encoding: UidTokenEncodings.BASE64URL }).nextId();

    expect(token).toMatch(new RegExp(`^[A-Za-z0-9_-]{${length}}$`));
  });
});

describe('TokenUidHelper - encodings match the platform encoders', () => {
  const sample = Uint8Array.from({ length: 33 }, (_, index) => (index * 37 + 11) % 256);

  test.each([{ bytes: 16 }, { bytes: 17 }, { bytes: 18 }, { bytes: 33 }])(
    'BASE64URL of $bytes scripted bytes equals Buffer base64url',
    ({ bytes }) => {
      const restore = scriptBytes([...sample]);

      try {
        const token = new TokenUidHelper({
          bytes,
          encoding: UidTokenEncodings.BASE64URL,
        }).nextId();

        expect(token).toBe(Buffer.from(sample.subarray(0, bytes)).toString('base64url'));
      } finally {
        restore();
      }
    },
  );

  test('HEX of scripted bytes equals Buffer hex, including bytes below 0x10', () => {
    const restore = scriptBytes([0x00, 0x0a, 0xff, ...sample.subarray(3, 16)]);

    try {
      const token = new TokenUidHelper({ bytes: 16, encoding: UidTokenEncodings.HEX }).nextId();

      expect(token).toBe(
        Buffer.from([0x00, 0x0a, 0xff, ...sample.subarray(3, 16)]).toString('hex'),
      );
      expect(token.startsWith('000aff')).toBe(true);
    } finally {
      restore();
    }
  });
});

describe('TokenUidHelper - BASE62 sampling is unbiased', () => {
  test('every one of the 62 characters appears, at roughly equal frequency', () => {
    const helper = new TokenUidHelper();
    const counts = new Map<string, number>();
    const tokens = 3_000;

    for (let i = 0; i < tokens; i++) {
      for (const character of helper.nextId()) {
        counts.set(character, (counts.get(character) ?? 0) + 1);
      }
    }

    expect(counts.size).toBe(62);

    const expected = (tokens * 43) / 62;

    for (const character of UidAlphabets.BASE62) {
      // About 2,080 each; 6 standard deviations is roughly 270. A biased `byte % 62` is off by 25%.
      expect(Math.abs((counts.get(character) ?? 0) - expected)).toBeLessThan(300);
    }
  });
});

describe('TokenUidHelper - prefix and delimiter', () => {
  test('a prefix runs straight into the body when the delimiter is off', () => {
    const token = new TokenUidHelper({ prefix: { enable: true, value: 'sk' } }).nextId();

    expect(token).toMatch(/^sk[0-9A-Za-z]{43}$/);
  });

  test('the default delimiter is `_`, and `_` works with BASE62', () => {
    const token = new TokenUidHelper({
      prefix: { enable: true, value: 'sk' },
      delimiter: { enable: true },
    }).nextId();

    expect(token).toMatch(/^sk_[0-9A-Za-z]{43}$/);
  });

  test('`-` works as a delimiter with BASE62', () => {
    const token = new TokenUidHelper({
      prefix: { enable: true, value: 'sk' },
      delimiter: { enable: true, value: '-' },
    }).nextId();

    expect(token).toMatch(/^sk-[0-9A-Za-z]{43}$/);
  });

  test('`_` and `-` work with HEX', () => {
    for (const value of ['_', '-']) {
      const token = new TokenUidHelper({
        encoding: UidTokenEncodings.HEX,
        prefix: { enable: true, value: 'sk' },
        delimiter: { enable: true, value },
      }).nextId();

      expect(token).toMatch(new RegExp(`^sk${value}[0-9a-f]{64}$`));
    }
  });

  test('BASE64URL with a delimiter is refused, and the error says what to do', () => {
    for (const value of ['_', '-']) {
      expect(
        () =>
          new TokenUidHelper({
            encoding: UidTokenEncodings.BASE64URL,
            prefix: { enable: true, value: 'sk' },
            delimiter: { enable: true, value },
          }),
      ).toThrow(/shares characters with the alphabet[\s\S]*BASE62/);
    }
  });

  test('BASE64URL takes a delimiter outside its alphabet', () => {
    const token = new TokenUidHelper({
      encoding: UidTokenEncodings.BASE64URL,
      prefix: { enable: true, value: 'sk' },
      delimiter: { enable: true, value: '.' },
    }).nextId();

    expect(token).toMatch(/^sk\.[A-Za-z0-9_-]{43}$/);
  });

  test('a per-call prefix replaces the configured one and turns the prefix on', () => {
    const helper = new TokenUidHelper({
      prefix: { enable: true, value: 'sk' },
      delimiter: { enable: true },
    });

    expect(helper.nextId({ prefix: 'pk' })).toMatch(/^pk_/);

    const plain = new TokenUidHelper({ delimiter: { enable: false } });
    expect(plain.nextId({ prefix: 'pk' })).toMatch(/^pk[0-9A-Za-z]{43}$/);
  });

  test('a per-call EMPTY prefix is refused', () => {
    expect(() => new TokenUidHelper().nextId({ prefix: '' })).toThrow(/empty prefix/);
  });

  test('a delimiter with no prefix, and an enabled prefix with no value, are refused', () => {
    expect(() => new TokenUidHelper({ delimiter: { enable: true } })).toThrow(
      /delimiter is enabled without a prefix/,
    );
    expect(() => new TokenUidHelper({ prefix: { enable: true } })).toThrow(/carries no value/);
  });
});

describe('TokenUidHelper - what the constructor refuses', () => {
  test('fewer than 16 bytes', () => {
    expect(MIN_TOKEN_BYTES).toBe(16);

    for (const bytes of [0, 1, 8, 15]) {
      expect(() => new TokenUidHelper({ bytes })).toThrow(/at least 16/);
    }

    expect(() => new TokenUidHelper({ bytes: 16 })).not.toThrow();
  });

  test('a bytes value that is not a safe integer', () => {
    for (const bytes of [Number.NaN, Number.POSITIVE_INFINITY, 16.5, -32, 2 ** 53]) {
      expect(() => new TokenUidHelper({ bytes })).toThrow();
    }
  });

  test('an unknown encoding', () => {
    expect(
      () => new TokenUidHelper({ encoding: 'base32' as unknown as typeof UidTokenEncodings.HEX }),
    ).toThrow(/Unknown encoding/);
  });
});

describe('UidTokenEncodings', () => {
  test('isValid accepts the three encodings and nothing else', () => {
    expect(UidTokenEncodings.isValid('base62')).toBe(true);
    expect(UidTokenEncodings.isValid('hex')).toBe(true);
    expect(UidTokenEncodings.isValid('base64url')).toBe(true);
    expect(UidTokenEncodings.isValid('base64')).toBe(false);
  });
});

describe('UidRandom', () => {
  test('bytes is longer than one getRandomValues call allows and is random all the way through', () => {
    const bytes = UidRandom.bytes({ count: 150_000 });

    expect(bytes).toHaveLength(150_000);

    for (const start of [0, 65_536, 131_072]) {
      expect(bytes.subarray(start, start + 1_000).some((byte) => byte !== 0)).toBe(true);
    }
  });

  test('bytes without Web Crypto throws instead of falling back to Math.random', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    try {
      expect(() => UidRandom.bytes({ count: 8 })).toThrow(/No Web Crypto available/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', descriptor!);
    }
  });

  test('below refuses a max that is not an integer from 1 to 2 ** 48', () => {
    for (const max of [0, -1, 1.5, Number.NaN, 2 ** 48 + 1]) {
      expect(() => UidRandom.below({ max })).toThrow(/Invalid max/);
    }

    expect(UidRandom.below({ max: 1 })).toBe(0);
  });
});

describe('Crc32', () => {
  test.each([
    { text: '', expected: 0 },
    { text: '123456789', expected: 0xcbf43926 },
    { text: 'a', expected: 0xe8b7be43 },
    { text: 'The quick brown fox jumps over the lazy dog', expected: 0x414fa339 },
  ])('the CRC-32 of "$text" is the published vector', ({ text, expected }) => {
    expect(Crc32.of({ text })).toBe(expected);
  });

  test('agrees with node:zlib on a spread of inputs', () => {
    for (let length = 0; length < 200; length += 7) {
      const text = Array.from({ length }, (_, index) =>
        String.fromCharCode(33 + ((index * 5 + length) % 90)),
      ).join('');

      expect(Crc32.of({ text })).toBe(crc32(text));
    }
  });
});

describe('TokenUidHelper - checksum', () => {
  const BASE62_DIGITS = UidAlphabets.BASE62;

  /** CRC-32 as base62 and as hex, written out from first principles in the test. */
  const base62Of = (value: number): string => {
    let remaining = value;
    let text = '';

    while (remaining > 0) {
      text = BASE62_DIGITS[remaining % 62] + text;
      remaining = Math.floor(remaining / 62);
    }

    return text.padStart(6, '0');
  };

  test('off by default: the token is just the body', () => {
    expect(new TokenUidHelper().nextId()).toHaveLength(43);
  });

  test('BASE62: the last 6 characters are the CRC-32 of the body, in base62, padded', () => {
    const helper = new TokenUidHelper({ checksum: true });

    for (let i = 0; i < 100; i++) {
      const token = helper.nextId();
      const body = token.slice(0, 43);

      expect(token).toHaveLength(49);
      expect(token.slice(43)).toBe(base62Of(crc32(body)));
    }
  });

  test('BASE62: a CRC-32 that is small keeps its six characters', () => {
    // 62 ** 6 is more than 2 ** 32, and a short value is padded with '0', the first base62 digit.
    expect(base62Of(0)).toBe('000000');
    expect(base62Of(61)).toBe('00000z');
  });

  test('HEX: the last 8 characters are the CRC-32 of the body as hex', () => {
    const helper = new TokenUidHelper({ encoding: UidTokenEncodings.HEX, checksum: true });

    for (let i = 0; i < 100; i++) {
      const token = helper.nextId();
      const body = token.slice(0, 64);

      expect(token).toHaveLength(72);
      expect(token.slice(64)).toBe(crc32(body).toString(16).padStart(8, '0'));
    }
  });

  test('the checksum covers the body only: a per-call prefix does not change it', () => {
    const restore = scriptBytes(Array.from({ length: 32 }, (_, index) => index * 7));

    try {
      const helper = new TokenUidHelper({
        prefix: { enable: true, value: 'sk' },
        delimiter: { enable: true },
        checksum: true,
      });
      const first = helper.nextId({ prefix: 'aaa' });
      const second = helper.nextId({ prefix: 'zzzzzz' });

      // The same scripted bytes: only the head differs.
      expect(first.slice('aaa_'.length)).toBe(second.slice('zzzzzz_'.length));
    } finally {
      restore();
    }
  });

  test('checksum with BASE64URL is refused, with a message that names the options', () => {
    expect(
      () => new TokenUidHelper({ encoding: UidTokenEncodings.BASE64URL, checksum: true }),
    ).toThrow(/checksum is not available with the 'base64url' encoding[\s\S]*BASE62/);
  });

  test('a checksum that is not a boolean is refused, not read as truthy', () => {
    expect(() => new TokenUidHelper({ checksum: 'false' as unknown as boolean })).toThrow(
      /checksum must be a boolean/,
    );
  });
});

describe('TokenUidHelper - isWellFormed', () => {
  const variants: Array<{ name: string; options: ITokenUidOptions }> = [
    { name: 'BASE62', options: {} },
    { name: 'BASE62 with a checksum', options: { checksum: true } },
    {
      name: 'BASE62 with prefix and delimiter',
      options: { prefix: { enable: true, value: 'sk' }, delimiter: { enable: true } },
    },
    {
      name: 'BASE62 with prefix, delimiter and checksum',
      options: {
        prefix: { enable: true, value: 'sk' },
        delimiter: { enable: true },
        checksum: true,
      },
    },
    { name: 'HEX', options: { encoding: UidTokenEncodings.HEX } },
    {
      name: 'HEX with prefix and checksum',
      options: {
        encoding: UidTokenEncodings.HEX,
        prefix: { enable: true, value: 'sk' },
        delimiter: { enable: true, value: '-' },
        checksum: true,
      },
    },
    { name: 'BASE64URL', options: { encoding: UidTokenEncodings.BASE64URL } },
    { name: '16 bytes', options: { bytes: 16, checksum: true } },
  ];

  test.each(variants)(
    'round trip: isWellFormed({ key: nextId() }) is true - $name',
    ({ options }) => {
      const helper = new TokenUidHelper(options);

      for (let i = 0; i < 50; i++) {
        expect(helper.isWellFormed({ key: helper.nextId() })).toBe(true);
      }
    },
  );

  test.each(variants.filter(({ options }) => 'checksum' in options))(
    'one changed character is false - $name',
    ({ options }) => {
      const helper = new TokenUidHelper(options);
      const token = helper.nextId();

      for (const position of [token.length - 1, token.length - 8, token.length - 20]) {
        const original = token[position];
        const replacement = original === '1' ? '2' : '1';
        const changed = token.slice(0, position) + replacement + token.slice(position + 1);

        expect(helper.isWellFormed({ key: changed })).toBe(false);
      }
    },
  );

  test('a missing character, an extra character and a swapped pair are false', () => {
    const helper = new TokenUidHelper({ checksum: true });
    const token = helper.nextId();

    expect(helper.isWellFormed({ key: token.slice(0, -1) })).toBe(false);
    expect(helper.isWellFormed({ key: token.slice(1) })).toBe(false);
    expect(helper.isWellFormed({ key: `${token}a` })).toBe(false);

    // Find a pair of different neighbours in the body and swap them.
    let swapped = token;

    for (let index = 0; index < 42; index++) {
      if (token[index] !== token[index + 1]) {
        swapped = `${token.slice(0, index)}${token[index + 1]}${token[index]}${token.slice(index + 2)}`;
        break;
      }
    }

    expect(swapped).not.toBe(token);
    expect(helper.isWellFormed({ key: swapped })).toBe(false);
  });

  test('a wrong prefix, a missing prefix and a wrong delimiter are false', () => {
    const helper = new TokenUidHelper({
      prefix: { enable: true, value: 'sk' },
      delimiter: { enable: true },
      checksum: true,
    });
    const token = helper.nextId();
    const rest = token.slice('sk_'.length);

    expect(helper.isWellFormed({ key: `pk_${rest}` })).toBe(false);
    expect(helper.isWellFormed({ key: rest })).toBe(false);
    expect(helper.isWellFormed({ key: `sk-${rest}` })).toBe(false);
    expect(helper.isWellFormed({ key: `SK_${rest}` })).toBe(false);
  });

  test('a body outside the alphabet is false, even at the right length', () => {
    const hex = new TokenUidHelper({ encoding: UidTokenEncodings.HEX });

    expect(hex.isWellFormed({ key: 'g'.repeat(64) })).toBe(false);
    expect(hex.isWellFormed({ key: 'A'.repeat(64) })).toBe(false);
    expect(hex.isWellFormed({ key: 'a'.repeat(64) })).toBe(true);
  });

  test('garbage never throws: it is false', () => {
    const helper = new TokenUidHelper({ checksum: true });

    for (const value of ['', ' ', 'sk_', '💥'.repeat(30), null, undefined, 42, {}, []]) {
      expect(helper.isWellFormed({ key: value as unknown as string })).toBe(false);
    }
  });

  test('a well-formed token is still not authentic: anyone can compute the checksum', () => {
    const helper = new TokenUidHelper({ encoding: UidTokenEncodings.HEX, checksum: true });
    const body = 'ab'.repeat(32);
    const forged = body + crc32(body).toString(16).padStart(8, '0');

    expect(helper.isWellFormed({ key: forged })).toBe(true);
  });
});
