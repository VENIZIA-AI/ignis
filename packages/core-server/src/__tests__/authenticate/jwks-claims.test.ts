import { RejectionHelper } from '@venizia/dev-configs/testing';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { exportPKCS8, exportSPKI, generateKeyPair, SignJWT } from 'jose';
import type { CryptoKey } from 'jose';
import { JWKSIssuerTokenService } from '@/components/auth/authenticate/services/bearer/jwks/issuer.service';
import { JWKSVerifierTokenService } from '@/components/auth/authenticate/services/bearer/jwks/verifier.service';
import type { IJWTTokenPayload } from '@venizia/ignis-kernel';
import type { AnyType } from '@venizia/ignis-helpers/common';

/**
 * The JWKS pair: the issuer stamps and requires `claims` and pins the algorithm it signs with; the verifier
 * requires `claims` and `verify.algorithms`, because it cannot know what the issuer signs with.
 */

const CLAIMS = { issuer: 'identity', audience: 'inventory' };
const REFUSED = /Invalid or expired token/;

let privateKey: CryptoKey;
let issuerOptions: AnyType;
let server: ReturnType<typeof Bun.serve>;
let jwksUrl: string;

const buildIssuer = (overrides?: Record<string, unknown>) =>
  new JWKSIssuerTokenService({ ...issuerOptions, ...overrides } as AnyType);

const buildVerifier = (overrides?: Record<string, unknown>) =>
  new JWKSVerifierTokenService({
    mode: 'verifier',
    jwksUrl,
    claims: CLAIMS,
    verify: { algorithms: ['ES256'] },
    ...overrides,
  } as AnyType);

const payload = (): IJWTTokenPayload => ({ userId: 1, roles: [] }) as unknown as IJWTTokenPayload;

/** A token signed with the issuer's own private key, as a token made for another purpose would be. */
const signedElsewhere = (opts: { issuer?: string; audience?: string }) => {
  const signer = new SignJWT({ userId: 1, roles: [] })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-kid' })
    .setIssuedAt()
    .setExpirationTime('1h');

  if (opts.issuer !== undefined) {
    signer.setIssuer(opts.issuer);
  }

  if (opts.audience !== undefined) {
    signer.setAudience(opts.audience);
  }

  return signer.sign(privateKey);
};

const refusal = (task: () => unknown): string => {
  try {
    task();
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error('expected a refusal');
};

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey;

  const result = await exportPKCS8(pair.privateKey);
  const result2 = await exportSPKI(pair.publicKey);
  issuerOptions = {
    mode: 'issuer',
    algorithm: 'ES256',
    keys: {
      driver: 'text',
      format: 'pem',
      private: result,
      public: result2,
    },
    kid: 'test-kid',
    getTokenExpiresFn: () => 3600,
    claims: CLAIMS,
  };

  const jwks = await buildIssuer().getJWKSAsync();
  server = Bun.serve({ port: 0, fetch: () => Response.json(jwks) });
  jwksUrl = `http://localhost:${server.port}/certs`;
});

afterAll(async () => {
  await server.stop(true);
});

describe('JWKS issuer', () => {
  test('stamps the configured claims and verifies its own token', async () => {
    const issuer = buildIssuer();
    const token = await issuer.generate({ payload: payload() });
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

    expect(claims.iss).toBe('identity');
    expect(claims.aud).toBe('inventory');
    const result = await issuer.verify({ type: 'Bearer', token });
    expect(result.userId).toBe(1);
  });

  test('refuses a token of its own key that carries no claims, or other ones', async () => {
    const issuer = buildIssuer();

    const result2 = await signedElsewhere({});
    await RejectionHelper.expectRejection({
      task: issuer.verify({ type: 'Bearer', token: result2 }),
      message: REFUSED,
    });
    const result3 = await signedElsewhere({ issuer: 'identity', audience: 'commerce' });
    await RejectionHelper.expectRejection({
      task: issuer.verify({
        type: 'Bearer',
        token: result3,
      }),
      message: REFUSED,
    });
  });

  test('is refused at construction without claims, naming the key', () => {
    expect(refusal(() => buildIssuer({ claims: undefined }))).toContain('claims is required');
    expect(refusal(() => buildIssuer({ claims: { audience: 'inventory' } }))).toContain(
      'claims.issuer',
    );
    expect(() => buildIssuer({ claims: { issuer: 'identity' } })).not.toThrow();
    expect(refusal(() => buildIssuer({ claims: { issuer: 'identity', audience: [] } }))).toContain(
      'claims.audience',
    );
    expect(refusal(() => buildIssuer({ sign: { issuer: 'identity' } }))).toContain(
      '`sign` was removed',
    );
  });
});

describe('JWKS verifier', () => {
  test('accepts an issuer token of the configured claims and algorithm', async () => {
    const token = await buildIssuer().generate({ payload: payload() });

    const result = await buildVerifier().verify({ type: 'Bearer', token });
    expect(result.userId).toBe(1);
  });

  test('refuses a token of the issuer key that carries no claims (the reset or invite token)', async () => {
    const token = await signedElsewhere({});

    await RejectionHelper.expectRejection({
      task: buildVerifier().verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });

  test('refuses another issuer and another audience', async () => {
    const verifier = buildVerifier();

    const result2 = await signedElsewhere({ issuer: 'somebody-else', audience: 'inventory' });
    await RejectionHelper.expectRejection({
      task: verifier.verify({
        type: 'Bearer',
        token: result2,
      }),
      message: REFUSED,
    });
    const result3 = await signedElsewhere({ issuer: 'identity', audience: 'commerce' });
    await RejectionHelper.expectRejection({
      task: verifier.verify({
        type: 'Bearer',
        token: result3,
      }),
      message: REFUSED,
    });
  });

  test('refuses an algorithm that is not in verify.algorithms', async () => {
    const token = await buildIssuer().generate({ payload: payload() });

    await RejectionHelper.expectRejection({
      task: buildVerifier({ verify: { algorithms: ['RS256'] } }).verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });

  test('is refused at construction without claims or without verify.algorithms, naming the key', () => {
    expect(refusal(() => buildVerifier({ claims: undefined }))).toContain('claims is required');
    expect(refusal(() => buildVerifier({ verify: undefined }))).toContain('verify.algorithms');
    expect(refusal(() => buildVerifier({ verify: {} }))).toContain('verify.algorithms');
    expect(refusal(() => buildVerifier({ verify: { algorithms: [] } }))).toContain(
      'verify.algorithms',
    );
  });
});

describe('JWKS key confusion', () => {
  test('an HS256 token signed with the public key as the HMAC secret is refused', async () => {
    const publicPem = issuerOptions.keys.public as string;
    const forged = await new SignJWT({ userId: 1, roles: [] })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-kid' })
      .setIssuer('identity')
      .setAudience('inventory')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(publicPem));

    await RejectionHelper.expectRejection({
      task: buildVerifier().verify({ type: 'Bearer', token: forged }),
      message: REFUSED,
    });
    await RejectionHelper.expectRejection({
      task: buildVerifier({ verify: { algorithms: ['ES256', 'HS256'] } }).verify({
        type: 'Bearer',
        token: forged,
      }),
      message: REFUSED,
    });
    await RejectionHelper.expectRejection({
      task: buildIssuer().verify({ type: 'Bearer', token: forged }),
      message: REFUSED,
    });
  });
});

describe('JWKS claims without an audience', () => {
  test('the issuer stamps no aud, and the verifier accepts the token with or without one', async () => {
    const issuer = buildIssuer({ claims: { issuer: 'identity' } });
    const verifier = buildVerifier({ claims: { issuer: 'identity' } });
    const token = await issuer.generate({ payload: payload() });
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    const withAudience = await signedElsewhere({ issuer: 'identity', audience: 'x' });

    expect(claims.iss).toBe('identity');
    expect(claims.aud).toBeUndefined();
    const result = await verifier.verify({ type: 'Bearer', token });
    expect(result.userId).toBe(1);
    const result2 = await verifier.verify({ type: 'Bearer', token: withAudience });
    expect(result2.userId).toBe(1);
  });

  test('the issuer is still required on the verifier', async () => {
    const other = await signedElsewhere({ issuer: 'somebody-else' });

    await RejectionHelper.expectRejection({
      task: buildVerifier({ claims: { issuer: 'identity' } }).verify({
        type: 'Bearer',
        token: other,
      }),
      message: REFUSED,
    });
  });
});
