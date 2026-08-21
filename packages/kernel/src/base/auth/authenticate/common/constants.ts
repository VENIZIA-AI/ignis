import type { TConstValue } from '@venizia/ignis-helpers/common';

export class AuthenticateStrategy {
  static readonly BASIC = 'basic';
  static readonly JWT = 'jwt';
  static readonly SERVICE = 'service';

  /** The strategies the FRAMEWORK ships. An application registers its own beyond these. */
  static readonly SCHEME_SET = new Set([this.BASIC, this.JWT, this.SERVICE]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

// `(string & {})` keeps autocomplete for the built-in values while still accepting any name an
// application registers with `AuthenticationStrategyRegistry`. Same idiom as `TDataSourceDriver`.
export type TAuthStrategy = TConstValue<typeof AuthenticateStrategy> | (string & {});

export class JOSEStandards {
  static readonly JWS = 'JWS';
  static readonly JWKS = 'JWKS';

  static readonly SCHEME_SET = new Set([this.JWS, this.JWKS]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TJOSEStandard = TConstValue<typeof JOSEStandards>;

export class Authentication {
  // Strategy
  static readonly STRATEGY_BASIC = AuthenticateStrategy.BASIC;
  static readonly STRATEGY_JWT = AuthenticateStrategy.JWT;
  static readonly STRATEGY_SERVICE = AuthenticateStrategy.SERVICE;

  // Token type
  static readonly TYPE_BASIC = 'Basic';
  static readonly TYPE_BEARER = 'Bearer';

  static readonly AUTHENTICATION_STRATEGY = 'authentication.strategy';
  static readonly SKIP_AUTHENTICATION = 'authentication.skip';

  static readonly CURRENT_USER = 'auth.current.user';
  static readonly AUDIT_USER_ID = 'audit.user.id';
}

export class AuthenticationTokenTypes {
  static readonly TYPE_AUTHORIZATION_CODE = '000_AUTHORIZATION_CODE';
  static readonly TYPE_ACCESS_TOKEN = '100_ACCESS_TOKEN';
  static readonly TYPE_REFRESH_TOKEN = '200_REFRESH_TOKEN';
}

export class AuthenticationModes {
  static readonly ANY = 'any';
  static readonly ALL = 'all';

  static readonly SCHEME_SET = new Set([this.ANY, this.ALL]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TAuthMode = TConstValue<typeof AuthenticationModes>;

export class JWKSModes {
  static readonly ISSUER = 'issuer';
  static readonly VERIFIER = 'verifier';

  static readonly SCHEME_SET = new Set([this.ISSUER, this.VERIFIER]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TJWKSMode = TConstValue<typeof JWKSModes>;

export class JWKSKeyDrivers {
  static readonly TEXT = 'text';
  static readonly FILE = 'file';

  static readonly SCHEME_SET = new Set([this.TEXT, this.FILE]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TJWKSKeyDriver = TConstValue<typeof JWKSKeyDrivers>;

export class JWKSKeyFormats {
  static readonly PEM = 'pem';
  static readonly JWK = 'jwk';

  static readonly SCHEME_SET = new Set([this.PEM, this.JWK]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TJWKSKeyFormat = TConstValue<typeof JWKSKeyFormats>;

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
