import { describe, expect, test } from 'bun:test';
// `node:crypto` is the REFERENCE here only: it writes the stored envelopes the service must still read.
import C from 'node:crypto';
import { decodeJwt, SignJWT } from 'jose';
import type { IJWSTokenServiceOptions, IJWTTokenPayload } from '@/components/auth';
import { JWSTokenService } from '@/components/auth';

const JWT_SECRET = 'jwt-secret-that-is-long-enough-for-hs256';
const APPLICATION_SECRET = '0123456789abcdef0123456789abcdef';

const buildService = (overrides: Partial<IJWSTokenServiceOptions> = {}) => {
  return new JWSTokenService({
    jwtSecret: JWT_SECRET,
    getTokenExpiresFn: () => 3600,
    applicationSecret: APPLICATION_SECRET,
    ...overrides,
  } as IJWSTokenServiceOptions);
};

/** The message an async call rejected with, or `undefined` when it resolved (`await expect(...).rejects` is typed as a plain value, which `await-thenable` refuses). */
const rejectionMessage = async (opts: {
  promise: Promise<unknown>;
}): Promise<string | undefined> => {
  try {
    await opts.promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return undefined;
};

/** The envelope the synchronous implementation wrote: [version 1][idLen][id][iv 16][tag 16, gcm only][cipher]. */
const sealWithReference = (opts: { message: string; algorithm: 'aes-256-cbc' | 'aes-256-gcm' }) => {
  const key = C.pbkdf2Sync(APPLICATION_SECRET, 'ignis-kdf-salt-v1', 100_000, 32, 'sha256');
  const iv = C.randomBytes(16);
  const cipher = C.createCipheriv(opts.algorithm, key, iv);
  const cipherText = Buffer.concat([cipher.update(opts.message, 'utf-8'), cipher.final()]);
  const id = Buffer.from('0');
  const parts = [Buffer.from([1, id.length]), id, iv];

  if (opts.algorithm === 'aes-256-gcm') {
    parts.push((cipher as C.CipherGCM).getAuthTag());
  }
  parts.push(cipherText);

  return Buffer.concat(parts).toString('base64');
};

const signStoredToken = async (opts: { algorithm: 'aes-256-cbc' | 'aes-256-gcm' }) => {
  const claims: Record<string, unknown> = {
    [sealWithReference({ message: 'userId', algorithm: opts.algorithm })]: sealWithReference({
      message: '42',
      algorithm: opts.algorithm,
    }),
    [sealWithReference({ message: 'roles', algorithm: opts.algorithm })]: sealWithReference({
      message: JSON.stringify([{ id: 1, identifier: 'admin', priority: 0 }]),
      algorithm: opts.algorithm,
    }),
  };

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
};

describe('bearer token service - the AES envelope already stored still verifies', () => {
  for (const algorithm of ['aes-256-cbc', 'aes-256-gcm'] as const) {
    test(`a token whose claims the synchronous ${algorithm} implementation sealed`, async () => {
      const token = await signStoredToken({ algorithm });
      const service = buildService({ aesAlgorithm: algorithm });

      const verified = await service.verify({ type: 'Bearer', token });

      expect(verified.userId).toBe(42);
      expect(verified.roles).toEqual([{ id: 1, identifier: 'admin', priority: 0 }]);
    });
  }
});

describe('bearer token service - encryption is awaited, never leaked as a Promise', () => {
  test('every claim name and value on the wire is a ciphertext string, not "[object Promise]"', async () => {
    const service = buildService();
    const token = await service.generate({
      payload: { userId: 42, roles: [{ id: 1, identifier: 'admin', priority: 0 }] },
    });
    const claims = decodeJwt(token) as Record<string, unknown>;
    const custom = Object.entries(claims).filter(
      ([name]) => !['iat', 'exp', 'nbf', 'iss', 'aud', 'sub', 'jti'].includes(name),
    );

    expect(custom.length).toBe(2);
    for (const [name, value] of custom) {
      expect(name).not.toContain('object Promise');
      expect(value).toBeString();
      expect(value).not.toContain('object Promise');
      expect(Buffer.from(name, 'base64')[0]).toBe(1);
      expect(Buffer.from(value as string, 'base64')[0]).toBe(1);
    }
  });

  test('encryptPayload and decryptPayload hand back the payload itself, once awaited', async () => {
    const service = buildService();
    const payload: IJWTTokenPayload = { userId: 7, roles: [] };

    const encrypted = service.encryptPayload(payload);
    expect(encrypted).toBeInstanceOf(Promise);

    const wire = await encrypted;
    expect(Object.keys(wire).every((name) => name !== 'userId')).toBe(true);
    const result2 = await service.decryptPayload({
      result: { payload: wire, protectedHeader: { alg: 'HS256' } } as never,
    });
    expect(result2).toEqual(payload);
  });

  test('many tokens issued and verified at once, from a cold key cache, all round-trip', async () => {
    const service = buildService({
      applicationSecret: `cold-secret-${crypto.randomUUID()}-padding`,
    });
    const tokens = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        service.generate({ payload: { userId: index, roles: [] } }),
      ),
    );
    const verified = await Promise.all(
      tokens.map((token) => service.verify({ type: 'Bearer', token })),
    );

    expect(verified.map((entry) => entry.userId)).toEqual(
      Array.from({ length: 16 }, (_, index) => index),
    );
  });

  test('a cipher that answers at once (a string, not a promise) is still accepted', async () => {
    const service = buildService({
      cipher: {
        encrypt: (opts) => Buffer.from(opts.message).toString('base64'),
        decrypt: (opts) => Buffer.from(opts.message, 'base64').toString(),
      },
    });
    const token = await service.generate({ payload: { userId: 9, roles: [] } });

    const result3 = await service.verify({ type: 'Bearer', token });
    expect(result3.userId).toBe(9);
  });

  test('a cipher that fails makes generate reject, and no token comes out', async () => {
    const service = buildService({
      cipher: {
        encrypt: () => Promise.reject(new Error('cipher unavailable')),
        decrypt: () => Promise.reject(new Error('cipher unavailable')),
      },
    });

    const result4 = await rejectionMessage({
      promise: service.generate({ payload: { userId: 1, roles: [] } }),
    });
    expect(result4).toContain('cipher unavailable');
  });

  test('a tampered claim is refused before any decryption', async () => {
    const service = buildService();
    const token = await service.generate({ payload: { userId: 1, roles: [] } });
    const [header, body, signature] = token.split('.');
    const forged = `${header}.${body?.slice(0, -2)}AA.${signature}`;

    const result5 = await rejectionMessage({
      promise: service.verify({ type: 'Bearer', token: forged }),
    });
    expect(result5).toBeString();
  });
});
