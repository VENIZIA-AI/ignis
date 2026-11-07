import { RejectionHelper } from '@venizia/dev-configs/testing';
import { describe, expect, test } from 'bun:test';
import { decodeJwt, SignJWT } from 'jose';
import { JWSTokenService } from '@/components/auth/authenticate/services/bearer/jws.service';
import { AbstractBearerTokenService } from '@/components/auth/authenticate/services/bearer/abstract.service';
import type { IJWSTokenServiceOptions, IJWTTokenPayload } from '@venizia/ignis-kernel';
import type { AnyType } from '@venizia/ignis-helpers/common';

/**
 * The `iss` and `aud` of a service are required: stamped on every token it signs, required on every
 * token it verifies, with the accepted algorithm pinned.
 *
 * Driven through `JWSTokenService` because it needs no key material: the claim handling lives in the
 * shared `AbstractBearerTokenService`, so the JWKS pair takes the same path (the JWKS-specific
 * parts, the pin and the verifier's required algorithms, are in `jwks-claims.test.ts`).
 */

const SECRET = 'a-test-secret-that-is-long-enough-for-hs256';
const KEY = new TextEncoder().encode(SECRET);
const CLAIMS = { issuer: 'identity', audience: 'inventory' };

const buildService = (overrides?: Partial<IJWSTokenServiceOptions>): JWSTokenService => {
  const options: IJWSTokenServiceOptions = {
    jwtSecret: SECRET,
    getTokenExpiresFn: () => 3600,
    claims: CLAIMS,
    ...overrides,
  };

  // `@inject` is dropped by bun's transpiler, so the options are passed positionally.
  return new JWSTokenService(options as AnyType);
};

const basePayload = (): IJWTTokenPayload =>
  ({ userId: 1, roles: [] }) as unknown as IJWTTokenPayload;

const REFUSED = /Invalid or expired token/;

/** A token signed with the service's own key, as a reset or an invite token would be: it carries a user id and whatever claims the test gives it. */
const signedElsewhere = async (opts: {
  issuer?: string;
  audience?: string | string[];
  alg?: string;
}) => {
  const signer = new SignJWT({ userId: 1, roles: [] })
    .setProtectedHeader({ alg: opts.alg ?? 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h');

  if (opts.issuer !== undefined) {
    signer.setIssuer(opts.issuer);
  }

  if (opts.audience !== undefined) {
    signer.setAudience(opts.audience);
  }

  return signer.sign(KEY);
};

describe('every token the service signs carries both claims', () => {
  test('iss and aud are on a token made with no per-token claims', async () => {
    const token = await buildService().generate({ payload: basePayload() });
    const claims = decodeJwt(token);

    expect(claims.iss).toBe('identity');
    expect(claims.aud).toBe('inventory');
    expect(claims.exp).toBeDefined();
  });

  test('a list audience is stamped as the list', async () => {
    const token = await buildService({
      claims: { issuer: 'identity', audience: ['inventory', 'commerce'] },
    }).generate({ payload: basePayload() });

    expect(decodeJwt(token).aud).toEqual(['inventory', 'commerce']);
  });

  test('a token the service made verifies on the same service', async () => {
    const service = buildService();
    const token = await service.generate({ payload: basePayload() });

    const verified = await service.verify({ type: 'Bearer', token });
    expect(verified.userId).toBe(1);
  });

  /**
   * `iss` and `aud` ride through the AES envelope in the clear because they are standard JWT fields, so a
   * payload that could overwrite them would let anyone shaping the payload forge an issuer identity.
   */
  test('the configured audience and issuer win over ones supplied in the payload', async () => {
    const payload = {
      ...basePayload(),
      aud: 'attacker-chosen',
      iss: 'not-identity',
    } as IJWTTokenPayload;

    const result = await buildService().generate({ payload });
    const claims = decodeJwt(result);

    expect(claims.aud).toBe('inventory');
    expect(claims.iss).toBe('identity');
  });

  test('generate({ claims }) sets a per-token audience, which is the supported way', async () => {
    const token = await buildService().generate({
      payload: basePayload(),
      claims: { audience: 'commerce', subject: 'svc-commerce', jwtId: 'assertion-1' },
    });

    const claims = decodeJwt(token);
    expect(claims.aud).toBe('commerce');
    expect(claims.iss).toBe('identity');
    expect(claims.sub).toBe('svc-commerce');
    expect(claims.jti).toBe('assertion-1');
  });
});

describe('a token signed with the same key for another purpose does not authenticate', () => {
  test('a token with no iss and no aud is refused (the reset or invite token)', async () => {
    const token = await signedElsewhere({});

    await RejectionHelper.expectRejection({
      task: buildService().verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });

  test('a token with the right audience and no issuer is refused', async () => {
    const token = await signedElsewhere({ audience: 'inventory' });

    await RejectionHelper.expectRejection({
      task: buildService().verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });

  test('a token with the right issuer and no audience is refused', async () => {
    const token = await signedElsewhere({ issuer: 'identity' });

    await RejectionHelper.expectRejection({
      task: buildService().verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });

  test('a token with another issuer is refused', async () => {
    const token = await signedElsewhere({ issuer: 'somebody-else', audience: 'inventory' });

    await RejectionHelper.expectRejection({
      task: buildService().verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });

  test('a token with another audience is refused', async () => {
    const token = await signedElsewhere({ issuer: 'identity', audience: 'commerce' });

    await RejectionHelper.expectRejection({
      task: buildService().verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });

  test('a token with both claims right is accepted', async () => {
    const token = await signedElsewhere({ issuer: 'identity', audience: 'inventory' });

    const verified = await buildService().verify({ type: 'Bearer', token });
    expect(verified.userId).toBe(1);
  });

  test('a token whose audience list holds the configured one is accepted (overlap)', async () => {
    const token = await signedElsewhere({
      issuer: 'identity',
      audience: ['commerce', 'inventory'],
    });

    const verified = await buildService().verify({ type: 'Bearer', token });
    expect(verified.userId).toBe(1);
  });

  /** The reason a rejection is diagnosable at all during a fleet-wide rollout. */
  test('the jose failure survives as `cause`, so aud is distinguishable from expiry', async () => {
    const token = await signedElsewhere({ issuer: 'identity', audience: 'commerce' });

    let caught: AnyType;

    try {
      await buildService().verify({ type: 'Bearer', token });
    } catch (error) {
      caught = error;
    }

    // jose names the CLAIM: `unexpected "aud" claim value`.
    expect(String(caught?.cause)).toMatch(/JWTClaimValidationFailed/);
    expect(String(caught?.cause)).toMatch(/"aud"/);
  });

  test('a token minted for another service by the same config is refused here', async () => {
    const commerce = buildService({ claims: { issuer: 'identity', audience: 'commerce' } });
    const token = await commerce.generate({ payload: basePayload() });

    await RejectionHelper.expectRejection({
      task: buildService().verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });
});

describe('the accepted algorithm is pinned', () => {
  test('a token signed HS512 with the same secret is refused when the service pins HS256', async () => {
    const token = await signedElsewhere({
      issuer: 'identity',
      audience: 'inventory',
      alg: 'HS512',
    });

    await RejectionHelper.expectRejection({
      task: buildService().verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });

  test('the pin follows headerAlgorithm: HS384 accepts HS384 and refuses HS256', async () => {
    const service = buildService({ headerAlgorithm: 'HS384' });
    const own = await service.generate({ payload: basePayload() });
    const other = await signedElsewhere({ issuer: 'identity', audience: 'inventory' });

    const result = await service.verify({ type: 'Bearer', token: own });
    expect(result.userId).toBe(1);
    await RejectionHelper.expectRejection({
      task: service.verify({ type: 'Bearer', token: other }),
      message: REFUSED,
    });
  });

  test('verify.algorithms widens the pin by an explicit choice', async () => {
    const service = buildService({ verify: { algorithms: ['HS256', 'HS512'] } });
    const token = await signedElsewhere({
      issuer: 'identity',
      audience: 'inventory',
      alg: 'HS512',
    });

    const result2 = await service.verify({ type: 'Bearer', token });
    expect(result2.userId).toBe(1);
  });
});

describe('a configuration without claims is refused, naming the key', () => {
  const resolve = (options: Record<string, unknown>) =>
    AbstractBearerTokenService.resolveClaimsConfig({
      scope: 'probe',
      options,
      pinnedAlgorithms: ['HS256'],
    });

  const refusal = (task: () => unknown): string => {
    try {
      task();
    } catch (error) {
      return (error as Error).message;
    }

    throw new Error('expected a refusal');
  };

  test('no claims at all', () => {
    expect(refusal(() => resolve({}))).toContain('claims is required');
    expect(refusal(() => resolve({ claims: null }))).toContain('claims is required');
    expect(refusal(() => resolve({ claims: 'identity' }))).toContain('claims is required');
  });

  test('a missing issuer', () => {
    expect(refusal(() => resolve({ claims: { audience: 'inventory' } }))).toContain(
      'claims.issuer',
    );
  });

  test('a missing audience is allowed: it is optional', () => {
    const resolved = resolve({ claims: { issuer: 'identity' } });

    expect(resolved.claims).toEqual({ issuer: 'identity' });
    expect('audience' in resolved.verify).toBe(false);
    expect(resolved.verify.issuer).toBe('identity');
  });

  test.each([
    ['an empty issuer', { issuer: '', audience: 'inventory' }, 'claims.issuer'],
    ['a blank issuer', { issuer: '   ', audience: 'inventory' }, 'claims.issuer'],
    ['a number as issuer', { issuer: 7, audience: 'inventory' }, 'claims.issuer'],
    ['an empty audience', { issuer: 'identity', audience: '' }, 'claims.audience'],
    ['an empty audience list', { issuer: 'identity', audience: [] }, 'claims.audience'],
    [
      'a list with an empty audience',
      { issuer: 'identity', audience: ['a', ''] },
      'claims.audience',
    ],
    ['a list with a number', { issuer: 'identity', audience: ['a', 1] }, 'claims.audience'],
    ['a null audience', { issuer: 'identity', audience: null }, 'claims.audience'],
    ['a blank audience', { issuer: 'identity', audience: '   ' }, 'claims.audience'],
    ['a number as audience', { issuer: 'identity', audience: 7 }, 'claims.audience'],
  ])('%s', (_name, claims, key) => {
    expect(refusal(() => resolve({ claims }))).toContain(key);
  });

  test('an unknown key in claims (a typo) is refused with the key named', () => {
    const message = refusal(() =>
      resolve({ claims: { issuer: 'identity', audience: 'inventory', audiance: 'x' } }),
    );

    expect(message).toContain('unknown keys');
    expect(message).toContain('audiance');
  });

  test('the removed `sign` option is refused with a pointer to claims', () => {
    const message = refusal(() =>
      resolve({ claims: CLAIMS, sign: { issuer: 'identity', audience: 'inventory' } }),
    );

    expect(message).toContain('`sign` was removed');
    expect(message).toContain('claims');
  });

  test.each(['issuer', 'audience'])(
    'the removed verify.%s is refused with a pointer to claims',
    (key) => {
      const message = refusal(() => resolve({ claims: CLAIMS, verify: { [key]: 'x' } }));

      expect(message).toContain(`verify.${key} was removed`);
      expect(message).toContain(`claims.${key}`);
    },
  );

  test('a service refuses the same when it is built', () => {
    const message = refusal(() =>
      buildService({ claims: undefined as unknown as IJWSTokenServiceOptions['claims'] }),
    );

    expect(message).toContain('claims is required');
  });

  test('a valid configuration answers the claims and the verify options jose receives', () => {
    const resolved = resolve({ claims: CLAIMS, verify: { maxTokenAge: '60 seconds' } });

    expect(resolved.claims).toEqual(CLAIMS);
    expect(resolved.verify).toMatchObject({
      issuer: 'identity',
      audience: 'inventory',
      algorithms: ['HS256'],
      maxTokenAge: '60 seconds',
    });
  });

  test("the answer does not alias the caller's audience list", () => {
    const audience = ['a', 'b'];
    const resolved = resolve({ claims: { issuer: 'identity', audience } });

    audience.push('c');

    expect(resolved.claims.audience).toEqual(['a', 'b']);
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
      .setIssuer('identity')
      .setAudience('inventory')
      .setIssuedAt(now - 600)
      .setExpirationTime(now + 3600)
      .sign(KEY);

    await RejectionHelper.expectRejection({
      task: buildService({ verify: { maxTokenAge: '60 seconds' } }).verify({
        type: 'Bearer',
        token,
      }),
      message: REFUSED,
    });
  });

  test('maxTokenAge accepts a token inside the window', async () => {
    const service = buildService({ verify: { maxTokenAge: '600 seconds' } });
    const token = await service.generate({ payload: basePayload() });

    const result = await service.verify({ type: 'Bearer', token });
    expect(result.userId).toBe(1);
  });

  test('an algorithms allowlist refuses an alg it does not list', async () => {
    const token = await buildService().generate({ payload: basePayload() });

    await RejectionHelper.expectRejection({
      task: buildService({ verify: { algorithms: ['RS256'] } }).verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });

  test('requiredClaims refuses a token missing one', async () => {
    const token = await buildService().generate({ payload: basePayload() });

    await RejectionHelper.expectRejection({
      task: buildService({ verify: { requiredClaims: ['sub'] } }).verify({ type: 'Bearer', token }),
      message: REFUSED,
    });
  });
});

const refusalOf = (task: () => unknown): string => {
  try {
    task();
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error('expected a refusal');
};

describe('hardening: tokens and options that must not pass', () => {
  const unsigned = () => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);

    return `${part({ alg: 'none', typ: 'JWT' })}.${part({
      userId: 1,
      iss: 'identity',
      aud: 'inventory',
      exp: now + 3600,
    })}.`;
  };

  test('a token with alg none is refused', async () => {
    await RejectionHelper.expectRejection({
      task: buildService().verify({ type: 'Bearer', token: unsigned() }),
      message: REFUSED,
    });
  });

  test("the algorithm 'none' refuses the boot, as a header algorithm or in verify.algorithms", () => {
    expect(refusalOf(() => buildService({ headerAlgorithm: 'none' }))).toContain("'none'");
    expect(refusalOf(() => buildService({ verify: { algorithms: ['HS256', 'None'] } }))).toContain(
      "'none'",
    );
  });

  test.each([['maxTokenAge'], [5], [['maxTokenAge']], [null]])(
    'a verify option that is not an object (%p) refuses the boot',
    (verify) => {
      expect(refusalOf(() => buildService({ verify: verify as AnyType }))).toContain(
        'verify must be an object',
      );
    },
  );

  test('a configured audience list accepts a token naming any entry', async () => {
    const service = buildService({
      claims: { issuer: 'identity', audience: ['inventory', 'billing'] },
    });
    const token = await signedElsewhere({ issuer: 'identity', audience: 'billing' });

    const result = await service.verify({ type: 'Bearer', token });
    expect(result.userId).toBe(1);
  });

  test('the encrypted variant refuses a token that carries no claims', async () => {
    const service = buildService({ applicationSecret: '0123456789abcdef0123456789abcdef' });
    const own = await service.generate({ payload: basePayload() });

    const result2 = await service.verify({ type: 'Bearer', token: own });
    expect(result2.userId).toBe(1);
    const result3 = await signedElsewhere({});
    await RejectionHelper.expectRejection({
      task: service.verify({ type: 'Bearer', token: result3 }),
      message: REFUSED,
    });
  });

  describe('a service assertion is not a user token', () => {
    const withTyp = (typ: string) =>
      new SignJWT({ userId: 1, roles: [] })
        .setProtectedHeader({ alg: 'HS256', typ })
        .setIssuer('identity')
        .setAudience('inventory')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(KEY);

    test.each(['svc+jwt', 'SVC+JWT', 'application/svc+jwt'])(
      'typ %p is refused on the user-token path',
      async (typ) => {
        const token = await withTyp(typ);

        await RejectionHelper.expectRejection({
          task: buildService().verify({ type: 'Bearer', token }),
          message: REFUSED,
        });
      },
    );

    test('the cause names the service assertion', async () => {
      let caught: AnyType;
      const token = await withTyp('svc+jwt');

      try {
        await buildService().verify({ type: 'Bearer', token });
      } catch (error) {
        caught = error;
      }

      expect(String(caught?.cause)).toContain('service assertion');
    });

    test('an ordinary typ (JWT) is accepted', async () => {
      const token = await withTyp('JWT');
      const verified = await buildService().verify({ type: 'Bearer', token });

      expect(verified.userId).toBe(1);
    });
  });
});

describe('claims without an audience: nothing is stamped and no aud is checked', () => {
  const withoutAudience = (overrides?: Partial<IJWSTokenServiceOptions>) =>
    buildService({ claims: { issuer: 'identity' }, ...overrides });

  test('a token the service makes carries the issuer and no aud', async () => {
    const result = await withoutAudience().generate({ payload: basePayload() });
    const claims = decodeJwt(result);

    expect(claims.iss).toBe('identity');
    expect(claims.aud).toBeUndefined();
  });

  test('a token the service made verifies', async () => {
    const service = withoutAudience();
    const token = await service.generate({ payload: basePayload() });

    const result2 = await service.verify({ type: 'Bearer', token });
    expect(result2.userId).toBe(1);
  });

  test('a token with no aud and a token with any aud both verify', async () => {
    const service = withoutAudience();
    const none = await signedElsewhere({ issuer: 'identity' });
    const some = await signedElsewhere({ issuer: 'identity', audience: 'anything' });

    const result3 = await service.verify({ type: 'Bearer', token: none });
    expect(result3.userId).toBe(1);
    const result4 = await service.verify({ type: 'Bearer', token: some });
    expect(result4.userId).toBe(1);
  });

  test('the issuer is still required: a token with none or another one is refused', async () => {
    const service = withoutAudience();
    const noIssuer = await signedElsewhere({});
    const other = await signedElsewhere({ issuer: 'somebody-else' });

    await RejectionHelper.expectRejection({
      task: service.verify({ type: 'Bearer', token: noIssuer }),
      message: REFUSED,
    });
    await RejectionHelper.expectRejection({
      task: service.verify({ type: 'Bearer', token: other }),
      message: REFUSED,
    });
  });

  test('a per-token audience is still stamped, and this service does not check it', async () => {
    const service = withoutAudience();
    const token = await service.generate({
      payload: basePayload(),
      claims: { audience: 'commerce' },
    });

    expect(decodeJwt(token).aud).toBe('commerce');
    const result5 = await service.verify({ type: 'Bearer', token });
    expect(result5.userId).toBe(1);
  });

  test('the encrypted variant works the same without an audience', async () => {
    const service = withoutAudience({ applicationSecret: '0123456789abcdef0123456789abcdef' });
    const token = await service.generate({ payload: basePayload() });
    const bare = await signedElsewhere({});

    const result6 = await service.verify({ type: 'Bearer', token });
    expect(result6.userId).toBe(1);
    await RejectionHelper.expectRejection({
      task: service.verify({ type: 'Bearer', token: bare }),
      message: REFUSED,
    });
  });
});

describe('claims with an audience: still refused when wrong or missing', () => {
  test('a token with no aud or another aud is refused; the configured one is accepted', async () => {
    const service = buildService();
    const none = await signedElsewhere({ issuer: 'identity' });
    const wrong = await signedElsewhere({ issuer: 'identity', audience: 'commerce' });
    const right = await signedElsewhere({ issuer: 'identity', audience: 'inventory' });

    await RejectionHelper.expectRejection({
      task: service.verify({ type: 'Bearer', token: none }),
      message: REFUSED,
    });
    await RejectionHelper.expectRejection({
      task: service.verify({ type: 'Bearer', token: wrong }),
      message: REFUSED,
    });
    const result = await service.verify({ type: 'Bearer', token: right });
    expect(result.userId).toBe(1);
  });
});
