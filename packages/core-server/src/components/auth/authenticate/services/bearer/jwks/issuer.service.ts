import { HTTP, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  AuthenticateBindingKeys,
  IJWKSIssuerOptions,
  IJWTIssueClaims,
  IJWTTokenPayload,
  inject,
  JWKSKeyDrivers,
  JWKSKeyFormats,
  TGetTokenExpiresFn,
} from '@venizia/ignis-kernel';
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
      fieldCodecs: this.options.fieldCodecs,
      cipher: this.options.cipher,
      sign: this.options.sign,
    });
  }

  protected override async initialize(): Promise<void> {
    const { keys, algorithm } = this.options;

    const raw = await this.resolveKeyContent({ keys });
    const built = await this.parseKeyMaterial({ raw, algorithm, keys });

    this.privateKey = built.priv;
    this.publicKey = built.pub;

    const publicJWK = await exportJWK(this.publicKey!);

    // Belt and braces. `assertPublicJWK` already refused a private JWK on the way IN, but this is
    // the exact object an unauthenticated `/certs` serves - the last place to notice a signing key
    // about to be published, whatever route the material took to get here.
    this.assertPublicJWK({ jwk: publicJWK });

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

  /**
   * Refuses a JWK carrying private material where a PUBLIC key is expected.
   *
   * The `pem` format cannot reach this state - `importSPKI` rejects a private PEM outright. The
   * `jwk` format can: `importJWK` imports whatever it is handed, and a private JWK marked
   * `"ext": true` yields an EXTRACTABLE key, so `exportJWK` then carries `d` straight into the
   * document `/certs` serves without authentication. Measured on jose 6.2.3: with `ext: true` the
   * round trip returns `d`; without it, export throws. So the only thing standing between a
   * mis-pasted key and a published signing key was an optional flag on attacker-irrelevant input.
   *
   * Named members, not a blanket scan: `d` covers EC/OKP and RSA's private exponent, and the CRT
   * members are the rest of an RSA private key.
   */
  protected assertPublicJWK(opts: { jwk: JWK }): void {
    const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'] as const;

    const present = PRIVATE_MEMBERS.filter(member => opts.jwk[member] !== undefined);
    if (present.length === 0) {
      return;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[JWKSIssuerTokenService] The public key material carries PRIVATE members (${present.join(', ')}) | this key would be published at the JWKS endpoint | pass the public half in keys.public`,
    });
  }

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

          this.assertPublicJWK({ jwk: parsed.pub });

          const priv = await importJWK(parsed.priv, algorithm);
          const pub = await importJWK(parsed.pub, algorithm);
          return { priv, pub };
        } catch (error) {
          this.logger
            .for(this.parseKeyMaterial.name)
            .error('Invalid JWK key material | Error: %s', error);
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

  protected override async doVerify(token: string): Promise<IJWTTokenPayload> {
    await this.ensureInitialized();
    const result = await jwtVerify<IJWTTokenPayload>(token, this.publicKey!, this.options.verify);
    return this.decryptPayload({ result });
  }

  override async getSigner(opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn: TGetTokenExpiresFn;
    claims?: IJWTIssueClaims;
  }) {
    await this.ensureInitialized();

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = await opts.getTokenExpiresFn();

    const encryptedPayload = this.encryptPayload(opts.payload);

    const signer = new SignJWT({ ...encryptedPayload })
      .setProtectedHeader({ alg: this.options.algorithm, kid: this.options.kid })
      .setIssuedAt()
      .setExpirationTime(now + expiresIn)
      .setNotBefore(now);

    return this.applySignClaims({ signer, payload: encryptedPayload, claims: opts.claims });
  }

  protected override getSigningKey(): ValueOrPromise<Uint8Array | CryptoKey> {
    if (!this.privateKey) {
      throw getError({ message: '[getSigningKey] Invalid privateKey!' });
    }

    return this.privateKey;
  }

  protected override getDefaultTokenExpiresFn(): TGetTokenExpiresFn {
    return this.options.getTokenExpiresFn;
  }

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
