import type { AESAlgorithmType } from '@venizia/ignis-helpers';
import { AES } from '@venizia/ignis-helpers';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError, RecordUtility } from '@venizia/ignis-helpers/core';
import type {
  IJWTClaimsOptions,
  IJWTIssueClaims,
  IJWTTokenPayload,
  IJWTVerifyOptions,
  IPayloadFieldCodec,
  TContext,
  TGetTokenExpiresFn,
} from '@venizia/ignis-kernel';
import {
  Authentication,
  AuthenticationErrors,
  BaseService,
  ServiceAssertion,
} from '@venizia/ignis-kernel';
import type { Env } from 'hono';
import { JoseLoader } from '../jose-loader';
import type { JWTPayload, JWTVerifyOptions, JWTVerifyResult, SignJWT } from 'jose';

/** What a token service is configured with for claims: the required `claims`, the `verify` checks, and the removed `sign` it refuses. */
export interface IClaimsConfigSource {
  claims?: unknown;
  verify?: unknown;
  /** Removed: refused with a message that points to `claims`. */
  sign?: unknown;
}

/** What {@link AbstractBearerTokenService.resolveClaimsConfig} answers: the validated claims and the verify options jose receives. */
export interface IResolvedClaimsConfig {
  claims: IJWTClaimsOptions;
  verify: JWTVerifyOptions & { algorithms: string[] };
}

/** Abstract base for Bearer-token services (JWS, JWKS) with optional AES payload encryption. */
export abstract class AbstractBearerTokenService<E extends Env = Env> extends BaseService {
  /** Standard JWT fields that are never encrypted. */
  static readonly JWT_COMMON_FIELDS = new Set<keyof JWTPayload>([
    'iss',
    'sub',
    'aud',
    'jti',
    'nbf',
    'exp',
    'iat',
  ]);

  protected aes: AES | null = null;
  protected applicationSecret: string | null = null;
  protected fieldCodecs: Map<string, IPayloadFieldCodec> = new Map();

  /** Configured `iss` / `aud`: stamped on every issued token, authoritative over anything the payload carries, and required on every verified one. */
  protected claimOptions: IJWTClaimsOptions | null = null;

  /** What jose verifies against: the claims, the algorithm pin and the `verify` checks. */
  protected verifyOptions: JWTVerifyOptions | null = null;

  /** The keys a `claims` object may hold. */
  static readonly CLAIM_KEYS: ReadonlyArray<string> = ['issuer', 'audience'];

  /**
   * Validates the claims configuration of a token service and answers what the service uses. It throws, naming the
   * key, when `claims.issuer` or `claims.audience` is missing or empty, when `claims` holds another key, when the
   * removed `sign` or `verify.issuer` / `verify.audience` is still passed, and when no algorithm is pinned.
   * `pinnedAlgorithms` is what the service signs with; a verifier has none and requires `verify.algorithms`.
   * The component calls it at boot, and a service calls it when it is built, so neither can start without them.
   */
  static resolveClaimsConfig(opts: {
    scope: string;
    options: IClaimsConfigSource;
    pinnedAlgorithms?: string[];
  }): IResolvedClaimsConfig {
    const { scope, options, pinnedAlgorithms } = opts;
    const fail = (detail: string) =>
      getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] ${detail}`,
      });

    if (options.sign !== undefined) {
      throw fail(
        '`sign` was removed | put the issuer and the audience in `claims: { issuer, audience }`: they are stamped on every token and required on every verified one',
      );
    }

    if (options.verify !== undefined && !RecordUtility.isPlainRecord(options.verify)) {
      throw fail(
        'verify must be an object | its checks (maxTokenAge, subject, ...) would be dropped silently',
      );
    }

    const verify = RecordUtility.isPlainRecord(options.verify) ? options.verify : {};

    for (const key of AbstractBearerTokenService.CLAIM_KEYS) {
      if (key in verify) {
        throw fail(
          `verify.${key} was removed | set claims.${key}: it is stamped on every token and required on every verified one`,
        );
      }
    }

    const { claims } = options;

    if (!RecordUtility.isPlainRecord(claims)) {
      throw fail(
        'claims is required | pass claims: { issuer: string, audience: string | string[] }: a token signed with the same key for another purpose must not authenticate a request',
      );
    }

    const unknown = Object.keys(claims).filter(
      (key) => !AbstractBearerTokenService.CLAIM_KEYS.includes(key),
    );

    if (unknown.length > 0) {
      throw fail(
        `claims holds unknown keys ${JSON.stringify(unknown)} | accepted: ${AbstractBearerTokenService.CLAIM_KEYS.join(', ')}`,
      );
    }

    const { issuer, audience } = claims;
    const isName = (value: unknown): value is string =>
      typeof value === 'string' && value.trim().length > 0;

    if (!isName(issuer)) {
      throw fail('claims.issuer is required | a non-empty string');
    }

    if (
      !isName(audience) &&
      !(Array.isArray(audience) && audience.length > 0 && audience.every(isName))
    ) {
      throw fail('claims.audience is required | a non-empty string or a non-empty list of them');
    }

    const algorithms = verify.algorithms ?? pinnedAlgorithms;

    if (!Array.isArray(algorithms) || algorithms.length === 0 || !algorithms.every(isName)) {
      throw fail(
        "verify.algorithms is required | the accepted JWS algorithms, for example ['RS256']: a verifier cannot know what the issuer signs with",
      );
    }

    if (algorithms.some((algorithm) => algorithm.trim().toLowerCase() === 'none')) {
      throw fail("the algorithm 'none' is refused | a token with no signature verifies nothing");
    }

    return {
      claims: { issuer, audience: Array.isArray(audience) ? [...audience] : audience },
      verify: {
        ...(verify as IJWTVerifyOptions),
        issuer,
        audience: Array.isArray(audience) ? [...audience] : audience,
        algorithms: [...algorithms],
      },
    };
  }

  /** Validates the claims configuration (see {@link AbstractBearerTokenService.resolveClaimsConfig}) and keeps the result. */
  protected configureClaims(opts: {
    options: IClaimsConfigSource;
    pinnedAlgorithms?: string[];
  }): void {
    const resolved = AbstractBearerTokenService.resolveClaimsConfig({
      scope: this.scope,
      options: opts.options,
      pinnedAlgorithms: opts.pinnedAlgorithms,
    });

    this.claimOptions = resolved.claims;
    this.verifyOptions = resolved.verify;
  }

  /** Configures AES payload encryption and field codecs. Both aesAlgorithm and applicationSecret required to activate encryption. */
  protected configurePayloadEncryption(opts: {
    aesAlgorithm?: AESAlgorithmType;
    applicationSecret?: string;
    fieldCodecs?: IPayloadFieldCodec[];
  }): void {
    const { aesAlgorithm = 'aes-256-cbc', applicationSecret, fieldCodecs } = opts;

    if (fieldCodecs) {
      for (const codec of fieldCodecs) {
        this.fieldCodecs.set(codec.key, codec);
      }
    }

    if (!applicationSecret) {
      return;
    }

    this.aes = AES.withAlgorithm(aesAlgorithm);
    this.applicationSecret = applicationSecret;
  }

  extractCredentials(context: TContext<E, string>): { type: string; token: string } {
    const request = context.req;

    const authHeaderValue = request.header('Authorization');

    if (!authHeaderValue) {
      throw getError({
        error: AuthenticationErrors.HEADER_MISSING,
        message: 'Unauthorized user! Missing authorization header',
      });
    }

    if (!authHeaderValue.startsWith(Authentication.TYPE_BEARER)) {
      throw getError({
        error: AuthenticationErrors.SCHEME_INVALID,
        message: 'Unauthorized user! Invalid schema of request token!',
      });
    }

    const parts = authHeaderValue.split(' ');

    if (parts.length !== 2) {
      throw getError({
        error: AuthenticationErrors.HEADER_MALFORMED,
        message: `Authorization header value is invalid format. It must follow the pattern: 'Bearer xx.yy.zz' where xx.yy.zz is a valid JWT token.`,
      });
    }

    const [tokenType, tokenValue] = parts;

    return { type: tokenType, token: tokenValue };
  }

  async verify(opts: { type: string; token: string }): Promise<IJWTTokenPayload> {
    const { token } = opts;

    if (!token) {
      this.logger.for(this.verify.name).error('Missing token for validating request!');
      throw getError({
        error: AuthenticationErrors.TOKEN_MISSING,
        message: '[verify] Invalid request token!',
      });
    }

    try {
      await this.assertNotServiceAssertion({ token });
      const result = await this.doVerify(token);

      return result;
    } catch (error) {
      // No log here - `cause` carries the reason (JWTExpired, signature mismatch) to the error handler, which logs the request once. An expired token is the caller's problem, hence `warn`.
      throw getError({
        error: AuthenticationErrors.TOKEN_INVALID,
        message: '[verify] Invalid or expired token',
        logLevel: 'warn',
        cause: error,
      });
    }
  }

  /**
   * A service assertion (`typ: svc+jwt`) is not a user token. When a JWKS issuer shares the key of the service
   * assertions and the names collide, an assertion would otherwise verify here, so the user-token path refuses it.
   */
  protected async assertNotServiceAssertion(opts: { token: string }): Promise<void> {
    const { decodeProtectedHeader } = await JoseLoader.load();
    const { typ } = decodeProtectedHeader(opts.token);
    const kind = typeof typ === 'string' ? typ.toLowerCase().replace(/^application\//, '') : '';

    if (kind === ServiceAssertion.TYP) {
      throw getError({
        error: AuthenticationErrors.TOKEN_INVALID,
        message: '[verify] A service assertion is not a user token',
      });
    }
  }

  async generate(opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn?: TGetTokenExpiresFn;
    /** Per-token registered claims. The supported way to vary `aud` / `sub`; the payload is not. */
    claims?: IJWTIssueClaims;
  }): Promise<string> {
    const { payload, claims, getTokenExpiresFn = this.getDefaultTokenExpiresFn() } = opts;

    if (!payload) {
      throw getError({
        error: AuthenticationErrors.TOKEN_PAYLOAD_INVALID,
        message: '[generate] Invalid token payload!',
      });
    }

    const signer = await this.getSigner({ payload, getTokenExpiresFn, claims });

    try {
      const result = await this.getSigningKey();
      const rs = await signer.sign(result);

      return rs;
    } catch (error) {
      this.logger.for(this.generate.name).error('Failed to generate token | Error: %s', error);
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[generate] Failed to generate token',
      });
    }
  }

  /** A `null` is written as `null` whatever the field's codec is: a codec converts a value, and `null` is none. */
  protected serializeField(opts: { key: string; value: any }): string {
    const { key, value } = opts;
    const codec = value === null ? undefined : this.fieldCodecs.get(key);

    if (codec) {
      return codec.serialize({ value });
    }

    return JSON.stringify(value);
  }

  /**
   * With `applicationSecret` set, AES-encrypts the key and the value of every claim outside `JWT_COMMON_FIELDS`;
   * without it, returns the payload as is. A `null` claim is encrypted like any other value and decodes as `null`,
   * so the token decodes to the same payload with encryption on or off and `null` stays distinct from absent. An
   * `undefined` claim is skipped, as JSON drops it.
   */
  async encryptPayload(payload: IJWTTokenPayload): Promise<Record<string, any>> {
    if (!this.aes || !this.applicationSecret) {
      return payload;
    }

    const rs: Record<string, string> = {};

    const keys = Object.keys(payload);

    for (const key of keys) {
      const value = payload[key];

      if (AbstractBearerTokenService.JWT_COMMON_FIELDS.has(key)) {
        rs[key] = value;
        continue;
      }

      // Only `undefined` is skipped: JSON drops it too, so the claim is absent either way. `null` is a value, and
      // `serializeField` writes it as `null`, which `deserializeField` reads back, so an encrypted token decodes the
      // same payload as a plain one.
      if (value === undefined) {
        continue;
      }

      const encryptedKey = await this.aes.encrypt({
        message: key,
        secret: this.applicationSecret,
      });

      const serialized = this.serializeField({ key, value });

      const encryptedValue = await this.aes.encrypt({
        message: serialized,
        secret: this.applicationSecret,
      });
      rs[encryptedKey] = encryptedValue;
    }

    return rs;
  }

  /** The text `null` reads as `null` before any codec sees it, the other half of {@link serializeField}. */
  protected deserializeField(opts: { key: string; value: string }) {
    const { key, value } = opts;
    const codec = value === 'null' ? undefined : this.fieldCodecs.get(key);

    if (codec) {
      return codec.deserialize({ raw: value });
    }

    return JSON.parse(value);
  }

  /**
   * Stamps the configured `iss` / `aud` onto a signer, plus any per-token claims the caller passed.
   *
   * The configured value is AUTHORITATIVE. `iss` and `aud` are in `JWT_COMMON_FIELDS`, so they ride
   * through the AES envelope in the clear and an application-shaped payload can carry them - an
   * issuer identity any payload could overwrite would not be an identity. A conflicting payload
   * claim is overwritten and reported.
   *
   * Per-token audience is an explicit argument rather than a smuggled payload key, so the caller
   * that legitimately needs one says so.
   */
  protected applySignClaims(opts: {
    signer: SignJWT;
    payload: Record<string, any>;
    claims?: IJWTIssueClaims;
  }): SignJWT {
    const { signer, payload, claims } = opts;
    const configured = this.claimOptions;

    const issuer = claims?.issuer ?? configured?.issuer;
    const audience = claims?.audience ?? configured?.audience;

    const logger = this.logger.for(this.applySignClaims.name);

    if (issuer !== undefined) {
      if (payload.iss !== undefined && payload.iss !== issuer) {
        logger.warn(
          'Payload iss overridden by the configured issuer | payload: %s | configured: %s',
          payload.iss,
          issuer,
        );
      }

      signer.setIssuer(issuer);
    }

    if (audience !== undefined) {
      if (payload.aud !== undefined) {
        logger.warn('Payload aud overridden | payload: %j | applied: %j', payload.aud, audience);
      }

      signer.setAudience(audience);
    }

    if (claims?.subject !== undefined) {
      signer.setSubject(claims.subject);
    }

    if (claims?.jwtId !== undefined) {
      signer.setJti(claims.jwtId);
    }

    return signer;
  }

  async decryptPayload(opts: {
    result: JWTVerifyResult<IJWTTokenPayload>;
  }): Promise<IJWTTokenPayload> {
    const { payload, protectedHeader } = opts.result;

    if (!this.aes || !this.applicationSecret) {
      return payload as IJWTTokenPayload;
    }

    this.logger
      .for(this.decryptPayload.name)
      .debug('JWT Token | payload: %j | header: %j', payload, protectedHeader);

    const rs: any = {};

    for (const key in payload) {
      if (AbstractBearerTokenService.JWT_COMMON_FIELDS.has(key)) {
        rs[key] = payload[key];
        continue;
      }

      const decryptedKey = await this.aes.decrypt({
        message: key,
        secret: this.applicationSecret,
      });
      const decryptedValue = await this.aes.decrypt({
        message: payload[key],
        secret: this.applicationSecret,
      });

      rs[decryptedKey] = this.deserializeField({ key: decryptedKey, value: decryptedValue });
    }

    return rs;
  }

  protected abstract doVerify(token: string): Promise<IJWTTokenPayload>;

  abstract getSigner(opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn: TGetTokenExpiresFn;
    claims?: IJWTIssueClaims;
  }): Promise<SignJWT>;

  protected abstract getSigningKey(): ValueOrPromise<Uint8Array | CryptoKey>;

  protected abstract getDefaultTokenExpiresFn(): TGetTokenExpiresFn;
}
