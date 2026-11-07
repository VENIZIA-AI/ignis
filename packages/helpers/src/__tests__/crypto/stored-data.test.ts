import { describe, expect, spyOn, test } from 'bun:test';
// `node:crypto` is the REFERENCE here only: it proves what the old implementation read and wrote.
import C from 'node:crypto';
import { AES, type AESAlgorithmType } from '../../modules/crypto/algorithms/aes.algorithm';
import { RSA } from '../../modules/crypto/algorithms/rsa.algorithm';
import fixtures from './fixtures/stored-ciphertexts.json';
import { Rejection } from './rejection';

/**
 * Known-answer fixtures recorded with the synchronous `node:crypto` implementation, before `AES`,
 * `RSA` and the PBKDF2 key derivation moved to `crypto.subtle`. Whatever is already
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

describe('AES: what is stored still reads, and the same input writes the same bytes', () => {
  for (const fixture of aesFixtures) {
    test(fixture.name, async () => {
      const cipher = AES.withAlgorithm(fixture.algorithm);
      const kdf = fixture.kdf ?? {};

      const result = await cipher.decrypt({
        message: fixture.stored,
        secret: fixture.secret,
        opts: kdf,
      });
      expect(result).toBe(fixture.message);

      // The IV of a call is the system's random bytes. Stubbing the source to the fixture's IV proves the same
      // input still writes the same bytes: the format and the key derivation are what the fixture recorded.
      const stub = spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
        array.set(Buffer.from(fixture.ivHex, 'hex'));

        return array;
      }) as never);

      try {
        const rewritten = await cipher.encrypt({
          message: fixture.message,
          secret: fixture.secret,
          opts: kdf,
        });

        expect(rewritten).toBe(fixture.stored);
      } finally {
        stub.mockRestore();
      }
    });
  }

  test('a keyring decrypts a ciphertext by its key id, whatever the order of the entries', async () => {
    const fixture = aesFixtures.find((entry) => entry.name === 'aes-256-gcm keyring');

    if (!fixture) {
      throw new Error('the keyring fixture is missing');
    }

    const reversed = [...(fixture.secret as Array<{ id: string; secret: string }>)].reverse();

    const result2 = await AES.withAlgorithm('aes-256-gcm').decrypt({
      message: fixture.stored,
      secret: reversed,
    });
    expect(result2).toBe(fixture.message);
  });

  test('a plain empty secret is refused on encrypt, as before', async () => {
    const result3 = await Rejection.messageOf({
      promise: AES.withAlgorithm('aes-256-cbc').encrypt({ message: 'x', secret: '' }),
    });
    expect(result3).toBeString();
  });

  test('a flipped bit in a GCM ciphertext is refused, and the message is never handed back', async () => {
    const fixture = aesFixtures.find((entry) => entry.name === 'aes-256-gcm short plain');

    if (!fixture) {
      throw new Error('the gcm fixture is missing');
    }

    const bytes = Buffer.from(fixture.stored, 'base64');
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0x01;
    const tampered = bytes.toString('base64');
    const cipher = AES.withAlgorithm('aes-256-gcm');

    const result4 = await Rejection.messageOf({
      promise: cipher.decrypt({ message: tampered, secret: fixture.secret as string }),
    });
    expect(result4).toBeString();
    expect(result4).not.toContain('doThrow');
  });

  test('a wrong secret never returns the plaintext', async () => {
    const fixture = aesFixtures.find((entry) => entry.name === 'aes-256-gcm short plain');

    if (!fixture) {
      throw new Error('the gcm fixture is missing');
    }

    const result6 = await Rejection.messageOf({
      promise: AES.withAlgorithm('aes-256-gcm').decrypt({
        message: fixture.stored,
        secret: 'wrong secret',
      }),
    });
    expect(result6).toBeString();
  });

  test('the envelope of a ciphertext written now is read by node:crypto (the reference)', async () => {
    const secret = 'reference secret';
    const message = 'read by the reference implementation';

    for (const algorithm of ['aes-256-cbc', 'aes-256-gcm'] as const) {
      const result7 = await AES.withAlgorithm(algorithm).encrypt({ message, secret });
      const stored = Buffer.from(result7, 'base64');
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

    const result = await Rejection.messageOf({
      promise: cipher.normalizeSecretKey({ secret, length: 32, kdfIterations: 0 }),
    });
    expect(result).toBeString();
    const result2 = await Rejection.messageOf({
      promise: cipher.normalizeSecretKey({ secret, length: 32, kdfIterations: 0 }),
    });
    expect(result2).toBeString();
    const result3 = await cipher.normalizeSecretKey({ secret, length: 32, kdfIterations: 10 });
    expect(result3.length).toBe(32);
  });

  test('a salt under 16 bytes is refused', async () => {
    const result4 = await Rejection.messageOf({
      promise: AES.withAlgorithm('aes-256-cbc').normalizeSecretKey({
        secret: 's',
        length: 32,
        kdfSalt: 'short',
      }),
    });
    expect(result4).toMatch(/at least 16 bytes/);
  });
});

describe('RSA: keys and ciphertext of the synchronous implementation still work', () => {
  const { publicKey, privateKey } = fixtures.rsa;
  const rsa = RSA.withAlgorithm();

  for (const stored of fixtures.rsa.stored) {
    test(`decrypts the ciphertext stored for "${stored.name}"`, async () => {
      const result = await rsa.decrypt({ message: stored.stored, secret: privateKey });
      expect(result).toBe(stored.message);
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

    const result2 = await rsa.decrypt({ message: encrypted, secret: privateKey });
    expect(result2).toBe(message);
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
    const result3 = await rsa.decrypt({
      message: C.publicEncrypt(pub, Buffer.from('other way')).toString('base64'),
      secret: pair.privateKey.toString('base64'),
    });
    expect(result3).toBe('other way');
  });

  test('a modulus under 2048 bits is refused', async () => {
    const result4 = await Rejection.messageOf({
      promise: rsa.generateDERKeyPair({ modulus: 1024 }),
    });
    expect(result4).toMatch(/below the 2048-bit minimum/);
  });

  test('a wrong key or a damaged ciphertext is refused, and the message is never handed back', async () => {
    const other = await rsa.generateDERKeyPair();
    const stored = fixtures.rsa.stored[0]?.stored ?? '';

    const result5 = await Rejection.messageOf({
      promise: rsa.decrypt({ message: stored, secret: other.privateKey.toString('base64') }),
    });
    expect(result5).toBeString();
    expect(result5).not.toContain('doThrow');
  });
});

describe('AES: ciphertext sealed under a fixed IV, before the iv option was removed, still decrypts', () => {
  const SECRET = 'a-stored-secret-of-32-characters';

  /** What the old encrypt wrote for a caller-chosen IV: [version 1][idLen][id][iv 16][tag 16, gcm only][cipher]. */
  const sealUnderFixedIv = (opts: {
    algorithm: 'aes-256-cbc' | 'aes-256-gcm';
    iv: Buffer;
    message: string;
  }) => {
    const key = C.pbkdf2Sync(SECRET, 'ignis-kdf-salt-v1', 100_000, 32, 'sha256');
    const cipher = C.createCipheriv(opts.algorithm, key, opts.iv);
    const cipherText = Buffer.concat([cipher.update(opts.message, 'utf-8'), cipher.final()]);
    const id = Buffer.from('0');
    const parts = [Buffer.from([1, id.length]), id, opts.iv];

    if (opts.algorithm === 'aes-256-gcm') {
      parts.push((cipher as C.CipherGCM).getAuthTag());
    }

    parts.push(cipherText);

    return Buffer.concat(parts).toString('base64');
  };

  test.each(['aes-256-cbc', 'aes-256-gcm'] as const)(
    '%s: an envelope with a constant IV is read as before',
    async (algorithm) => {
      const stored = sealUnderFixedIv({
        algorithm,
        iv: Buffer.alloc(16, 5),
        message: 'sealed before the change',
      });

      const result = await AES.withAlgorithm(algorithm).decrypt({
        message: stored,
        secret: SECRET,
      });

      expect(result).toBe('sealed before the change');
    },
  );

  test('the same IV under two messages is still readable: only writing it is gone', async () => {
    const iv = Buffer.alloc(16, 7);
    const first = sealUnderFixedIv({ algorithm: 'aes-256-gcm', iv, message: 'first' });
    const second = sealUnderFixedIv({ algorithm: 'aes-256-gcm', iv, message: 'second' });
    const cipher = AES.withAlgorithm('aes-256-gcm');

    const result2 = await cipher.decrypt({ message: first, secret: SECRET });
    expect(result2).toBe('first');
    const result3 = await cipher.decrypt({ message: second, secret: SECRET });
    expect(result3).toBe('second');
  });
});
