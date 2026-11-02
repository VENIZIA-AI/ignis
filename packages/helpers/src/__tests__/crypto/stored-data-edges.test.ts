import { describe, expect, spyOn, test } from 'bun:test';
// `node:crypto` is the REFERENCE here only: it writes the stored layouts the new code must still read.
import C from 'node:crypto';
import { AES } from '../../modules/crypto/algorithms/aes.algorithm';
import { LegacyAES } from '../../modules/crypto/algorithms/aes-legacy.algorithm';
import { Rejection } from './rejection';

const LEGACY_SECRET = 'a-secret-of-thirty-two-chars!!!';

const legacyKey = (): Buffer => Buffer.from(LEGACY_SECRET.padEnd(32, '0').slice(0, 32));

describe('LegacyAES: the layouts the synchronous implementation accepted', () => {
  test('a GCM ciphertext with a 12-byte IV (given as opts.iv) still reads, and the same input writes the same bytes', async () => {
    const iv = Buffer.from(Array.from({ length: 12 }, (_, index) => index + 40));
    const cipher = C.createCipheriv('aes-256-gcm', legacyKey(), iv);
    const body = Buffer.concat([cipher.update('twelve byte iv', 'utf-8'), cipher.final()]);
    const stored = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    const legacy = LegacyAES.withAlgorithm('aes-256-gcm');

    const result = await legacy.decrypt({ message: stored, secret: LEGACY_SECRET, opts: { iv } });
    expect(result).toBe('twelve byte iv');
    const result2 = await legacy.encrypt({
      message: 'twelve byte iv',
      secret: LEGACY_SECRET,
      opts: { iv },
    });
    expect(result2).toBe(stored);
  });

  test('a CBC IV that is not 16 bytes is refused, as it was', async () => {
    const legacy = LegacyAES.withAlgorithm('aes-256-cbc');
    const message = await Rejection.messageOf({
      promise: legacy.encrypt({
        message: 'x',
        secret: LEGACY_SECRET,
        opts: { iv: Buffer.alloc(15, 1) },
      }),
    });

    expect(message).toContain('Invalid IV length');
  });

  test('a GCM tag that is not 16 bytes is refused before anything is decrypted', async () => {
    const legacy = LegacyAES.withAlgorithm('aes-256-gcm');
    const truncated = Buffer.concat([Buffer.alloc(16, 2), Buffer.alloc(8, 3)]).toString('base64');
    const message = await Rejection.messageOf({
      promise: legacy.decrypt({ message: truncated, secret: LEGACY_SECRET }),
    });

    expect(message).toContain('auth tag must be 16 bytes');
  });
});

describe('AES: an IV that the envelope could not carry is refused when writing', () => {
  for (const algorithm of ['aes-256-cbc', 'aes-256-gcm'] as const) {
    test(`${algorithm} refuses a 12-byte IV`, async () => {
      const message = await Rejection.messageOf({
        promise: AES.withAlgorithm(algorithm).encrypt({
          message: 'x',
          secret: 'a secret',
          opts: { iv: Buffer.alloc(12, 1) },
        }),
      });

      expect(message).toContain('The IV must be 16 bytes');
    });
  }
});

describe('PBKDF2 key derivation: the iterations and a failed derivation', () => {
  const cipher = AES.withAlgorithm('aes-256-cbc');

  for (const kdfIterations of [0, -1, 1.5, Number.NaN, 2 ** 31]) {
    test(`kdfIterations ${kdfIterations} is refused`, async () => {
      const message = await Rejection.messageOf({
        promise: cipher.normalizeSecretKey({ secret: 's', length: 32, kdfIterations }),
      });

      expect(message).toContain('kdfIterations must be an integer from 1 to');
    });
  }

  test('a derivation that failed is not cached: the same call derives again and succeeds', async () => {
    const secret = `retry-secret-${crypto.randomUUID()}`;
    const derive = spyOn(globalThis.crypto.subtle, 'deriveBits');

    try {
      derive.mockRejectedValueOnce(new Error('derivation failed'));

      const failure = await Rejection.messageOf({
        promise: cipher.normalizeSecretKey({ secret, length: 32 }),
      });
      expect(failure).toBe('derivation failed');

      const key = await cipher.normalizeSecretKey({ secret, length: 32 });
      expect(key.length).toBe(32);
      expect(derive).toHaveBeenCalledTimes(2);

      await cipher.normalizeSecretKey({ secret, length: 32 });
      expect(derive).toHaveBeenCalledTimes(2);
    } finally {
      derive.mockRestore();
    }
  });
});
