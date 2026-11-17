import { describe, expect, spyOn, test } from 'bun:test';
import { AES } from '../../modules/crypto/algorithms/aes.algorithm';
import { Rejection } from './rejection';

describe('AES: an IV of the caller is refused when writing', () => {
  for (const algorithm of ['aes-256-cbc', 'aes-256-gcm'] as const) {
    test.each([12, 16])(
      `${algorithm} refuses a ${'%d'}-byte IV, whatever its length`,
      async (length) => {
        const message = await Rejection.messageOf({
          promise: AES.withAlgorithm(algorithm).encrypt({
            message: 'x',
            secret: 'a secret',
            opts: { iv: Buffer.alloc(length, 1) } as never,
          }),
        });

        expect(message).toContain('The iv option was removed');
      },
    );
  }
});

describe('AES: a stored envelope that is cut short is refused, not read', () => {
  const SECRET = 'a-secret-of-thirty-two-chars!!!';
  /** The bytes before the IV: the version byte, the id length byte and the id. */
  const headerLength = (raw: Buffer) => 2 + (raw[1] ?? 0);

  test('a GCM envelope whose tag is shorter than 16 bytes is refused before anything is decrypted', async () => {
    const sealed = await AES.withAlgorithm('aes-256-gcm').encrypt({ message: 'x', secret: SECRET });
    const raw = Buffer.from(sealed, 'base64');
    const cut = raw.subarray(0, headerLength(raw) + 16 + 8).toString('base64');

    const message = await Rejection.messageOf({
      promise: AES.withAlgorithm('aes-256-gcm').decrypt({ message: cut, secret: SECRET }),
    });

    expect(message).toContain('auth tag must be 16 bytes');
  });

  test('a CBC envelope whose IV is shorter than 16 bytes is refused', async () => {
    const sealed = await AES.withAlgorithm('aes-256-cbc').encrypt({ message: 'x', secret: SECRET });
    const raw = Buffer.from(sealed, 'base64');
    const cut = raw.subarray(0, headerLength(raw) + 10).toString('base64');

    const message = await Rejection.messageOf({
      promise: AES.withAlgorithm('aes-256-cbc').decrypt({ message: cut, secret: SECRET }),
    });

    expect(message).toContain('Invalid IV length');
  });
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
