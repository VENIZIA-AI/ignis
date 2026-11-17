import { HTTP, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  AuthenticateBindingKeys,
  type IJWSTokenServiceOptions,
  type IJWTIssueClaims,
  type IJWTTokenPayload,
  inject,
  type TGetTokenExpiresFn,
} from '@venizia/ignis-kernel';
import { type Env } from 'hono';
import { JoseLoader } from '../jose-loader';
import { AbstractBearerTokenService } from './abstract.service';

/** Symmetric JWT (JWS) token service with optional AES-encrypted payloads. */
export class JWSTokenService<E extends Env = Env> extends AbstractBearerTokenService<E> {
  /** The shortest `jwtSecret` accepted, in bytes: an HMAC key is as strong as it is long, and 32 bytes is the size of a SHA-256 output. */
  static readonly MIN_SECRET_BYTES = 32;

  protected jwtSecret: Uint8Array;

  /**
   * Refuses a `jwtSecret` shorter than {@link JWSTokenService.MIN_SECRET_BYTES} (counted in UTF-8 bytes, not
   * characters), saying how to make one. The secret is never echoed. The component calls it at boot and the
   * service when it is built.
   */
  static assertSecretStrength(opts: { scope: string; secret: string }): void {
    const bytes = new TextEncoder().encode(opts.secret).length;

    if (bytes >= JWSTokenService.MIN_SECRET_BYTES) {
      return;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[${opts.scope}] jwtSecret is too short: ${bytes} bytes, at least ${JWSTokenService.MIN_SECRET_BYTES} are required | Generate one with: openssl rand -base64 48`,
    });
  }

  constructor(
    @inject({ key: AuthenticateBindingKeys.JWT_OPTIONS })
    protected options: IJWSTokenServiceOptions,
  ) {
    super({ scope: JWSTokenService.name });

    const { aesAlgorithm, jwtSecret, applicationSecret, getTokenExpiresFn } = options ?? {};

    if (!jwtSecret) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[JWSTokenService] Invalid jwtSecret',
      });
    }

    if (!getTokenExpiresFn) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[JWSTokenService] Invalid getTokenExpiresFn',
      });
    }

    this.configureClaims({
      options,
      pinnedAlgorithms: [options.headerAlgorithm ?? 'HS256'],
    });
    JWSTokenService.assertSecretStrength({ scope: JWSTokenService.name, secret: jwtSecret });

    this.configurePayloadEncryption({
      aesAlgorithm,
      applicationSecret,
      fieldCodecs: options.fieldCodecs,
    });
    this.jwtSecret = new TextEncoder().encode(this.options.jwtSecret);
  }

  protected override async doVerify(token: string): Promise<IJWTTokenPayload> {
    const { jwtVerify } = await JoseLoader.load();
    const decodedToken = await jwtVerify<IJWTTokenPayload>(
      token,
      this.jwtSecret,
      this.verifyOptions!,
    );

    return this.decryptPayload({ result: decodedToken });
  }

  override async getSigner(opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn: TGetTokenExpiresFn;
    claims?: IJWTIssueClaims;
  }) {
    const { SignJWT } = await JoseLoader.load();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = await opts.getTokenExpiresFn();

    const encryptedPayload = await this.encryptPayload(opts.payload);

    const signer = new SignJWT(Object.assign({}, encryptedPayload))
      .setProtectedHeader({ alg: this.options.headerAlgorithm ?? 'HS256' })
      .setIssuedAt()
      .setExpirationTime(now + expiresIn)
      .setNotBefore(now);

    return this.applySignClaims({ signer, payload: encryptedPayload, claims: opts.claims });
  }

  protected override getSigningKey(): ValueOrPromise<Uint8Array> {
    if (!this.jwtSecret) {
      throw getError({ message: '[getSigningKey] Invalid jwtSecret!' });
    }

    return this.jwtSecret;
  }

  protected override getDefaultTokenExpiresFn(): TGetTokenExpiresFn {
    return this.options.getTokenExpiresFn;
  }
}
