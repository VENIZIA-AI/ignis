import { describe, expect, test } from 'bun:test';
import { decodeJwt, SignJWT } from 'jose';
import { JWSTokenService } from '@/components/auth/authenticate/services/bearer/jws.service';
import type { IJWSTokenServiceOptions, IJWTTokenPayload } from '@venizia/ignis-kernel';
import type { AnyType } from '@venizia/ignis-helpers/common';

/**
 * `aud` / `iss` on both halves of the JWT lifecycle, pinned against BANA's acceptance criteria 1-3.
 *
 * Driven through `JWSTokenService` rather than the JWKS pair because it needs no key material: the
 * claim handling lives in the shared `AbstractBearerTokenService`, so both services take the same
 * path. The JWS chain is separately covered because it is an INDEPENDENT fluent chain - a `sign`
 * option applied only in the JWKS issuer would be silently inert here.
 */

const SECRET = 'a-test-secret-that-is-long-enough-for-hs256';

const buildService = (overrides?: Partial<IJWSTokenServiceOptions>): JWSTokenService => {
  const options: IJWSTokenServiceOptions = {
    jwtSecret: SECRET,
    getTokenExpiresFn: () => 3600,
    ...overrides,
  };

  // `@inject` is dropped by bun's transpiler, so the options are passed positionally.
  return new JWSTokenService(options as AnyType);
};

const basePayload = (): IJWTTokenPayload =>
  ({ userId: 1, roles: [] }) as unknown as IJWTTokenPayload;

describe('criterion 1 - an application that sets nothing behaves exactly as today', () => {
  test('no sign options means no iss and no aud', async () => {
    const token = await buildService().generate({ payload: basePayload() });
    const claims = decodeJwt(token);

    expect(claims.iss).toBeUndefined();
    expect(claims.aud).toBeUndefined();
    expect(claims.exp).toBeDefined();
  });

  test('no verify options accepts the token it accepts today', async () => {
    const service = buildService();
    const token = await service.generate({ payload: basePayload() });

    const verified = await service.verify({ type: 'Bearer', token });
    expect(verified.userId).toBe(1);
  });
});

describe('criterion 2 - a verifier configured for one audience rejects another', () => {
  test('a token minted for another service is refused', async () => {
    const issuer = buildService({ sign: { audience: 'commerce' } });
    const token = await issuer.generate({ payload: basePayload() });

    const inventory = buildService({ verify: { audience: 'inventory' } });

    return expect(inventory.verify({ type: 'Bearer', token })).rejects.toThrow(
      /Invalid or expired token/,
    );
  });

  test('a token minted for this service is accepted', async () => {
    const issuer = buildService({ sign: { audience: 'inventory' } });
    const token = await issuer.generate({ payload: basePayload() });

    const inventory = buildService({ verify: { audience: 'inventory' } });

    const verified = await inventory.verify({ type: 'Bearer', token });
    expect(verified.userId).toBe(1);
  });

  test('issuer is checked the same way', async () => {
    const token = await buildService({ sign: { issuer: 'identity' } }).generate({
      payload: basePayload(),
    });

    return expect(
      buildService({ verify: { issuer: 'somebody-else' } }).verify({ type: 'Bearer', token }),
    ).rejects.toThrow(/Invalid or expired token/);
  });

  /** The reason a rejection is diagnosable at all during a fleet-wide rollout. */
  test('the jose failure survives as `cause`, so aud is distinguishable from expiry', async () => {
    const token = await buildService({ sign: { audience: 'commerce' } }).generate({
      payload: basePayload(),
    });

    let caught: AnyType;
    try {
      await buildService({ verify: { audience: 'inventory' } }).verify({ type: 'Bearer', token });
    } catch (error) {
      caught = error;
    }

    // jose names the CLAIM, not the option: `unexpected "aud" claim value`. That is exactly the
    // detail an operator needs to tell a wrong audience from an expired token.
    expect(String(caught?.cause)).toMatch(/JWTClaimValidationFailed/);
    expect(String(caught?.cause)).toMatch(/"aud"/);
  });
});

describe('criterion 3 - the configured claim wins, and per-token claims are explicit', () => {
  /**
   * INVERTED from the original request. `iss` and `aud` ride through the AES envelope in the clear
   * because they are standard JWT fields, so a payload that could overwrite them would let anyone
   * shaping the payload forge an issuer identity.
   */
  test('a configured audience overrides one supplied in the payload', async () => {
    const service = buildService({ sign: { audience: 'inventory' } });
    const payload = { ...basePayload(), aud: 'attacker-chosen' } as IJWTTokenPayload;

    const claims = decodeJwt(await service.generate({ payload }));
    expect(claims.aud).toBe('inventory');
  });

  test('a configured issuer overrides one supplied in the payload', async () => {
    const service = buildService({ sign: { issuer: 'identity' } });
    const payload = { ...basePayload(), iss: 'not-identity' } as IJWTTokenPayload;

    const claims = decodeJwt(await service.generate({ payload }));
    expect(claims.iss).toBe('identity');
  });

  test('generate({ claims }) sets a per-token audience, which is the supported way', async () => {
    const service = buildService({ sign: { audience: 'default-audience' } });

    const token = await service.generate({
      payload: basePayload(),
      claims: { audience: 'inventory', subject: 'svc-commerce', jwtId: 'assertion-1' },
    });

    const claims = decodeJwt(token);
    expect(claims.aud).toBe('inventory');
    expect(claims.sub).toBe('svc-commerce');
    expect(claims.jti).toBe('assertion-1');
  });

  test('a per-token claim is not needed for the common case', async () => {
    const claims = decodeJwt(
      await buildService({ sign: { issuer: 'identity', audience: 'inventory' } }).generate({
        payload: basePayload(),
      }),
    );

    expect(claims.iss).toBe('identity');
    expect(claims.aud).toBe('inventory');
  });
});

describe('the other verify knobs reach jose', () => {
  /** The replay window for a short-lived assertion, independent of whatever `exp` was stamped. */
  test('maxTokenAge rejects a token older than the window', async () => {
    // Minted directly so `iat` can be backdated: the service always stamps "now", and `maxTokenAge`
    // measures against `iat`, not `exp` - a token still well inside its expiry is refused here.
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ userId: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now - 600)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(SECRET));

    return expect(
      buildService({ verify: { maxTokenAge: '60 seconds' } }).verify({ type: 'Bearer', token }),
    ).rejects.toThrow(/Invalid or expired token/);
  });

  test('maxTokenAge accepts a token inside the window', async () => {
    const service = buildService({ verify: { maxTokenAge: '600 seconds' } });
    const token = await service.generate({ payload: basePayload() });

    expect((await service.verify({ type: 'Bearer', token })).userId).toBe(1);
  });

  test('an algorithms allowlist refuses an alg it does not list', async () => {
    const token = await buildService().generate({ payload: basePayload() });

    return expect(
      buildService({ verify: { algorithms: ['RS256'] } }).verify({ type: 'Bearer', token }),
    ).rejects.toThrow(/Invalid or expired token/);
  });

  test('requiredClaims refuses a token missing one', async () => {
    const token = await buildService().generate({ payload: basePayload() });

    return expect(
      buildService({ verify: { requiredClaims: ['aud'] } }).verify({ type: 'Bearer', token }),
    ).rejects.toThrow(/Invalid or expired token/);
  });
});
