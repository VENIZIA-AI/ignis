import type { TConstValue } from '@venizia/ignis-helpers/common';

/** Names of the strategies the framework ships: `basic`, `jwt` and `service`. */
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
/** A strategy name: a built-in from `AuthenticateStrategy` or any name an application registers. */
export type TAuthStrategy = TConstValue<typeof AuthenticateStrategy> | (string & {});

/** Shared auth string constants: strategy names, `Authorization` header token types, and the request-context keys the authentication middleware reads and writes. */
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

/** Token type tags, each prefixed with a number: authorization code, access token, refresh token. */
export class AuthenticationTokenTypes {
  static readonly TYPE_AUTHORIZATION_CODE = '000_AUTHORIZATION_CODE';
  static readonly TYPE_ACCESS_TOKEN = '100_ACCESS_TOKEN';
  static readonly TYPE_REFRESH_TOKEN = '200_REFRESH_TOKEN';
}

/** How the `authenticate` middleware combines several strategies: `any` passes when one succeeds, `all` requires every one to succeed. */
export class AuthenticationModes {
  static readonly ANY = 'any';
  static readonly ALL = 'all';

  static readonly SCHEME_SET = new Set([this.ANY, this.ALL]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

/** A valid value of `AuthenticationModes`. */
export type TAuthMode = TConstValue<typeof AuthenticationModes>;
