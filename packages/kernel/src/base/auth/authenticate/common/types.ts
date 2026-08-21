import type { TContext } from '@/base/controllers/common/types';
import type { IdType } from '@/base/models/common/types';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import type { AnyObject, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
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
  serviceOptions?: IServiceAuthOptions;
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
