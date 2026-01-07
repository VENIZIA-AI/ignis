import { TConstValue } from '@/helpers';

// --------------------------------------------------------------------------------------------------------
export class AuthenticateStrategy {
  static readonly BASIC = 'basic';
  static readonly JWT = 'jwt';

  static readonly SCHEME_SET = new Set([this.BASIC, this.JWT]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}
export type TAuthStrategy = TConstValue<typeof AuthenticateStrategy>;

// --------------------------------------------------------------------------------------------------------
export class Authentication {
  static readonly ACCESS_TOKEN_SECRET = 'token.secret';
  static readonly ACCESS_TOKEN_EXPIRES_IN = 86_400;
  static readonly REFRESH_TOKEN_SECRET = 'refresh.secret';
  static readonly REFRESH_TOKEN_EXPIRES_IN = 86_400;

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

// --------------------------------------------------------------------------------------------------------
export class AuthenticationTokenTypes {
  static readonly TYPE_AUTHORIZATION_CODE = '000_AUTHORIZATION_CODE';
  static readonly TYPE_ACCESS_TOKEN = '100_ACCESS_TOKEN';
  static readonly TYPE_REFRESH_TOKEN = '200_REFRESH_TOKEN';
}

// --------------------------------------------------------------------------------------------------------
export class AuthenticationModes {
  static readonly ANY = 'any';
  static readonly ALL = 'all';
}

export type TAuthMode = TConstValue<typeof AuthenticationModes>;
