import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { exportPKCS8, exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { ServiceAssertion } from '@venizia/ignis-kernel';
import type { IServiceAuthOptions } from '@venizia/ignis-kernel';
import { ServiceAssertionSignerService } from '@/components/auth/authenticate/services/service/signer.service';
import { ServiceAssertionVerifierService } from '@/components/auth/authenticate/services/service/verifier.service';
import type { AnyType } from '@venizia/ignis-helpers/common';

/**
 * Real Ed25519 keys, a real JWK set served over HTTP, and verification through
 * `createRemoteJWKSet`. A fake key set would exercise the assertions and skip the only part that
 * talks to another service, which is the part worth testing.
 */

const CALLER = 'commerce';
const CALLEE = 'pricing';

let signer: ServiceAssertionSignerService;
let jwksServer: ReturnType<typeof Bun.serve>;
let jwksUrl: string;

/** `@inject` is dropped by bun's transpiler, so options are passed positionally. */
const buildSigner = (options: IServiceAuthOptions): ServiceAssertionSignerService =>
  new ServiceAssertionSignerService(options as AnyType);

const buildVerifier = (options: IServiceAuthOptions): ServiceAssertionVerifierService =>
  new ServiceAssertionVerifierService(options as AnyType);

const calleeOptions = (overrides?: Partial<IServiceAuthOptions>): IServiceAuthOptions => ({
  name: CALLEE,
  callers: { [CALLER]: jwksUrl },
  resolvePrincipal: async () => ({ userId: 1 }),
  ...overrides,
});

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair(ServiceAssertion.ALGORITHM, {
    extractable: true,
  });

  signer = buildSigner({
    name: CALLER,
    keys: {
      driver: 'text',
      format: 'pem',
      private: await exportPKCS8(privateKey),
      public: await exportSPKI(publicKey),
    },
    resolvePrincipal: async () => ({ userId: 1 }),
  });

  // A real endpoint, because `createRemoteJWKSet` fetches over HTTP and caches - the part a stub
  // would skip is exactly the part shared between two services.
  jwksServer = Bun.serve({
    port: 0,
    fetch: async () => Response.json(await signer.getPublicJWKS()),
  });
  jwksUrl = `http://localhost:${jwksServer.port}/svc-certs`;
});

afterAll(async () => {
  await jwksServer?.stop(true);
});

describe('the published key set', () => {
  test('holds one Ed25519 signing key, and never the private half', async () => {
    const jwks = await signer.getPublicJWKS();

    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: 'OKP', alg: 'EdDSA', use: 'sig' });
    expect(jwks.keys[0]!.kid).toBeDefined();
    expect(jwks.keys[0]!.d).toBeUndefined();
  });

  test('a signer with no keys refuses to mint or publish', async () => {
    const verifyOnly = buildSigner({ name: CALLEE, resolvePrincipal: async () => ({ userId: 1 }) });

    expect(verifyOnly.isEnabled()).toBe(false);
    return expect(verifyOnly.getPublicJWKS()).rejects.toThrow(/no signing keys/);
  });
});

describe('a callee accepts what was minted for it', () => {
  test('the happy path returns the verified issuer', async () => {
    const token = await signer.sign({ method: 'POST', path: '/v1/api/calc', audience: CALLEE });

    const { issuer } = await buildVerifier(calleeOptions()).verify({
      token,
      method: 'POST',
      path: '/v1/api/calc',
    });

    expect(issuer).toBe(CALLER);
  });

  test('the assertion carries the svc+jwt typ', async () => {
    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });
    const header = JSON.parse(atob(token.split('.')[0]!)) as { typ: string; alg: string };

    expect(header.typ).toBe(ServiceAssertion.TYP);
    expect(header.alg).toBe('EdDSA');
  });

  /**
   * The percent-encoding regression, and it only counts because it asserts the OLD accessor is
   * REJECTED. A test that signs an encoded path and verifies the same string passes identically
   * before and after the fix, because it supplies both sides itself.
   */
  test('a path needing percent-encoding verifies, and the decoded form does not', async () => {
    const encoded = '/v1/api/sku/ABC%20123/qu%E1%BB%91c';
    const decoded = decodeURI(encoded);

    expect(encoded).not.toBe(decoded);

    const token = await signer.sign({ method: 'GET', path: encoded, audience: CALLEE });
    const verifier = buildVerifier(calleeOptions());

    // What `new URL(context.req.url).pathname` hands over.
    await (expect(verifier.verify({ token, method: 'GET', path: encoded })).resolves.toMatchObject({
      issuer: CALLER,
    }) as AnyType);

    // What `context.req.path` would have handed over.
    return expect(verifier.verify({ token, method: 'GET', path: decoded })).rejects.toThrow();
  });
});

describe('a callee refuses everything else', () => {
  test('an assertion minted for another service', async () => {
    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: 'invoice' });

    return expect(
      buildVerifier(calleeOptions()).verify({ token, method: 'GET', path: '/v1/api/x' }),
    ).rejects.toThrow();
  });

  test('a capture replayed against another path', async () => {
    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });

    return expect(
      buildVerifier(calleeOptions()).verify({ token, method: 'GET', path: '/v1/api/elsewhere' }),
    ).rejects.toThrow(/does not match this request/);
  });

  test('a capture replayed with another method', async () => {
    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });

    return expect(
      buildVerifier(calleeOptions()).verify({ token, method: 'DELETE', path: '/v1/api/x' }),
    ).rejects.toThrow(/does not match this request/);
  });

  test('a caller absent from the allowlist', async () => {
    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });

    return expect(
      buildVerifier(calleeOptions({ callers: {} })).verify({
        token,
        method: 'GET',
        path: '/v1/api/x',
      }),
    ).rejects.toThrow(/not allowed/);
  });

  /** `iss: 'constructor'` walks a prototype-chain lookup straight past the allowlist. */
  test('a caller named after an Object.prototype member', async () => {
    const prototypeIssuer = buildSigner({
      name: 'constructor',
      keys: (signer as AnyType).options.keys,
      resolvePrincipal: async () => ({ userId: 1 }),
    });

    const token = await prototypeIssuer.sign({
      method: 'GET',
      path: '/v1/api/x',
      audience: CALLEE,
    });

    return expect(
      buildVerifier(calleeOptions()).verify({ token, method: 'GET', path: '/v1/api/x' }),
    ).rejects.toThrow(/not allowed/);
  });

  test('an assertion older than the window', async () => {
    const stale = Math.floor(Date.now() / 1000) - 600;

    // Minted directly so `iat` can be backdated: `maxTokenAge` measures against `iat`, and the
    // service always stamps "now".
    const token = await new SignJWT({ htm: 'GET', htu: '/v1/api/x' })
      .setProtectedHeader({
        alg: ServiceAssertion.ALGORITHM,
        typ: ServiceAssertion.TYP,
        kid: signer.getKeyId(),
      })
      .setIssuer(CALLER)
      .setAudience(CALLEE)
      .setJti('stale-1')
      .setIssuedAt(stale)
      .setExpirationTime(stale + 3600)
      .sign(await (signer as AnyType).resolvePrivateKey());

    return expect(
      buildVerifier(calleeOptions()).verify({ token, method: 'GET', path: '/v1/api/x' }),
    ).rejects.toThrow();
  });

  test('a header that is not a JWT at all', () => {
    return expect(
      buildVerifier(calleeOptions()).verify({
        token: 'not-a-jwt',
        method: 'GET',
        path: '/v1/api/x',
      }),
    ).rejects.toThrow();
  });

  test('an assertion with no iss', async () => {
    const token = await new SignJWT({ htm: 'GET', htu: '/v1/api/x' })
      .setProtectedHeader({ alg: ServiceAssertion.ALGORITHM, typ: ServiceAssertion.TYP })
      .setAudience(CALLEE)
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(await (signer as AnyType).resolvePrivateKey());

    return expect(
      buildVerifier(calleeOptions()).verify({ token, method: 'GET', path: '/v1/api/x' }),
    ).rejects.toThrow();
  });
});

describe('the callee decides the window, per caller', () => {
  /**
   * The caller already controls `exp` - it signs the token. `acceptMaxAgeSeconds` is the callee's
   * veto over that, so it can never be something the caller requests.
   */
  test('a per-caller override widens the window for that caller alone', async () => {
    const stale = Math.floor(Date.now() / 1000) - 300;

    const token = await new SignJWT({ htm: 'GET', htu: '/v1/api/x' })
      .setProtectedHeader({
        alg: ServiceAssertion.ALGORITHM,
        typ: ServiceAssertion.TYP,
        kid: signer.getKeyId(),
      })
      .setIssuer(CALLER)
      .setAudience(CALLEE)
      .setJti('batch-1')
      .setIssuedAt(stale)
      .setExpirationTime(stale + 3600)
      .sign(await (signer as AnyType).resolvePrivateKey());

    // Default window: refused.
    await (expect(
      buildVerifier(calleeOptions()).verify({ token, method: 'GET', path: '/v1/api/x' }),
    ).rejects.toThrow() as AnyType);

    // Same token, this caller granted more slack by the CALLEE's config.
    const generous = buildVerifier(
      calleeOptions({ callers: { [CALLER]: { jwksUrl, acceptMaxAgeSeconds: 600 } } }),
    );

    expect(await generous.verify({ token, method: 'GET', path: '/v1/api/x' })).toMatchObject({
      issuer: CALLER,
    });
  });

  test('a service-wide acceptMaxAgeSeconds applies where no caller overrides it', async () => {
    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });

    const verifier = buildVerifier(calleeOptions({ acceptMaxAgeSeconds: 600 }));
    expect(await verifier.verify({ token, method: 'GET', path: '/v1/api/x' })).toMatchObject({
      issuer: CALLER,
    });
  });

  /** The object form must not weaken the allowlist: an absent name is still refused. */
  test('the object caller form is still an allowlist', async () => {
    const token = await signer.sign({ method: 'GET', path: '/v1/api/x', audience: CALLEE });

    return expect(
      buildVerifier(
        calleeOptions({ callers: { someoneElse: { jwksUrl, acceptMaxAgeSeconds: 600 } } }),
      ).verify({ token, method: 'GET', path: '/v1/api/x' }),
    ).rejects.toThrow(/not allowed/);
  });
});

/**
 * The acceptance window, measured rather than reasoned - it was written down wrong twice before
 * anyone ran it.
 *
 * `clockToleranceSeconds` exists for the FUTURE case: two machines never agree to the second, and
 * without tolerance a caller whose clock is one second ahead is refused outright. Widening the
 * window for old tokens is the side effect, not the purpose.
 */
describe('the clock tolerance window', () => {
  const mint = async (opts: { iatOffsetSeconds: number }) => {
    const iat = Math.floor(Date.now() / 1000) + opts.iatOffsetSeconds;

    return new SignJWT({ htm: 'GET', htu: '/v1/api/x' })
      .setProtectedHeader({
        alg: ServiceAssertion.ALGORITHM,
        typ: ServiceAssertion.TYP,
        kid: signer.getKeyId(),
      })
      .setIssuer(CALLER)
      .setAudience(CALLEE)
      .setJti(`skew-${opts.iatOffsetSeconds}`)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 60)
      .sign(await (signer as AnyType).resolvePrivateKey());
  };

  const verifier = () =>
    buildVerifier(calleeOptions({ acceptMaxAgeSeconds: 60, clockToleranceSeconds: 5 }));

  /** A caller whose clock runs ahead. Without tolerance this fails at ONE second of skew. */
  test('a token from the near future is accepted, a far one is not', async () => {
    expect(
      await verifier().verify({
        token: await mint({ iatOffsetSeconds: 5 }),
        method: 'GET',
        path: '/v1/api/x',
      }),
    ).toMatchObject({ issuer: CALLER });

    return expect(
      verifier().verify({
        token: await mint({ iatOffsetSeconds: 6 }),
        method: 'GET',
        path: '/v1/api/x',
      }),
    ).rejects.toThrow();
  });

  /**
   * The ACCEPTANCE window, on this machine's clock: 60 + 5 = 65. The refusal is jose's `exp`
   * check, not `maxTokenAge` - an honest caller stamps `exp = iat + lifetime`, so the two are tied
   * and `exp` is reached first. See below for the REPLAY window, which is a different number.
   */
  test('an old token is accepted at 64s and refused at 65s', async () => {
    expect(
      await verifier().verify({
        token: await mint({ iatOffsetSeconds: -64 }),
        method: 'GET',
        path: '/v1/api/x',
      }),
    ).toMatchObject({ issuer: CALLER });

    return expect(
      verifier().verify({
        token: await mint({ iatOffsetSeconds: -65 }),
        method: 'GET',
        path: '/v1/api/x',
      }),
    ).rejects.toThrow();
  });
});

/**
 * The REPLAY window, which is not the acceptance window and is the number a threat model asks for.
 *
 * A callee that accepts an `iat` up to `clockTolerance` in its own future accepts a token minted
 * before its clock would otherwise allow, and then keeps accepting it for the rest of the window.
 * So `clockToleranceSeconds` widens the usable life of a captured assertion second for second - it
 * is a security knob, not an operational one.
 */
describe('the replay window is wider than the acceptance window', () => {
  const mintSkewed = async (opts: { mintedAgoOnOurClock: number; callerSkewSeconds: number }) => {
    const iat = Math.floor(Date.now() / 1000) - opts.mintedAgoOnOurClock + opts.callerSkewSeconds;

    return new SignJWT({ htm: 'GET', htu: '/v1/api/x' })
      .setProtectedHeader({
        alg: ServiceAssertion.ALGORITHM,
        typ: ServiceAssertion.TYP,
        kid: signer.getKeyId(),
      })
      .setIssuer(CALLER)
      .setAudience(CALLEE)
      .setJti(`replay-${opts.mintedAgoOnOurClock}-${opts.callerSkewSeconds}`)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 60)
      .sign(await (signer as AnyType).resolvePrivateKey());
  };

  const accepts = async (token: string) => {
    try {
      await buildVerifier(
        calleeOptions({ acceptMaxAgeSeconds: 60, clockToleranceSeconds: 5 }),
      ).verify({ token, method: 'GET', path: '/v1/api/x' });
      return true;
    } catch {
      return false;
    }
  };

  test('agreed clocks: usable for 64s after minting, not 65', async () => {
    expect(await accepts(await mintSkewed({ mintedAgoOnOurClock: 64, callerSkewSeconds: 0 }))).toBe(
      true,
    );
    expect(await accepts(await mintSkewed({ mintedAgoOnOurClock: 65, callerSkewSeconds: 0 }))).toBe(
      false,
    );
  });

  test('a caller running the full tolerance fast: usable for 69s, not 70', async () => {
    expect(await accepts(await mintSkewed({ mintedAgoOnOurClock: 69, callerSkewSeconds: 5 }))).toBe(
      true,
    );
    expect(await accepts(await mintSkewed({ mintedAgoOnOurClock: 70, callerSkewSeconds: 5 }))).toBe(
      false,
    );
  });
});
