import type { IdType } from '@/base/models/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { AESAlgorithmType } from '@venizia/ignis-helpers/core';
import type { JWTPayload } from 'jose';
import type {
  JOSEStandards,
  JWKSModes,
  TJWKSAlgorithm,
  TJWKSKeyDriver,
  TJWKSKeyFormat,
} from '../constants';
import type { IAuthUser } from './strategy';

/**
 * The `iss` and `aud` of a service: stamped on every token it signs and REQUIRED on every token it
 * verifies. Both are required, and no other key is accepted.
 *
 * Without them a token signed with the same key for another purpose (a password-reset or an invite
 * token that carries a user id) would authenticate a request, and in a fleet where every verifier
 * points at the same issuer JWKS a token minted for one service would be accepted by every other.
 * `audience` is what makes "this token was meant for me" a cryptographic statement rather than a
 * convention.
 */
export interface IJWTClaimsOptions {
  /** The `iss` stamped on every issued token and required on every verified one. */
  issuer: string;

  /** The `aud` stamped on every issued token and required on every verified one. Matching is jose's OVERLAP semantics, not equality: a token carrying `['a','b']` satisfies `audience: 'a'`. Enforce single-valued audiences at issue time if that matters. */
  audience: string | string[];
}

/**
 * The other claim checks applied when VERIFYING a JWT. Field names and types mirror jose's
 * `JWTVerifyOptions`, so this is a pass-through with no translation layer. `issuer` and `audience`
 * are not here: they are the required {@link IJWTClaimsOptions}.
 *
 * Every field is optional and unset by default: nothing is checked beyond the signature, the time
 * claims, the `claims` and the algorithm pin.
 */
export interface IJWTVerifyOptions {
  /** Expected `sub`. Setting it makes the claim required. */
  subject?: string;

  /** Clock skew tolerance: seconds, or a jose duration string such as `'30 seconds'`. */
  clockTolerance?: string | number;

  /** Accepted JWS `alg` header values. Unset pins the one algorithm the service signs with: `headerAlgorithm` (`HS256` by default) of the JWS service, `algorithm` of a JWKS issuer. A JWKS verifier cannot know it, so it requires this ({@link IJWKSVerifierVerifyOptions}). */
  algorithms?: string[];

  /** Caps elapsed time since `iat`. The real replay window for a short-lived assertion, independent of whatever `exp` the caller chose to stamp. */
  maxTokenAge?: string | number;

  /** Expected JWS `typ` header. The standard defence against cross-token-type confusion when one JWKS serves more than one kind of token. */
  typ?: string;

  /** Claims that must be present, beyond those implied by the checks above. */
  requiredClaims?: string[];
}

/**
 * Per-token registered claims, passed to `generate()`.
 *
 * This is the supported way to vary `aud` or `sub` per token. Putting them on the payload used to
 * work by accident - `iss`, `aud`, `sub` and `jti` ride through the AES envelope in the clear
 * because they are standard JWT fields - but a claim the payload can set is a claim any caller who
 * shapes the payload can forge. These win over the configured {@link IJWTClaimsOptions}; the payload never does.
 */
export interface IJWTIssueClaims {
  issuer?: string;
  audience?: string | string[];
  subject?: string;
  jwtId?: string;
}

/**
 * Options of the JWS token service, which signs with the shared `jwtSecret`.
 *
 * `getTokenExpiresFn` is required. AES payload encryption is active only when `applicationSecret` is set.
 */
export interface IJWSTokenServiceOptions {
  /**
   * The JWS `alg` header.
   *
   * @default 'HS256'
   */
  headerAlgorithm?: string;
  jwtSecret: string;
  getTokenExpiresFn: TGetTokenExpiresFn;

  /** The `iss` and `aud` stamped on every issued token and required on every verified one. A configured value WINS over one supplied in the payload. */
  claims: IJWTClaimsOptions;

  /**
   * The AES algorithm of payload encryption, used when `applicationSecret` is set.
   *
   * @default 'aes-256-cbc'
   */
  aesAlgorithm?: AESAlgorithmType;
  applicationSecret?: string;
  fieldCodecs?: IPayloadFieldCodec[];

  /** Further checks applied on verify, beside `claims` and the algorithm pin. */
  verify?: IJWTVerifyOptions;
}

/** Options of a JWKS issuer, which signs tokens with its own key pair. `keys.private` and `keys.public` hold content or a file path according to `keys.driver`. `rest.path` sets where the public key set is served. */
export interface IJWKSIssuerOptions {
  mode: typeof JWKSModes.ISSUER;
  algorithm: TJWKSAlgorithm;
  rest?: {
    /** @default '/certs' */
    path: string;
  };
  keys: {
    driver: TJWKSKeyDriver;
    format: TJWKSKeyFormat;
    private: string; // Key content (text) or file path (file) — PEM or JWK based on format
    public: string; // Key content (text) or file path (file) — PEM or JWK based on format
  };
  kid: string;
  getTokenExpiresFn: TGetTokenExpiresFn;

  /** The `iss` and `aud` stamped on every issued token and required on every verified one. A configured value WINS over one supplied in the payload. */
  claims: IJWTClaimsOptions;

  /**
   * The AES algorithm of payload encryption, used when `applicationSecret` is set.
   *
   * @default 'aes-256-cbc'
   */
  aesAlgorithm?: AESAlgorithmType;
  applicationSecret?: string;
  fieldCodecs?: IPayloadFieldCodec[];

  /** Further checks applied on verify, beside `claims` and the algorithm pin. */
  verify?: IJWTVerifyOptions;
}

/** The verify checks of a JWKS verifier: `algorithms` is required, because the verifier cannot know what the issuer signs with. */
export interface IJWKSVerifierVerifyOptions extends IJWTVerifyOptions {
  /** The JWS `alg` values accepted, for example `['RS256']`. At least one. */
  algorithms: string[];
}

/**
 * Where a JWKS may be fetched over plain `http:`. A JWKS URL is `https:` unless its host is loopback (`localhost`,
 * `127.0.0.0/8`, `::1`) or is named in `http`.
 */
export interface IJWKSHosts {
  /**
   * Host NAMES that may serve a JWKS over `http:`, for example `['identity-service']`: a service inside a private
   * network. Names only, never an address range, because what a name resolves to can change. A name matches on the
   * host and ignores the port. An entry with a port, a scheme or a wildcard refuses the boot.
   */
  http?: string[];
}

/** Options of a JWKS verifier, which checks tokens against the key set served at `jwksUrl`. */
export interface IJWKSVerifierOptions {
  mode: typeof JWKSModes.VERIFIER;
  jwksUrl: string;

  /** The `iss` and `aud` required on every verified token. */
  claims: IJWTClaimsOptions;

  /** Where the key set may be fetched from over `http:`. Unset means `https:` or loopback only. */
  jwks?: { hosts?: IJWKSHosts };

  /**
   * How long the fetched key set stays cached, in ms (12 hours).
   *
   * @default 43_200_000
   */
  cacheTtlMs?: number;

  /**
   * Minimum wait between refetches of the key set, in ms (30 seconds).
   *
   * @default 30_000
   */
  cooldownMs?: number;

  /**
   * The AES algorithm of payload encryption, used when `applicationSecret` is set.
   *
   * @default 'aes-256-cbc'
   */
  aesAlgorithm?: AESAlgorithmType;
  applicationSecret?: string;
  fieldCodecs?: IPayloadFieldCodec[];

  /** Further checks applied on verify, beside `claims`. `algorithms` is required. */
  verify: IJWKSVerifierVerifyOptions;
}

/** Options of the JWKS token service, selected by `mode`. */
export type TJWKSTokenServiceOptions = IJWKSIssuerOptions | IJWKSVerifierOptions;

/** Options of the JWT token service, selected by `standard` (`JWS` or `JWKS`). */
export type TJWTTokenServiceOptions =
  | { standard: typeof JOSEStandards.JWS; options: IJWSTokenServiceOptions }
  | { standard: typeof JOSEStandards.JWKS; options: TJWKSTokenServiceOptions };

/** One role as a token carries it. */
export type TJWTTokenRole = { id: IdType; identifier: string; priority: number };

/**
 * What a token carries. `roles` may be absent: `generate` signs a payload without it as is, `verify`
 * returns it without `roles`, and authorization reads its roles as none. Check it before you read it.
 */
export interface IJWTTokenPayload extends JWTPayload, IAuthUser {
  userId: IdType;
  roles?: TJWTTokenRole[];

  clientId?: string;
  provider?: string;
  email?: string;
  name?: string;

  [extra: string | symbol]: any;
}

/** Converts one payload field, found under `key`, to a string and back around the AES envelope. */
export interface IPayloadFieldCodec<T = unknown> {
  key: string;
  serialize(opts: { value: T }): string;
  deserialize(opts: { raw: string }): T;
}

/** Returns the lifetime of a token to issue, in seconds from now. */
export type TGetTokenExpiresFn = () => ValueOrPromise<number>;
