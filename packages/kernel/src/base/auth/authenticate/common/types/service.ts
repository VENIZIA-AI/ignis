import type { TContext } from '@/base/controllers/common/types';
import type { TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Env } from 'hono';
import type { JWTPayload } from 'jose';
import type { TJWKSKeyDriver, TJWKSKeyFormat } from '../constants';
import type { IAuthUser } from './strategy';

/**
 * The request binding, following RFC 9449's `htm`/`htu`. A captured assertion cannot be replayed
 * against a different method or path.
 *
 * `htu` is the percent-ENCODED pathname on both ends. Compare it against
 * `new URL(context.req.url).pathname`, never `context.req.path` - Hono hands that one back DECODED,
 * so any route carrying a space or a non-ASCII slug would never match what the caller signed.
 */
export interface IServiceAssertionClaims extends JWTPayload {
  htm: string;
  htu: string;
}

/**
 * One entry in the caller allowlist: the JWKS url, or that url plus settings for this caller alone.
 */
export type TServiceCallerEntry =
  | string
  | {
      jwksUrl: string;
      /** Widens the accepted age for THIS caller only. Falls back to the service-wide setting. */
      acceptMaxAgeSeconds?: number;
    };

/** Service-to-service authentication: an Ed25519 assertion per request, verified against the caller's JWKS. */
export interface IServiceAuthOptions<E extends Env = Env> {
  /** What this service calls itself: the `iss` it stamps, and the `aud` it demands. */
  name: string;

  /**
   * Present only on a service that CALLS OUT. Absent means verify-only, and no certs route is
   * mounted - which is the common case, since most services are called and never call.
   */
  keys?: {
    driver: TJWKSKeyDriver;
    format: TJWKSKeyFormat;
    /** PEM or JWK by `format`; content for the `text` driver, a path for `file`. */
    private: string;
    public: string;
    kid?: string;
  };

  /**
   * Caller name to its JWKS url. THIS IS ALSO THE ALLOWLIST - a name absent from the map cannot
   * call, and an empty map correctly allows nobody.
   *
   * The bare-string form is the common case. The object form exists to widen the accepted age for
   * ONE caller: a nightly batch may legitimately need more slack than an interactive service, and
   * granting it per caller keeps the concession named and visible in config.
   */
  callers?: Record<string, TServiceCallerEntry>;

  /** Where the certs route is mounted. Defaults to `ServiceAssertion.DEFAULT_REST_PATH`. */
  rest?: { path: string };

  /**
   * How long the assertions this service MINTS stay valid. Only meaningful where `keys` is set.
   */
  signLifetimeSeconds?: number;

  /**
   * The oldest assertion this service ACCEPTS, measured from `iat`.
   *
   * Deliberately separate from `signLifetimeSeconds`, and deliberately not requestable by the
   * caller. The caller already controls `exp` - it signs the token - so this is the only bound that
   * survives a compromised caller. A per-caller override belongs in {@link callers}, never in the
   * assertion.
   *
   * Composes with `clockToleranceSeconds`: the real acceptance window is the sum of the two.
   */
  acceptMaxAgeSeconds?: number;

  /**
   * Clock skew allowance. A SECURITY knob, not an operational one.
   *
   * Its job is the future case: two machines never agree to the second, and without it a caller one
   * second ahead is refused outright. But it also widens the REPLAY window second for second - a
   * callee accepting an `iat` 5s in its own future keeps accepting that token for the rest of the
   * window too. Measured at the defaults: 65s accepted on our clock, 70s of wall-clock life for a
   * capture minted by a caller running the full tolerance fast.
   */
  clockToleranceSeconds?: number;

  jwks?: { cacheMaxAgeMs?: number; cooldownMs?: number };

  /**
   * WHO a verified assertion acts as. The framework has already proven the caller; this only maps a
   * caller name onto an application principal. Return `null` to refuse a caller the allowlist
   * admits but the application does not recognise.
   */
  resolvePrincipal: (opts: {
    issuer: string;
    context: TContext<E, string>;
  }) => ValueOrPromise<TNullable<IAuthUser>>;
}
