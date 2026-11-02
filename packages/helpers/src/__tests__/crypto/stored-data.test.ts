import { describe, expect, spyOn, test } from 'bun:test';
// `node:crypto` is the REFERENCE here only: it proves what the old implementation read and wrote.
import C from 'node:crypto';
import { AES, type AESAlgorithmType } from '../../modules/crypto/algorithms/aes.algorithm';
import { LegacyAES } from '../../modules/crypto/algorithms/aes-legacy.algorithm';
import { RSA } from '../../modules/crypto/algorithms/rsa.algorithm';
import fixtures from './fixtures/stored-ciphertexts.json';

/**
 * Known-answer fixtures recorded with the synchronous `node:crypto` implementation, before `AES`,
 * `LegacyAES`, `RSA` and the PBKDF2 key derivation moved to `crypto.subtle`. Whatever is already
 * stored must still read, and the new code must still write the same bytes for the same input.
 */

type TAesFixture = {
  name: string;
  algorithm: AESAlgorithmType;
  secret: string | Array<{ id: string; secret: string }>;
  message: string;
  kdf: { kdfSalt: string; kdfIterations: number } | null;
  ivHex: string;
  stored: string;
};

const aesFixtures = fixtures.aes as TAesFixture[];
const legacyFixtures = fixtures.legacy as Array<Omit<TAesFixture, 'kdf' | 'secret'> & { secret: string }>;

describe('AES: what is stored still reads, and the same input writes the same bytes', () => {
  for (const fixture of aesFixtures) {
    test(fixture.name, async () => {
      const cipher = AES.withAlgorithm(fixture.algorithm);
      const kdf = fixture.kdf ?? {};

      expect(
        await cipher.decrypt({ message: fixture.stored, secret: fixture.secret, opts: kdf }),
      ).toBe(fixture.message);

      const rewritten = await cipher.encrypt({
        message: fixture.message,
        secret: fixture.secret,
        opts: { iv: Buffer.from(fixture.ivHex, 'hex'), ...kdf },
      });
      expect(rewritten).toBe(fixture.stored);
    });
  }

  test('a keyring decrypts a ciphertext by its key id, whatever the order of the entries', async () => {
    const fixture = aesFixtures.find((entry) => entry.name === 'aes-256-gcm keyring');
    if (!fixture) {
      throw new Error('the keyring fixture is missing');
    }
    const reversed = [...(fixture.secret as Array<{ id: string; secret: string }>)].reverse();

    expect(
      await AES.withAlgorithm('aes-256-gcm').decrypt({ message: fixture.stored, secret: reversed }),
    ).toBe(fixture.message);
  });

  test('a plain empty secret is refused on encrypt, as before', async () => {
    await expect(
      AES.withAlgorithm('aes-256-cbc').encrypt({ message: 'x', secret: '' }),
    ).rejects.toThrow();
  });

  test('a flipped bit in a GCM ciphertext is refused, and doThrow: false hands the message back', async () => {
    const fixture = aesFixtures.find((entry) => entry.name === 'aes-256-gcm short plain');
    if (!fixture) {
      throw new Error('the gcm fixture is missing');
    }
    const bytes = Buffer.from(fixture.stored, 'base64');
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0x01;
    const tampered = bytes.toString('base64');
    const cipher = AES.withAlgorithm('aes-256-gcm');

    await expect(
      cipher.decrypt({ message: tampered, secret: fixture.secret as string }),
    ).rejects.toThrow();
    expect(
      await cipher.decrypt({
        message: tampered,
        secret: fixture.secret as string,
        opts: { doThrow: false },
      }),
    ).toBe(tampered);
  });

  test('a wrong secret never returns the plaintext', async () => {
    const fixture = aesFixtures.find((entry) => entry.name === 'aes-256-gcm short plain');
    if (!fixture) {
      throw new Error('the gcm fixture is missing');
    }

    await expect(
      AES.withAlgorithm('aes-256-gcm').decrypt({ message: fixture.stored, secret: 'wrong secret' }),
    ).rejects.toThrow();
  });

  test('the envelope of a ciphertext written now is read by node:crypto (the reference)', async () => {
    const secret = 'reference secret';
    const message = 'read by the reference implementation';

    for (const algorithm of ['aes-256-cbc', 'aes-256-gcm'] as const) {
      const stored = Buffer.from(
        await AES.withAlgorithm(algorithm).encrypt({ message, secret }),
        'base64',
      );
      const idLength = stored[1] ?? 0;
      const ivStart = 2 + idLength;
      const iv = stored.subarray(ivStart, ivStart + 16);
      const key = C.pbkdf2Sync(secret, 'ignis-kdf-salt-v1', 100_000, 32, 'sha256');
      const decipher = C.createDecipheriv(algorithm, key, iv);
      let cursor = ivStart + 16;

      if (algorithm === 'aes-256-gcm') {
        (decipher as C.DecipherGCM).setAuthTag(stored.subarray(cursor, cursor + 16));
        cursor += 16;
      }

      expect(
        Buffer.concat([decipher.update(stored.subarray(cursor)), decipher.final()]).toString(),
      ).toBe(message);
    }
  });
});

describe('LegacyAES: what is stored still reads, and the same input writes the same bytes', () => {
  for (const fixture of legacyFixtures) {
    test(fixture.name, async () => {
      const cipher = LegacyAES.withAlgorithm(fixture.algorithm);

      expect(await cipher.decrypt({ message: fixture.stored, secret: fixture.secret })).toBe(
        fixture.message,
      );
      expect(
        await cipher.encrypt({
          message: fixture.message,
          secret: fixture.secret,
          opts: { iv: Buffer.from(fixture.ivHex, 'hex') },
        }),
      ).toBe(fixture.stored);
    });
  }

  test('a secret whose UTF-8 bytes are not 32 long is refused, never run as a shorter AES key', async () => {
    // 20 characters of 2 bytes each slice to 20 characters (40 bytes): not a 256-bit key.
    const cipher = LegacyAES.withAlgorithm('aes-256-cbc');

    await expect(cipher.encrypt({ message: 'x', secret: 'é'.repeat(20) })).rejects.toThrow();
    // 8 ASCII characters pad to 32 bytes, so this one is fine.
    expect(await cipher.encrypt({ message: 'x', secret: 'abcdefgh' })).toBeString();
  });
});

describe('PBKDF2 key derivation: the same key bytes as the synchronous implementation', () => {
  for (const entry of fixtures.derivedKeys) {
    test(`length ${entry.length}, ${entry.kdf ? 'custom salt and iterations' : 'default salt'}, secret "${entry.secret.slice(0, 8)}"`, async () => {
      const key = await AES.withAlgorithm('aes-256-cbc').normalizeSecretKey({
        secret: entry.secret,
        length: entry.length,
        ...(entry.kdf ?? {}),
      });

      expect(key.toString('hex')).toBe(entry.keyHex);
    });
  }

  test('concurrent first calls for one secret derive the key once', async () => {
    const cipher = AES.withAlgorithm('aes-256-cbc');
    const derive = spyOn(globalThis.crypto.subtle, 'deriveBits');
    const secret = `unique-secret-${crypto.randomUUID()}`;

    try {
      const keys = await Promise.all(
        Array.from({ length: 12 }, () => cipher.normalizeSecretKey({ secret, length: 32 })),
      );

      expect(derive).toHaveBeenCalledTimes(1);
      expect(new Set(keys.map((key) => key.toString('hex'))).size).toBe(1);

      await cipher.normalizeSecretKey({ secret, length: 32 });
      expect(derive).toHaveBeenCalledTimes(1);
    } finally {
      derive.mockRestore();
    }
  });

  test('a failed derivation is not cached: the next call tries again', async () => {
    const cipher = AES.withAlgorithm('aes-256-cbc');
    const secret = `failing-secret-${crypto.randomUUID()}`;

    await expect(cipher.normalizeSecretKey({ secret, length: 32, kdfIterations: 0 })).rejects.toThrow();
    await expect(cipher.normalizeSecretKey({ secret, length: 32, kdfIterations: 0 })).rejects.toThrow();
    expect((await cipher.normalizeSecretKey({ secret, length: 32, kdfIterations: 10 })).length).toBe(32);
  });

  test('a salt under 16 bytes is refused', async () => {
    await expect(
      AES.withAlgorithm('aes-256-cbc').normalizeSecretKey({ secret: 's', length: 32, kdfSalt: 'short' }),
    ).rejects.toThrow(/at least 16 bytes/);
  });
});

describe('RSA: keys and ciphertext of the synchronous implementation still work', () => {
  const { publicKey, privateKey } = fixtures.rsa;
  const rsa = RSA.withAlgorithm();

  for (const stored of fixtures.rsa.stored) {
    test(`decrypts the ciphertext stored for "${stored.name}"`, async () => {
      expect(await rsa.decrypt({ message: stored.stored, secret: privateKey })).toBe(stored.message);
    });
  }

  test('a message encrypted now is read by node:crypto (the reference) with the old private key', async () => {
    const message = 'read by the reference implementation';
    const encrypted = await rsa.encrypt({ message, secret: publicKey });
    const plain = C.privateDecrypt(
      C.createPrivateKey({ key: Buffer.from(privateKey, 'base64'), format: 'der', type: 'pkcs8' }),
      Buffer.from(encrypted, 'base64'),
    );

    expect(plain.toString()).toBe(message);
  });

  test('a message the reference encrypted is read now (OAEP, SHA-1, the old default)', async () => {
    const message = 'written by the reference implementation';
    const encrypted = C.publicEncrypt(
      C.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' }),
      Buffer.from(message),
    ).toString('base64');

    expect(await rsa.decrypt({ message: encrypted, secret: privateKey })).toBe(message);
  });

  test('a generated pair is DER (spki, pkcs8), 2048 bits, and works both ways with the reference', async () => {
    const pair = await rsa.generateDERKeyPair();
    const pub = C.createPublicKey({ key: pair.publicKey, format: 'der', type: 'spki' });
    const priv = C.createPrivateKey({ key: pair.privateKey, format: 'der', type: 'pkcs8' });

    expect(pub.asymmetricKeyDetails?.modulusLength).toBe(2048);
    expect(pub.asymmetricKeyDetails?.publicExponent).toBe(65537n);

    const encrypted = await rsa.encrypt({
      message: 'round trip',
      secret: pair.publicKey.toString('base64'),
    });
    expect(C.privateDecrypt(priv, Buffer.from(encrypted, 'base64')).toString()).toBe('round trip');
    expect(
      await rsa.decrypt({
        message: C.publicEncrypt(pub, Buffer.from('other way')).toString('base64'),
        secret: pair.privateKey.toString('base64'),
      }),
    ).toBe('other way');
  });

  test('a modulus under 2048 bits is refused', async () => {
    await expect(rsa.generateDERKeyPair({ modulus: 1024 })).rejects.toThrow(/below the 2048-bit minimum/);
  });

  test('a wrong key or a damaged ciphertext is refused, and doThrow: false hands the message back', async () => {
    const other = await rsa.generateDERKeyPair();
    const stored = fixtures.rsa.stored[0]?.stored ?? '';

    await expect(
      rsa.decrypt({ message: stored, secret: other.privateKey.toString('base64') }),
    ).rejects.toThrow();
    expect(
      await rsa.decrypt({
        message: stored,
        secret: other.privateKey.toString('base64'),
        opts: { doThrow: false },
      }),
    ).toBe(stored);
  });
});
