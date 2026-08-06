import { inject } from '@/base/metadata/injectors';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { Env } from 'hono';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import {
  AuthenticateBindingKeys,
  IJWKSVerifierOptions,
  IJWTTokenPayload,
  TGetTokenExpiresFn,
} from '../../../common';
import { AbstractJWKSTokenService } from './abstract.service';

export class JWKSVerifierTokenService<E extends Env = Env> extends AbstractJWKSTokenService<E> {
  protected jwksVerifier: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    @inject({ key: AuthenticateBindingKeys.JWKS_OPTIONS })
    protected options: IJWKSVerifierOptions,
  ) {
    super({ scope: JWKSVerifierTokenService.name });
    this.configurePayloadEncryption({
      aesAlgorithm: this.options.aesAlgorithm,
      applicationSecret: this.options.applicationSecret,
      fieldCodecs: this.options.fieldCodecs,
      cipher: this.options.cipher,
    });
  }

  protected override async initialize(): Promise<void> {
    const jwksUrl = new URL(this.options.jwksUrl);
    this.jwksVerifier = createRemoteJWKSet(jwksUrl, {
      cacheMaxAge: this.options.cacheTtlMs ?? 43_200_000,
      cooldownDuration: this.options.cooldownMs ?? 30_000,
    });

    this.initialized = true;

    this.logger
      .for(this.initialize.name)
      .info('JWKS verifier initialized | url: %s', this.options.jwksUrl);
  }

  protected override async doVerify(token: string): Promise<IJWTTokenPayload> {
    await this.ensureInitialized();
    const result = await jwtVerify<IJWTTokenPayload>(token, this.jwksVerifier!);
    return this.decryptPayload({ result });
  }

  override async getSigner(_opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn: TGetTokenExpiresFn;
  }): Promise<SignJWT> {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: '[JWKSVerifierTokenService] Verifier mode cannot sign tokens',
    });
  }

  protected override getSigningKey(): never {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: '[JWKSVerifierTokenService] Verifier mode cannot sign tokens',
    });
  }

  protected override getDefaultTokenExpiresFn(): never {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: '[JWKSVerifierTokenService] Verifier mode has no token expiry',
    });
  }
}
