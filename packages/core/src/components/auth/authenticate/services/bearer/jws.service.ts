import { inject } from '@/base/metadata/injectors';
import { getError, HTTP, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import {
  AuthenticateBindingKeys,
  IJWSTokenServiceOptions,
  IJWTTokenPayload,
  TGetTokenExpiresFn,
} from '../../common';
import { AbstractBearerTokenService } from './abstract.service';

/**
 * Symmetric JWT (JWS) token service with AES-encrypted payloads.
 *
 * Uses HS256 signing (shared `jwtSecret`) and encrypts all custom claim keys and values
 * with AES (`applicationSecret`). Standard JWT fields (iss, sub, aud, jti, nbf, exp, iat)
 * are preserved in plaintext.
 *
 * Since symmetric JWT means every service holding the secret can both sign and verify,
 * payload encryption prevents token inspection by intermediaries or client-side code.
 *
 * The `roles` claim receives special serialization: each role is encoded as
 * `"id|identifier|priority"` before encryption, and reconstructed on decryption.
 *
 * @example
 * ```typescript
 * // Register via AuthenticateComponent (recommended)
 * this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
 *   standard: JOSEStandards.JWS,
 *   options: {
 *     jwtSecret: env.get('JWT_SECRET'),
 *     applicationSecret: env.get('APP_SECRET'),
 *     getTokenExpiresFn: () => 86_400, // 24h
 *   },
 * });
 *
 * // Generate a token
 * const token = await jwsTokenService.generate({
 *   payload: { userId: 'u1', roles: [{ id: '1', identifier: 'admin', priority: 100 }] },
 * });
 *
 * // Verify and decrypt
 * const user = await jwsTokenService.verify({ type: 'Bearer', token });
 * ```
 */
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

    this.configurePayloadEncryption({ aesAlgorithm, applicationSecret });
    this.jwtSecret = new TextEncoder().encode(this.options.jwtSecret);
  }

  // --------------------------------------------------------------------------------------
  protected override async doVerify(token: string): Promise<IJWTTokenPayload> {
    const decodedToken = await jwtVerify<IJWTTokenPayload>(token, this.jwtSecret, {});
    return this.decryptPayload({ result: decodedToken });
  }

  // --------------------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------------------
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
