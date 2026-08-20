import type { TContext } from '@/base/controllers/common/types';
import type { IdType } from '@/base/models/common/types';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import type { AnyObject, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { AESAlgorithmType, IPayloadCipher } from '@venizia/ignis-helpers/core';
import type { Env } from 'hono';
import { type MiddlewareHandler } from 'hono';
import type { JWTPayload } from 'jose';
import type { TChangePasswordRequest, TSignInRequest, TSignUpRequest } from '../../models/requests';
import type { JOSEStandards, JWKSModes } from './constants';
import { type TAuthMode, type TJWKSKeyDriver, type TJWKSKeyFormat } from './constants';

export type TDefineAuthControllerOpts = {
  restPath?: string;
  serviceKey: string;
  requireAuthenticatedSignUp?: boolean;
  payload?: {
    signIn?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    signUp?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    changePassword?: {
      request: { schema?: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    refreshToken?: {
      response: { schema: TAnyObjectSchema };
    };
    getUserInformation?: {
      response: { schema: TAnyObjectSchema };
    };
  };
};

export type TAuthenticationRestOptions = {} & (
  | { useAuthController?: false | undefined }
  | {
      useAuthController: true;
      controllerOpts: TDefineAuthControllerOpts;
    }
);

/**
 * Claim checks applied when VERIFYING a JWT. Field names and types mirror jose's `JWTVerifyOptions`
 * exactly, so this is a pass-through with no translation layer.
 *
 * Every field is optional and unset by default, which is today's behaviour: nothing is checked
 * beyond the signature and the time claims. In a fleet where every verifier points at the same
 * issuer JWKS, that means a token minted for one service is accepted verbatim by every other -
 * `audience` is what makes "this token was meant for me" a cryptographic statement rather than a
 * convention.
 */
export interface IJWTVerifyOptions {
  /** Expected `aud`. Setting it makes the claim required. Matching is jose's OVERLAP semantics, not equality: a token carrying `['a','b']` satisfies `audience: 'a'`. Enforce single-valued audiences at issue time if that matters. */
  audience?: string | string[];

  /** Expected `iss`. Setting it makes the claim required. */
  issuer?: string | string[];

  /** Expected `sub`. Setting it makes the claim required. */
  subject?: string;

  /** Clock skew tolerance: seconds, or a jose duration string such as `'30 seconds'`. */
  clockTolerance?: string | number;

  /** Accepted JWS `alg` header values. Unset means the accepted algorithm is decided entirely by what the JWKS serves. */
  algorithms?: string[];

  /** Caps elapsed time since `iat`. The real replay window for a short-lived assertion, independent of whatever `exp` the caller chose to stamp. */
  maxTokenAge?: string | number;

  /** Expected JWS `typ` header. The standard defence against cross-token-type confusion when one JWKS serves more than one kind of token. */
  typ?: string;

  /** Claims that must be present, beyond those implied by the checks above. */
  requiredClaims?: string[];
}

/** Default `iss` / `aud` stamped on every issued token. Configured values are AUTHORITATIVE - see {@link IJWTIssueClaims}. */
export interface IJWTSignOptions {
  issuer?: string;
  audience?: string | string[];
}

/**
 * Per-token registered claims, passed to `generate()`.
 *
 * This is the supported way to vary `aud` or `sub` per token. Putting them on the payload used to
 * work by accident - `iss`, `aud`, `sub` and `jti` ride through the AES envelope in the clear
 * because they are standard JWT fields - but a claim the payload can set is a claim any caller who
 * shapes the payload can forge. These win over {@link IJWTSignOptions}; the payload never does.
 */
export interface IJWTIssueClaims {
  issuer?: string;
  audience?: string | string[];
  subject?: string;
  jwtId?: string;
}

export interface IJWSTokenServiceOptions {
  headerAlgorithm?: string;
  jwtSecret: string;
  getTokenExpiresFn: TGetTokenExpiresFn;
  aesAlgorithm?: AESAlgorithmType;
  applicationSecret?: string;
  fieldCodecs?: IPayloadFieldCodec[];
  /** Overrides the payload cipher - pass `LegacyAES` to keep reading tokens issued before the PBKDF2 envelope. */
  cipher?: IPayloadCipher;

  /** Claim checks applied on verify. Unset means signature and time claims only. */
  verify?: IJWTVerifyOptions;

  /** Claims stamped on every issued token. A configured value WINS over one supplied in the payload. */
  sign?: IJWTSignOptions;
}

export type TJWKSAlgorithm = 'ES256' | 'RS256' | 'EdDSA';

export interface IJWKSIssuerOptions {
  mode: typeof JWKSModes.ISSUER;
  algorithm: TJWKSAlgorithm;
  rest?: { path: string };
  keys: {
    driver: TJWKSKeyDriver;
    format: TJWKSKeyFormat;
    private: string; // Key content (text) or file path (file) — PEM or JWK based on format
    public: string; // Key content (text) or file path (file) — PEM or JWK based on format
  };
  kid: string;
  getTokenExpiresFn: TGetTokenExpiresFn;
  aesAlgorithm?: AESAlgorithmType;
  applicationSecret?: string;
  fieldCodecs?: IPayloadFieldCodec[];
  /** Overrides the payload cipher - pass `LegacyAES` to keep reading tokens issued before the PBKDF2 envelope. */
  cipher?: IPayloadCipher;

  /** Claim checks applied on verify. Unset means signature and time claims only. */
  verify?: IJWTVerifyOptions;

  /** Claims stamped on every issued token. A configured value WINS over one supplied in the payload. */
  sign?: IJWTSignOptions;
}

export interface IJWKSVerifierOptions {
  mode: typeof JWKSModes.VERIFIER;
  jwksUrl: string;
  cacheTtlMs?: number; // Default: 43_200_000 (12h)
  cooldownMs?: number; // Default: 30_000 (30s)
  aesAlgorithm?: AESAlgorithmType;
  applicationSecret?: string;
  fieldCodecs?: IPayloadFieldCodec[];
  /** Overrides the payload cipher - pass `LegacyAES` to keep reading tokens issued before the PBKDF2 envelope. */
  cipher?: IPayloadCipher;

  /** Claim checks applied on verify. Unset means signature and time claims only. */
  verify?: IJWTVerifyOptions;
}

export type TJWKSTokenServiceOptions = IJWKSIssuerOptions | IJWKSVerifierOptions;

export type TJWTTokenServiceOptions =
  | { standard: typeof JOSEStandards.JWS; options: IJWSTokenServiceOptions }
  | { standard: typeof JOSEStandards.JWKS; options: TJWKSTokenServiceOptions };

export type TBasicTokenServiceOptions<E extends Env = Env> = {
  /** Callback to verify basic auth credentials. Returns IAuthUser if valid, null otherwise. */
  verifyCredentials: (opts: {
    credentials: { username: string; password: string };
    context: TContext<E, string>;
  }) => Promise<IAuthUser | null>;
};
export interface IAuthenticateOptions {
  restOptions?: TAuthenticationRestOptions;
  jwtOptions?: TJWTTokenServiceOptions;
  basicOptions?: TBasicTokenServiceOptions;
}

export interface IAuthUser {
  userId: IdType;
  [extra: string | symbol]: any;
}

export interface IJWTTokenPayload extends JWTPayload, IAuthUser {
  userId: IdType;
  roles: { id: IdType; identifier: string; priority: number }[];

  clientId?: string;
  provider?: string;
  email?: string;
  name?: string;

  [extra: string | symbol]: any;
}

export interface IPayloadFieldCodec<T = unknown> {
  key: string;
  serialize(opts: { value: T }): string;
  deserialize(opts: { raw: string }): T;
}

export type TGetTokenExpiresFn = () => ValueOrPromise<number>;

export interface IAuthenticationStrategy<E extends Env = Env> {
  name: string;
  authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}

export type TAuthenticateFn<RouteEnv extends Env = Env> = (opts: {
  strategies: string[];
  mode?: TAuthMode;
}) => MiddlewareHandler<RouteEnv>;

export interface IAuthService<
  E extends Env = Env,
  // SignIn types
  SIRQ extends TSignInRequest = TSignInRequest,
  SIRS = AnyObject,
  // SignUp types
  SURQ extends TSignUpRequest = TSignUpRequest,
  SURS = AnyObject,
  // ChangePassword types
  CPRQ extends TChangePasswordRequest = TChangePasswordRequest,
  CPRS = AnyObject,
  // UserInformation types
  UIRQ = AnyObject,
  UIRS = AnyObject,
  // RefreshToken types
  RTRS = AnyObject,
> {
  signIn(context: TContext<E>, opts: SIRQ): Promise<SIRS>;
  signUp(context: TContext<E>, opts: SURQ): Promise<SURS>;
  changePassword(context: TContext<E>, opts: CPRQ): Promise<CPRS>;
  getUserInformation?(context: TContext<E>, opts: UIRQ): Promise<UIRS>;
  refreshToken?(context: TContext<E>): Promise<RTRS>;
}
