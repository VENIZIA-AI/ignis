import { BindingKeys } from '@/helpers/inversion';
import type {
  IJWKSIssuerOptions,
  IJWKSVerifierOptions,
  IJWSTokenServiceOptions,
  TJWTTokenServiceOptions,
} from './types/jwt';
import type { IServiceAuthOptions } from './types/service';
import type { TBasicTokenServiceOptions } from './types/basic';
import type { TAuthenticationRestOptions } from './types/rest';

/**
 * Container binding keys under which the authenticate component stores each strategy's options and the service-certs
 * controller path. Each key names ONE value type. `JWT_OPTIONS` is the one an application binds; the keys marked
 * internal are bound by the component from it, and a service injects them.
 */
export class AuthenticateBindingKeys {
  static readonly REST_OPTIONS = BindingKeys.build<TAuthenticationRestOptions>({
    key: '@app/authenticate/rest-options',
  });

  /** What an application binds for JWT or JWKS: the options with their `standard` (JWS or JWKS). */
  static readonly JWT_OPTIONS = BindingKeys.build<TJWTTokenServiceOptions>({
    key: '@app/authenticate/jwt-options',
  });

  /** Internal. The inner options of a JWS setup, bound by the component from `JWT_OPTIONS` and injected by `JWSTokenService`. */
  static readonly JWS_OPTIONS = BindingKeys.build<IJWSTokenServiceOptions>({
    key: '@app/authenticate/jws-options',
  });

  /** Internal. The options of a JWKS issuer, bound by the component from `JWT_OPTIONS` and injected by `JWKSIssuerTokenService`. */
  static readonly JWKS_ISSUER_OPTIONS = BindingKeys.build<IJWKSIssuerOptions>({
    key: '@app/authenticate/jwks-issuer-options',
  });

  /** Internal. The options of a JWKS verifier, bound by the component from `JWT_OPTIONS` and injected by `JWKSVerifierTokenService`. */
  static readonly JWKS_VERIFIER_OPTIONS = BindingKeys.build<IJWKSVerifierOptions>({
    key: '@app/authenticate/jwks-verifier-options',
  });

  static readonly BASIC_OPTIONS = BindingKeys.build<TBasicTokenServiceOptions>({
    key: '@app/authenticate/basic-options',
  });

  static readonly SERVICE_OPTIONS = BindingKeys.build<IServiceAuthOptions>({
    key: '@app/authenticate/service-options',
  });

  static readonly SERVICE_CERTS_PATH = BindingKeys.build<string>({
    key: '@app/authenticate/service-certs-path',
  });
}
