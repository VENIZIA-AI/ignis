import { inject } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { Env } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import {
  AuthenticateBindingKeys,
  IJWSTokenServiceOptions,
  IJWTTokenPayload,
  TGetTokenExpiresFn,
} from '@venizia/ignis-kernel';
import { AbstractBearerTokenService } from './abstract.service';

/** Symmetric JWT (JWS) token service with optional AES-encrypted payloads. */
export class JWSTokenService<E extends Env = Env> extends AbstractBearerTokenService<E> {
  protected jwtSecret: Uint8Array;

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

    this.configurePayloadEncryption({
      aesAlgorithm,
      applicationSecret,
      fieldCodecs: options.fieldCodecs,
      cipher: options.cipher,
    });
    this.jwtSecret = new TextEncoder().encode(this.options.jwtSecret);
  }

  protected override async doVerify(token: string): Promise<IJWTTokenPayload> {
    const decodedToken = await jwtVerify<IJWTTokenPayload>(token, this.jwtSecret, {});
    return this.decryptPayload({ result: decodedToken });
  }

  override async getSigner(opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn: TGetTokenExpiresFn;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = await opts.getTokenExpiresFn();

    const encryptedPayload = this.encryptPayload(opts.payload);

    return new SignJWT(Object.assign({}, encryptedPayload))
      .setProtectedHeader({ alg: this.options.headerAlgorithm ?? 'HS256' })
      .setIssuedAt()
      .setExpirationTime(now + expiresIn)
      .setNotBefore(now);
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
