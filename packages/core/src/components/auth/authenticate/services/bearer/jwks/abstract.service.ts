import type { Env } from 'hono';
import { AbstractBearerTokenService } from '../abstract.service';

/** Base for JWKS token services (Issuer + Verifier): lazy init where a rejected `initialize()` resets `initPromise`, so the next call retries instead of caching the failure. */
export abstract class AbstractJWKSTokenService<
  E extends Env = Env,
> extends AbstractBearerTokenService<E> {
  protected initialized = false;
  protected initPromise: Promise<void> | null = null;

  protected async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initPromise ??= this.initialize().catch(error => {
      this.initPromise = null;
      throw error;
    });

    await this.initPromise;
  }

  protected abstract initialize(): Promise<void>;
}
