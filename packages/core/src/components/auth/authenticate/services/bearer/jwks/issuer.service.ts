import { inject } from '@/base/metadata/injectors';
import { getError, HTTP, TNullable, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env } from 'hono';
import {
  CryptoKey,
  exportJWK,
  importJWK,
  importPKCS8,
  importSPKI,
  JWK,
  jwtVerify,
  SignJWT,
} from 'jose';
import { readFile } from 'node:fs/promises';
import {
  AuthenticateBindingKeys,
  IJWKSIssuerOptions,
  IJWTTokenPayload,
  JWKSKeyDrivers,
  JWKSKeyFormats,
  TGetTokenExpiresFn,
} from '../../../common';
import { AbstractJWKSTokenService } from './abstract.service';

export class JWKSIssuerTokenService<E extends Env = Env> extends AbstractJWKSTokenService<E> {
  protected privateKey: TNullable<CryptoKey | Uint8Array> = null;
  protected publicKey: TNullable<CryptoKey | Uint8Array> = null;
  protected jwks: { keys: JWK[] } | null = null;

  constructor(
    @inject({ key: AuthenticateBindingKeys.JWKS_OPTIONS })
    protected options: IJWKSIssuerOptions,
  ) {
    super({ scope: JWKSIssuerTokenService.name });

    this.configurePayloadEncryption({
      aesAlgorithm: this.options.aesAlgorithm,
      applicationSecret: this.options.applicationSecret,
    });
  }

  // --------------------------------------------------------------------------------------
  protected override async initialize(): Promise<void> {
    const { keys, algorithm } = this.options;

    const raw = await this.resolveKeyContent({ keys });
    const built = await this.parseKeyMaterial({ raw, algorithm, keys });

    this.privateKey = built.priv;
    this.publicKey = built.pub;

    const publicJWK = await exportJWK(this.publicKey!);
    publicJWK.kid = this.options.kid;
    publicJWK.alg = algorithm;
    publicJWK.use = 'sig';

    this.jwks = { keys: [publicJWK] };

    this.initialized = true;

    this.logger
      .for(this.initialize.name)
      .info(
        'JWKS issuer initialized | driver: %s | format: %s | kid: %s',
        keys.driver,
        keys.format,
        this.options.kid,
      );
  }

  // --------------------------------------------------------------------------------------
  protected async resolveKeyContent(opts: { keys: IJWKSIssuerOptions['keys'] }) {
    const { keys } = opts;

    switch (keys.driver) {
      case JWKSKeyDrivers.FILE: {
        const [priv, pub] = await Promise.all([
          readFile(keys.private, 'utf-8'),
          readFile(keys.public, 'utf-8'),
        ]);
        return { priv, pub };
      }
      case JWKSKeyDrivers.TEXT: {
        return {
          priv: keys.private,
          pub: keys.public,
        };
      }
      default: {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[JWKSIssuerTokenService] Unknown key driver: ${keys.driver}`,
        });
      }
    }
  }

  // --------------------------------------------------------------------------------------
  protected async parseKeyMaterial(opts: {
    raw: { priv: string; pub: string };
    algorithm: IJWKSIssuerOptions['algorithm'];
    keys: IJWKSIssuerOptions['keys'];
  }) {
    const { raw, algorithm, keys } = opts;

    if (!raw.priv) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[JWKSIssuerTokenService] Invalid raw.priv key!',
      });
    }

    if (!raw.pub) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[JWKSIssuerTokenService] Invalid raw.pub key!',
      });
    }

    switch (keys.format) {
      case JWKSKeyFormats.PEM: {
        const priv = await importPKCS8(raw.priv, algorithm);
        const pub = await importSPKI(raw.pub, algorithm);
        return { priv, pub };
      }
      case JWKSKeyFormats.JWK: {
        try {
          const parsed = {
            priv: JSON.parse(raw.priv) as JWK,
            pub: JSON.parse(raw.pub) as JWK,
          };

          const priv = await importJWK(parsed.priv, algorithm);
          const pub = await importJWK(parsed.pub, algorithm);
          return { priv, pub };
        } catch (error) {
          this.logger.for(this.parseKeyMaterial.name).error('Invalid JWK key material | Error: %s', error);
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: '[JWKSIssuerTokenService] Invalid JWK key material',
          });
        }
      }
      default: {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[JWKSIssuerTokenService] Unknown key format: ${keys.format}`,
        });
      }
    }
  }

  // --------------------------------------------------------------------------------------
  protected override async doVerify(token: string): Promise<IJWTTokenPayload> {
    await this.ensureInitialized();
    const result = await jwtVerify<IJWTTokenPayload>(token, this.publicKey!);
    return this.decryptPayload({ result });
  }

  // --------------------------------------------------------------------------------------
  override async getSigner(opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn: TGetTokenExpiresFn;
  }) {
    await this.ensureInitialized();

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = await opts.getTokenExpiresFn();

    const encryptedPayload = this.encryptPayload(opts.payload);

    return new SignJWT({ ...encryptedPayload })
      .setProtectedHeader({ alg: this.options.algorithm, kid: this.options.kid })
      .setIssuedAt()
      .setExpirationTime(now + expiresIn)
      .setNotBefore(now);
  }

  // --------------------------------------------------------------------------------------
  protected override getSigningKey(): ValueOrPromise<Uint8Array | CryptoKey> {
    if (!this.privateKey) {
      throw getError({ message: '[getSigningKey] Invalid privateKey!' })
    }

    return this.privateKey;
  }

  protected override getDefaultTokenExpiresFn(): TGetTokenExpiresFn {
    return this.options.getTokenExpiresFn;
  }

  // --------------------------------------------------------------------------------------
  getJWKS(): { keys: JWK[] } {
    if (!this.jwks) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[JWKSIssuerTokenService] JWKS not initialized yet. Call getJWKSAsync() instead.',
      });
    }

    return this.jwks;
  }

  async getJWKSAsync(): Promise<{ keys: JWK[] }> {
    await this.ensureInitialized();
    return this.jwks!;
  }
}
