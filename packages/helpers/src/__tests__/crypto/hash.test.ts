/** Hash / HMAC Test Suite */

import { describe, test, expect } from 'bun:test';
import C from 'node:crypto';
import { Hash } from '@/modules/crypto/algorithms';
import { HashAlgorithms, HashOutputEncodings } from '@/modules/crypto/common';
import type { THashAlgorithm, THashOutputEncoding } from '@/modules/crypto/common';

const MESSAGE = 'IGNIS hash test payload';
const SECRET = 'super-secret-hmac-key';

describe('Hash', () => {
  describe('Construction & Validation', () => {
    test('withAlgorithm constructs with a valid algorithm name', () => {
      const instance = Hash.withAlgorithm(HashAlgorithms.SHA256);
      expect(instance).toBeInstanceOf(Hash);
      expect(instance.algorithm).toBe('sha256');
    });

    test('throws on an empty algorithm name', () => {
      expect(() => new Hash({ algorithm: '' as any })).toThrow();
    });

    test('throws on an unknown algorithm name', () => {
      expect(() => new Hash({ algorithm: 'sha3-256' as any })).toThrow();
    });
  });

  describe('digest (plain, unkeyed)', () => {
    const algorithms: THashAlgorithm[] = [
      HashAlgorithms.MD5,
      HashAlgorithms.SHA1,
      HashAlgorithms.SHA256,
      HashAlgorithms.SHA384,
      HashAlgorithms.SHA512,
    ];

    for (const algorithm of algorithms) {
      test(`${algorithm}: matches node:crypto createHash hex digest`, () => {
        const expected = C.createHash(algorithm).update(MESSAGE).digest('hex');
        const actual = Hash.withAlgorithm(algorithm).digest({ message: MESSAGE });
        expect(actual).toBe(expected);
      });
    }

    test('default output encoding is hex', () => {
      const expected = C.createHash('sha256').update(MESSAGE).digest('hex');
      const actual = Hash.withAlgorithm(HashAlgorithms.SHA256).digest({ message: MESSAGE });
      expect(actual).toBe(expected);
    });

    const outputEncodings: THashOutputEncoding[] = [
      HashOutputEncodings.HEX,
      HashOutputEncodings.BASE64,
      HashOutputEncodings.BASE64URL,
    ];

    for (const outputEncoding of outputEncodings) {
      test(`honors outputEncoding=${outputEncoding}`, () => {
        const expected = C.createHash('sha256').update(MESSAGE).digest(outputEncoding);
        const actual = Hash.withAlgorithm(HashAlgorithms.SHA256).digest({
          message: MESSAGE,
          opts: { outputEncoding },
        });
        expect(actual).toBe(expected);
      });
    }

    test('is deterministic for the same input', () => {
      const hashHelper = Hash.withAlgorithm(HashAlgorithms.SHA256);
      const a = hashHelper.digest({ message: MESSAGE });
      const b = hashHelper.digest({ message: MESSAGE });
      expect(a).toBe(b);
    });

    test('different inputs produce different digests', () => {
      const hashHelper = Hash.withAlgorithm(HashAlgorithms.SHA256);
      const a = hashHelper.digest({ message: 'a' });
      const b = hashHelper.digest({ message: 'b' });
      expect(a).not.toBe(b);
    });

    test('digest has no secret parameter - a plain digest never requires one', () => {
      const hashHelper = Hash.withAlgorithm(HashAlgorithms.SHA256);
      expect(() => hashHelper.digest({ message: MESSAGE })).not.toThrow();
    });
  });

  describe('hmac (keyed)', () => {
    const algorithms: THashAlgorithm[] = [
      HashAlgorithms.MD5,
      HashAlgorithms.SHA1,
      HashAlgorithms.SHA256,
      HashAlgorithms.SHA384,
      HashAlgorithms.SHA512,
    ];

    for (const algorithm of algorithms) {
      test(`${algorithm}: matches node:crypto createHmac hex digest`, () => {
        const expected = C.createHmac(algorithm, SECRET).update(MESSAGE).digest('hex');
        const actual = Hash.withAlgorithm(algorithm).hmac({ message: MESSAGE, secret: SECRET });
        expect(actual).toBe(expected);
      });
    }

    const outputEncodings: THashOutputEncoding[] = [
      HashOutputEncodings.HEX,
      HashOutputEncodings.BASE64,
      HashOutputEncodings.BASE64URL,
    ];

    for (const outputEncoding of outputEncodings) {
      test(`honors outputEncoding=${outputEncoding}`, () => {
        const expected = C.createHmac('sha256', SECRET).update(MESSAGE).digest(outputEncoding);
        const actual = Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({
          message: MESSAGE,
          secret: SECRET,
          opts: { outputEncoding },
        });
        expect(actual).toBe(expected);
      });
    }

    test('FAILS CLOSED: throws when secret is missing (undefined)', () => {
      expect(() =>
        Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({
          message: MESSAGE,
          secret: undefined as unknown as string,
        }),
      ).toThrow();
    });

    test('FAILS CLOSED: throws when secret is an empty string', () => {
      expect(() =>
        Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: MESSAGE, secret: '' }),
      ).toThrow();
    });

    test('never returns the plaintext message when the secret is missing', () => {
      let caught: unknown;
      try {
        Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: MESSAGE, secret: '' });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect((caught as Error).message).not.toContain(MESSAGE);
    });

    test('different secrets produce different HMACs for the same message', () => {
      const hashHelper = Hash.withAlgorithm(HashAlgorithms.SHA256);
      const a = hashHelper.hmac({ message: MESSAGE, secret: 'secret-a' });
      const b = hashHelper.hmac({ message: MESSAGE, secret: 'secret-b' });
      expect(a).not.toBe(b);
    });
  });

  describe('HashAlgorithms / HashOutputEncodings const-classes', () => {
    test('HashAlgorithms.isValid recognizes every supported algorithm', () => {
      expect(HashAlgorithms.isValid('md5')).toBe(true);
      expect(HashAlgorithms.isValid('sha1')).toBe(true);
      expect(HashAlgorithms.isValid('sha256')).toBe(true);
      expect(HashAlgorithms.isValid('sha384')).toBe(true);
      expect(HashAlgorithms.isValid('sha512')).toBe(true);
      expect(HashAlgorithms.isValid('sha3-256')).toBe(false);
    });

    test('HashOutputEncodings.isValid recognizes every supported encoding', () => {
      expect(HashOutputEncodings.isValid('hex')).toBe(true);
      expect(HashOutputEncodings.isValid('base64')).toBe(true);
      expect(HashOutputEncodings.isValid('base64url')).toBe(true);
      expect(HashOutputEncodings.isValid('binary')).toBe(false);
    });
  });

  /**
   * Payment gateways compare our digest against one they computed themselves, so a change here is a
   * rejected transaction, not a failing assertion. Expected values come from `node:crypto` directly
   * rather than from this module, so the test cannot agree with a bug.
   */
  describe('wire-protocol digests stay byte-identical', () => {
    const QUERY = 'vnp_Amount=100000&vnp_Command=pay&vnp_TxnRef=ABC123';
    const SIGNING_KEY = 'MERCHANT_SECRET_KEY';

    test('MD5/hex - the VNPay checksum shape', () => {
      expect(Hash.withAlgorithm(HashAlgorithms.MD5).digest({ message: QUERY })).toBe(
        C.createHash('md5').update(QUERY).digest('hex'),
      );
    });

    test('HMAC-SHA256/base64 - the signed-request shape', () => {
      expect(
        Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({
          message: QUERY,
          secret: SIGNING_KEY,
          opts: { outputEncoding: HashOutputEncodings.BASE64 },
        }),
      ).toBe(C.createHmac('sha256', SIGNING_KEY).update(QUERY).digest('base64'));
    });

    test('HMAC-SHA256/hex - the same signature in the other encoding', () => {
      expect(
        Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({
          message: QUERY,
          secret: SIGNING_KEY,
          opts: { outputEncoding: HashOutputEncodings.HEX },
        }),
      ).toBe(C.createHmac('sha256', SIGNING_KEY).update(QUERY).digest('hex'));
    });

    test('withAlgorithm is memoized, so a hot path allocates nothing', () => {
      expect(Hash.withAlgorithm(HashAlgorithms.MD5)).toBe(Hash.withAlgorithm(HashAlgorithms.MD5));
      expect(Hash.withAlgorithm(HashAlgorithms.MD5)).not.toBe(
        Hash.withAlgorithm(HashAlgorithms.SHA256),
      );
    });
  });
});

describe('Hash - bytes and several parts', () => {
  const sha256 = Hash.withAlgorithm(HashAlgorithms.SHA256);
  const binaryKey = Uint8Array.from([0x00, 0xff, 0x80, 0x7f, 0xc3, 0x28, 0xa0, 0xa1, 0x01, 0xfe]);
  const textBytes = new TextEncoder().encode(MESSAGE);

  describe('hmac: the output is byte-identical whatever form the key and the message take', () => {
    // The printed QR tokens of a consumer depend on this: the same bytes must give the same token.
    test('a Buffer key gives the output of the text key with the same bytes', () => {
      const viaString = sha256.hmac({ message: MESSAGE, secret: SECRET });
      const viaBuffer = sha256.hmac({ message: MESSAGE, secret: Buffer.from(SECRET, 'utf8') });
      const viaBytes = sha256.hmac({ message: MESSAGE, secret: new TextEncoder().encode(SECRET) });

      expect(viaBuffer).toBe(viaString);
      expect(viaBytes).toBe(viaString);
      expect(viaString).toBe(C.createHmac('sha256', SECRET).update(MESSAGE).digest('hex'));
    });

    test('a binary key (not valid UTF-8) is the same for a Buffer and a Uint8Array, and equals node:crypto', () => {
      const viaBuffer = sha256.hmac({ message: MESSAGE, secret: Buffer.from(binaryKey) });
      const viaBytes = sha256.hmac({ message: MESSAGE, secret: binaryKey });

      expect(viaBytes).toBe(viaBuffer);
      expect(viaBuffer).toBe(
        C.createHmac('sha256', Buffer.from(binaryKey)).update(MESSAGE).digest('hex'),
      );
    });

    test('a message given as bytes gives the output of the text of the same bytes', () => {
      const viaText = sha256.hmac({ message: MESSAGE, secret: SECRET });

      expect(sha256.hmac({ message: textBytes, secret: SECRET })).toBe(viaText);
      expect(sha256.hmac({ message: Buffer.from(MESSAGE), secret: SECRET })).toBe(viaText);
    });

    test('matches the RFC 4231 test case 1 (a 20-byte binary key), in hex', () => {
      const key = Uint8Array.from(new Array(20).fill(0x0b));
      const message = new TextEncoder().encode('Hi There');

      expect(sha256.hmac({ message, secret: key })).toBe(
        'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
      );
    });

    test('an empty key is refused in every form', () => {
      for (const secret of ['', new Uint8Array(0), Buffer.alloc(0)]) {
        expect(() => sha256.hmac({ message: MESSAGE, secret })).toThrow(/Missing secret/);
      }
    });

    test('the output encodings are unchanged for a bytes key', () => {
      for (const outputEncoding of [HashOutputEncodings.HEX, HashOutputEncodings.BASE64] as const) {
        expect(sha256.hmac({ message: MESSAGE, secret: binaryKey, opts: { outputEncoding } })).toBe(
          C.createHmac('sha256', Buffer.from(binaryKey)).update(MESSAGE).digest(outputEncoding),
        );
      }
    });
  });

  describe('digest: bytes, and several parts in order', () => {
    test('bytes give the digest of the same text', () => {
      expect(sha256.digest({ message: textBytes })).toBe(sha256.digest({ message: MESSAGE }));
      expect(sha256.digest({ message: Buffer.from(MESSAGE) })).toBe(
        sha256.digest({ message: MESSAGE }),
      );
    });

    test('several parts are one message, in order', () => {
      const parts = ['IGNIS ', textBytes.slice(6, 10), ' hash test payload'.slice(0)];
      const joined = Buffer.concat(parts.map((part) => Buffer.from(part)));

      expect(sha256.digest({ message: parts })).toBe(
        C.createHash('sha256').update(joined).digest('hex'),
      );
      expect(sha256.digest({ message: ['a', 'b'] })).toBe(sha256.digest({ message: 'ab' }));
      expect(sha256.digest({ message: ['b', 'a'] })).not.toBe(sha256.digest({ message: 'ab' }));
    });

    test('a git blob: the header text, then the bytes, gives the id git would', () => {
      const content = new TextEncoder().encode('hello\n');
      const sha1 = Hash.withAlgorithm(HashAlgorithms.SHA1);

      // `printf 'hello\n' | git hash-object --stdin`
      expect(sha1.digest({ message: [`blob ${content.length}\0`, content] })).toBe(
        'ce013625030ba8dba906f756967f9e9ca394464a',
      );
    });

    test('an empty part changes nothing, and no parts is the digest of the empty message', () => {
      expect(sha256.digest({ message: ['', MESSAGE, new Uint8Array(0)] })).toBe(
        sha256.digest({ message: MESSAGE }),
      );
      expect(sha256.digest({ message: [] })).toBe(sha256.digest({ message: '' }));
    });

    test('the existing text form is unchanged: it still equals node:crypto createHash', () => {
      const algorithms: THashAlgorithm[] = [
        HashAlgorithms.MD5,
        HashAlgorithms.SHA256,
        HashAlgorithms.SHA512,
      ];

      for (const algorithm of algorithms) {
        expect(Hash.withAlgorithm(algorithm).digest({ message: MESSAGE })).toBe(
          C.createHash(algorithm).update(MESSAGE).digest('hex'),
        );
      }
    });
  });
});
