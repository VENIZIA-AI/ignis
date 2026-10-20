/**
 * Wire-level constants of the service assertion. Fixed rather than configurable: both ends of a
 * call must agree on them, and a knob here would let two services disagree silently.
 */
export class ServiceAssertion {
  /** Its own header, so the end user's token keeps `Authorization` on the same request. */
  static readonly HEADER = 'x-service-assertion';

  /** The JWS `typ`. What stops a user token being replayed as an assertion when one JWKS serves both. */
  static readonly TYP = 'svc+jwt';

  static readonly ALGORITHM = 'EdDSA';

  static readonly DEFAULT_REST_PATH = '/svc-certs';
  /** How long a minted assertion stays valid. */
  static readonly DEFAULT_SIGN_LIFETIME_SECONDS = 60;

  /** The oldest assertion a callee accepts, measured from `iat`. Its own decision, not the caller's. */
  static readonly DEFAULT_ACCEPT_MAX_AGE_SECONDS = 60;
  static readonly DEFAULT_CLOCK_TOLERANCE_SECONDS = 5;

  /** Resolves the accepted age for one caller: its own override, then the service default. */
  static resolveAcceptMaxAge(opts: { callerOverride?: number; serviceDefault?: number }): number {
    return (
      opts.callerOverride ?? opts.serviceDefault ?? ServiceAssertion.DEFAULT_ACCEPT_MAX_AGE_SECONDS
    );
  }

  static readonly DEFAULT_JWKS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
  static readonly DEFAULT_JWKS_COOLDOWN_MS = 30 * 1000;
}
