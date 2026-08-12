import type { TConstValue } from '@venizia/ignis-helpers/common';

export class AuthenticateStrategy {
  static readonly BASIC = 'basic';
  static readonly JWT = 'jwt';

  static readonly SCHEME_SET = new Set([this.BASIC, this.JWT]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}
export type TAuthStrategy = TConstValue<typeof AuthenticateStrategy>;

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
