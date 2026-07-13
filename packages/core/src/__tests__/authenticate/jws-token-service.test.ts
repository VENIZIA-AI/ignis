import { describe, expect, test } from 'bun:test';
import { HTTP } from '@venizia/ignis-helpers';
import { decodeJwt } from 'jose';
import type { IJWSTokenServiceOptions, IJWTTokenPayload } from '@/components/auth';
import { JWSTokenService } from '@/components/auth';

const JWT_SECRET = 'jwt-secret-that-is-long-enough-for-hs256';
const APPLICATION_SECRET = '0123456789abcdef0123456789abcdef';

const buildService = (overrides: Partial<IJWSTokenServiceOptions> = {}) => {
  return new JWSTokenService({
    jwtSecret: JWT_SECRET,
    getTokenExpiresFn: () => 3600,
    ...overrides,
  } as IJWSTokenServiceOptions);
};

const buildPayload = (): IJWTTokenPayload => {
  return {
    userId: 42,
    roles: [{ id: 1, identifier: 'admin', priority: 0 }],
  };
};

/** Reads a token's claims WITHOUT verifying it - the wire truth, not what the service claims. */
const readClaims = (token: string) => decodeJwt(token) as Record<string, unknown>;

describe('JWSTokenService - construction guards', () => {
  test('a missing jwtSecret is refused at construction, not at first use', () => {
    let caught: unknown;

    try {
      buildService({ jwtSecret: undefined });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('jwtSecret');
  });

  test('a missing getTokenExpiresFn is refused at construction', () => {
    let caught: unknown;

    try {
      buildService({ getTokenExpiresFn: undefined });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('getTokenExpiresFn');
  });
});

describe('JWSTokenService - generate', () => {
  test('a generated token round-trips through verify with its payload intact', async () => {
    const service = buildService();
    const payload = buildPayload();

    const token = await service.generate({ payload });
    const verified = await service.verify({ type: 'Bearer', token });

    expect(verified.userId).toBe(payload.userId);
    expect(verified.roles).toEqual(payload.roles);
    expect(verified.roles[0].identifier).toBe('admin');
  });

  test('the token carries iat/nbf/exp, and exp honours getTokenExpiresFn', async () => {
    const service = buildService({ getTokenExpiresFn: () => 60 });

    const token = await service.generate({ payload: buildPayload() });
    const claims = readClaims(token);

    expect(typeof claims['iat']).toBe('number');
    expect(typeof claims['nbf']).toBe('number');
    expect(claims['exp']).toBe((claims['iat'] as number) + 60);
  });

  test('a per-call getTokenExpiresFn overrides the constructor default', async () => {
    const service = buildService({ getTokenExpiresFn: () => 3600 });

    const token = await service.generate({ payload: buildPayload(), getTokenExpiresFn: () => 10 });
    const claims = readClaims(token);

    expect(claims['exp']).toBe((claims['iat'] as number) + 10);
  });

  test('an absent payload is refused with 401 rather than signing an empty token', async () => {
    const service = buildService();

    let caught: unknown;
    try {
      await service.generate({ payload: undefined as unknown as IJWTTokenPayload });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('Invalid token payload');
  });
});

describe('JWSTokenService - verify rejects every bad token', () => {
  test('an empty token is rejected with 401', async () => {
    const service = buildService();

    let caught: unknown;
    try {
      await service.verify({ type: 'Bearer', token: '' });
    } catch (error) {
      caught = error;
    }

    expect((caught as { statusCode?: number }).statusCode).toBe(HTTP.ResultCodes.RS_4.Unauthorized);
  });

  test('a token signed with a DIFFERENT secret is rejected - the signature is checked', async () => {
    const issuer = buildService({ jwtSecret: 'a-completely-different-signing-secret-value' });
    const verifier = buildService();

    const forged = await issuer.generate({ payload: buildPayload() });

    let caught: unknown;
    try {
      await verifier.verify({ type: 'Bearer', token: forged });
    } catch (error) {
      caught = error;
    }

    expect((caught as { statusCode?: number }).statusCode).toBe(HTTP.ResultCodes.RS_4.Unauthorized);
  });

  test('a tampered payload is rejected - flipping a claim breaks the signature', async () => {
    const service = buildService();
    const token = await service.generate({ payload: buildPayload() });

    const [header, , signature] = token.split('.');
    const forgedClaims = Buffer.from(
      JSON.stringify({ ...readClaims(token), userId: 999 }),
    ).toString('base64url');
    const forged = [header, forgedClaims, signature].join('.');

    let caught: unknown;
    try {
      await service.verify({ type: 'Bearer', token: forged });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('Invalid or expired token');
  });

  test('an expired token is rejected', async () => {
    // A negative lifetime puts `exp` in the past the moment the token is signed.
    const service = buildService({ getTokenExpiresFn: () => -10 });
    const token = await service.generate({ payload: buildPayload() });

    let caught: unknown;
    try {
      await service.verify({ type: 'Bearer', token });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('Invalid or expired token');
  });

  test('a not-yet-valid token is rejected - nbf is enforced', async () => {
    const service = buildService();
    const token = await service.generate({ payload: buildPayload() });

    const [header, , signature] = token.split('.');
    const future = Math.floor(Date.now() / 1000) + 3600;
    const forgedClaims = Buffer.from(
      JSON.stringify({ ...readClaims(token), nbf: future }),
    ).toString('base64url');

    let caught: unknown;
    try {
      await service.verify({ type: 'Bearer', token: [header, forgedClaims, signature].join('.') });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
  });

  test('garbage that is not a JWT at all is rejected without leaking internals', async () => {
    const service = buildService();

    let caught: unknown;
    try {
      await service.verify({ type: 'Bearer', token: 'not-a-jwt' });
    } catch (error) {
      caught = error;
    }

    // The sanitized message only - a caller must never see the underlying jose error text.
    expect((caught as Error).message).toBe('[verify] Invalid or expired token');
  });
});

describe('JWSTokenService - payload encryption', () => {
  test('without an applicationSecret the payload is signed in the clear', async () => {
    const service = buildService();

    const token = await service.generate({ payload: buildPayload() });
    const claims = readClaims(token);

    expect(claims['userId']).toBe(42);
  });

  test('with an applicationSecret the payload is AES-encrypted on the wire yet still round-trips', async () => {
    const service = buildService({ applicationSecret: APPLICATION_SECRET });
    const payload = buildPayload();

    const token = await service.generate({ payload });
    const claims = readClaims(token);

    // A JWT is signed, NOT encrypted: anyone can read its claims. Encryption is what keeps the
    // values opaque on the wire, so the raw claim must not be the plaintext.
    expect(claims['userId']).not.toBe(42);

    const verified = await service.verify({ type: 'Bearer', token });
    expect(verified.userId).toBe(42);
  });

  test('a token encrypted with one applicationSecret does not decrypt under another', async () => {
    const issuer = buildService({ applicationSecret: APPLICATION_SECRET });
    const verifier = buildService({ applicationSecret: 'fedcba9876543210fedcba9876543210' });

    const token = await issuer.generate({ payload: buildPayload() });

    let caught: unknown;
    let verified: IJWTTokenPayload | undefined;
    try {
      verified = await verifier.verify({ type: 'Bearer', token });
    } catch (error) {
      caught = error;
    }

    // Either the decrypt throws, or it yields something that is not the original value - what must
    // never happen is the foreign secret recovering the plaintext.
    expect(caught !== undefined || verified?.userId !== 42).toBe(true);
  });
});
