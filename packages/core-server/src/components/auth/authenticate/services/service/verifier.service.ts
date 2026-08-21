import { inject } from '@/base/metadata';
import {
  AuthenticateBindingKeys,
  AuthenticationErrors,
  BaseService,
  ServiceAssertion,
} from '@venizia/ignis-kernel';
import type { IServiceAssertionClaims, IServiceAuthOptions } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

type TRemoteKeySet = ReturnType<typeof createRemoteJWKSet>;

/**
 * Verifies an incoming service assertion against the CALLER's own JWKS.
 *
 * What the assertion covers, and nothing else: the HTTP method and the percent-encoded path. It does
 * NOT cover the query string, any header, or the body. Tenant selectors in particular are usually a
 * header or a query parameter, so an assertion alone does not authenticate which tenant a call acts
 * on - the caller allowlist and the application's own scoping have to do that. Stated because the
 * gap is invisible from the call site.
 */
export class ServiceAssertionVerifierService extends BaseService {
  /** One remote key set per caller, kept because `createRemoteJWKSet` owns its own cache. */
  private readonly keySets = new Map<string, TRemoteKeySet>();

  /** Per-caller accepted age, resolved once alongside its key set. */
  private readonly acceptMaxAges = new Map<string, number>();

  constructor(
    @inject({ key: AuthenticateBindingKeys.SERVICE_OPTIONS })
    private readonly options: IServiceAuthOptions,
  ) {
    super({ scope: ServiceAssertionVerifierService.name });
  }

  /**
   * @param path The percent-ENCODED pathname, from `new URL(context.req.url).pathname`. Never
   * `context.req.path` - Hono decodes that one, and the caller signed the encoded form.
   */
  async verify(opts: { token: string; method: string; path: string }): Promise<{ issuer: string }> {
    const { token, method, path } = opts;

    const issuer = this.readIssuer({ token });
    const keySet = this.resolveKeySet({ issuer });
    const payload = await this.runVerify({ token, issuer, keySet });

    this.assertRequestBinding({ payload, method, path });

    return { issuer };
  }

  /**
   * Reads `iss` WITHOUT verifying, only to choose which key set checks the signature. The same value
   * is then enforced as the expected issuer, so a forged `iss` buys nothing beyond selecting the key
   * set that will reject it.
   */
  private readIssuer(opts: { token: string }): string {
    try {
      const { iss } = decodeJwt(opts.token);

      // Typed, not merely present: a numeric `iss` would index the caller map by coercion.
      if (typeof iss !== 'string' || iss.length === 0) {
        throw new Error('missing or non-string iss');
      }

      return iss;
    } catch (error) {
      this.logger.for(this.readIssuer.name).warn('Undecodable assertion | error: %s', error);
      throw getError({ error: AuthenticationErrors.ASSERTION_INVALID });
    }
  }

  private resolveKeySet(opts: { issuer: string }): TRemoteKeySet {
    const { issuer } = opts;

    const cached = this.keySets.get(issuer);
    if (cached) {
      return cached;
    }

    const callers = this.options.callers ?? {};

    // `Object.hasOwn`, never a truthiness check on the index: the map arrives as a plain object, so
    // `iss: 'constructor'` would otherwise return `Function` - truthy - walk past this guard, and
    // reach `new URL(<function>)` as an uncaught TypeError.
    if (!Object.hasOwn(callers, issuer)) {
      this.logger
        .for(this.resolveKeySet.name)
        .warn('Caller not on the allowlist | iss: %s', issuer);
      throw getError({ error: AuthenticationErrors.CALLER_NOT_ALLOWED });
    }

    const entry = callers[issuer];
    const jwksUrl = typeof entry === 'string' ? entry : entry.jwksUrl;

    this.acceptMaxAges.set(
      issuer,
      ServiceAssertion.resolveAcceptMaxAge({
        callerOverride: typeof entry === 'string' ? undefined : entry.acceptMaxAgeSeconds,
        serviceDefault: this.options.acceptMaxAgeSeconds,
      }),
    );

    const keySet = createRemoteJWKSet(new URL(jwksUrl), {
      cacheMaxAge:
        this.options.jwks?.cacheMaxAgeMs ?? ServiceAssertion.DEFAULT_JWKS_CACHE_MAX_AGE_MS,
      cooldownDuration: this.options.jwks?.cooldownMs ?? ServiceAssertion.DEFAULT_JWKS_COOLDOWN_MS,
    });

    this.keySets.set(issuer, keySet);
    return keySet;
  }

  private async runVerify(opts: {
    token: string;
    issuer: string;
    keySet: TRemoteKeySet;
  }): Promise<IServiceAssertionClaims> {
    const { token, issuer, keySet } = opts;

    // Resolved when the key set was, so a per-caller override is already folded in.
    const maxTokenAge =
      this.acceptMaxAges.get(issuer) ??
      ServiceAssertion.resolveAcceptMaxAge({
        serviceDefault: this.options.acceptMaxAgeSeconds,
      });

    const clockTolerance =
      this.options.clockToleranceSeconds ?? ServiceAssertion.DEFAULT_CLOCK_TOLERANCE_SECONDS;

    try {
      const { payload } = await jwtVerify<IServiceAssertionClaims>(token, keySet, {
        algorithms: [ServiceAssertion.ALGORITHM],
        typ: ServiceAssertion.TYP,
        issuer,
        audience: this.options.name,
        // NOT redundant with `exp`, though it looks it. An honest caller stamps `exp = iat +
        // lifetime`, so the two are numerically tied and jose reaches `exp` first - measured.
        // `maxTokenAge` is the only bound that still holds when the CALLER is the attacker and picks
        // its own `exp`, which is precisely the case it exists for. Do not delete it as dead config.
        //
        // And it is the CALLEE's number, never one the caller may request: a caller that could ask
        // for a longer window would be choosing its own replay window, which is the whole thing this
        // is here to deny.
        //
        // TWO NUMBERS, and they answer different questions. Measured at the defaults, 60 + 5:
        //   - 65s is the ACCEPTANCE window on this machine's clock. Age 64 passes, 65 does not.
        //   - 70s is the REPLAY window in wall-clock time, when the caller's clock runs the full
        //     tolerance fast: we accept an `iat` up to 5s in our future, then keep accepting for
        //     another 64. Measured: still accepted 69s after minting.
        // The second is the one a threat model asks for. Widening `clockToleranceSeconds` widens it
        // second for second, so it is a security knob, not an operational one.
        maxTokenAge,
        clockTolerance,
        requiredClaims: ['htm', 'htu', 'jti'],
      });

      return payload;
    } catch (error) {
      // One code out, the reason on `cause`: a wrong audience, clock skew and a rotated key are
      // otherwise the same string to whoever is reading the log at 2am.
      const reason = (error as { cause?: unknown })?.cause ?? error;
      this.logger.for(this.runVerify.name).warn('Rejected | iss: %s | reason: %s', issuer, reason);

      throw getError({ error: AuthenticationErrors.ASSERTION_INVALID, cause: error });
    }
  }

  private assertRequestBinding(opts: {
    payload: IServiceAssertionClaims;
    method: string;
    path: string;
  }): void {
    const { payload, method, path } = opts;

    const signed = `${payload.htm} ${payload.htu}`;
    const actual = `${method.toUpperCase()} ${path}`;

    if (signed === actual) {
      return;
    }

    this.logger
      .for(this.assertRequestBinding.name)
      .warn('Request binding mismatch | signed: %s | actual: %s', signed, actual);

    throw getError({ error: AuthenticationErrors.REQUEST_BINDING_MISMATCH });
  }
}
