import { inject } from '@/base/metadata';
import { AuthenticateBindingKeys, BaseService, ServiceAssertion } from '@venizia/ignis-kernel';
import type { IServiceAuthOptions } from '@venizia/ignis-kernel';
import { getError, RequestIdGenerator } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { exportJWK, importPKCS8, importSPKI, SignJWT } from 'jose';
import type { CryptoKey, JWK } from 'jose';
import { readFile } from 'node:fs/promises';
import { JWKSKeyDrivers, JWKSKeyFormats } from '@venizia/ignis-kernel';

/**
 * Mints the outgoing assertion, and publishes the public half for callees to verify against.
 *
 * Only a service that CALLS OUT needs this. `isEnabled()` is false when the application configured
 * no keys, and the component then mounts no certs route.
 */
export class ServiceAssertionSignerService extends BaseService {
  private readonly requestIdGenerator = new RequestIdGenerator({
    scope: ServiceAssertionSignerService.name,
  });

  private privateKey?: CryptoKey;
  private jwks?: { keys: JWK[] };

  constructor(
    @inject({ key: AuthenticateBindingKeys.SERVICE_OPTIONS })
    private readonly options: IServiceAuthOptions,
  ) {
    super({ scope: ServiceAssertionSignerService.name });
  }

  isEnabled(): boolean {
    return Boolean(this.options.keys);
  }

  /** `<name>_<rest path without its slash>`, so a rotated mount changes the kid rather than colliding. */
  getKeyId(): string {
    const restPath = this.options.rest?.path ?? ServiceAssertion.DEFAULT_REST_PATH;
    return this.options.keys?.kid ?? `${this.options.name}_${restPath.replace(/^\//, '')}`;
  }

  /**
   * One assertion, bound to this exact call.
   *
   * `path` must be the percent-ENCODED pathname - `new URL(target).pathname`. The verifier compares
   * against the same shape, and a decoded path here would fail every route carrying a space or a
   * non-ASCII slug.
   */
  async sign(opts: { method: string; path: string; audience: string }): Promise<string> {
    const { method, path, audience } = opts;

    this.assertEnabled();

    const now = Math.floor(Date.now() / 1000);
    const lifetime =
      this.options.signLifetimeSeconds ?? ServiceAssertion.DEFAULT_SIGN_LIFETIME_SECONDS;

    return new SignJWT({ htm: method.toUpperCase(), htu: path })
      .setProtectedHeader({
        alg: ServiceAssertion.ALGORITHM,
        kid: this.getKeyId(),
        typ: ServiceAssertion.TYP,
      })
      .setIssuer(this.options.name)
      .setSubject(this.options.name)
      .setAudience(audience)
      .setJti(this.requestIdGenerator.nextId())
      .setIssuedAt(now)
      .setExpirationTime(now + lifetime)
      .sign(await this.resolvePrivateKey());
  }

  /**
   * The document `/svc-certs` serves, built from the PUBLIC key only.
   *
   * `importSPKI` refuses a private PEM outright, which is what makes the private half unreachable
   * from here by construction rather than by care. The JWK format is deliberately NOT accepted for
   * this path: `importJWK` imports whatever it is handed, and a private JWK marked `"ext": true`
   * round-trips its `d` straight into this document. See `JWKSIssuerTokenService.assertPublicJWK`.
   */
  async getPublicJWKS(): Promise<{ keys: JWK[] }> {
    if (this.jwks) {
      return this.jwks;
    }

    this.assertEnabled();

    const raw = await this.readKey({ source: this.options.keys!.public });
    const publicKey = await importSPKI(raw, ServiceAssertion.ALGORITHM);
    const jwk = await exportJWK(publicKey);

    if (jwk.d !== undefined) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${ServiceAssertionSignerService.name}] The public key material carries a private exponent | this key would be published at the certs endpoint`,
      });
    }

    this.jwks = {
      keys: [{ ...jwk, kid: this.getKeyId(), alg: ServiceAssertion.ALGORITHM, use: 'sig' }],
    };

    return this.jwks;
  }

  private async resolvePrivateKey(): Promise<CryptoKey> {
    if (this.privateKey) {
      return this.privateKey;
    }

    const raw = await this.readKey({ source: this.options.keys!.private });
    this.privateKey = await importPKCS8(raw, ServiceAssertion.ALGORITHM);
    return this.privateKey;
  }

  private async readKey(opts: { source: string }): Promise<string> {
    const { format, driver } = this.options.keys!;

    if (format !== JWKSKeyFormats.PEM) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${ServiceAssertionSignerService.name}] Only the '${JWKSKeyFormats.PEM}' key format is supported | got: ${format}`,
      });
    }

    if (driver === JWKSKeyDrivers.FILE) {
      return readFile(opts.source, 'utf-8');
    }

    return opts.source;
  }

  private assertEnabled(): void {
    if (this.options.keys) {
      return;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[${ServiceAssertionSignerService.name}] This service has no signing keys | it can verify assertions but not mint them`,
    });
  }
}
