import { Env } from 'hono';
import { AbstractBearerTokenService } from '../abstract.service';

/**
 * Base class for JWKS token services (Issuer + Verifier).
 *
 * Consolidates the lazy-initialization pattern with retry-on-failure semantics:
 * if `initialize()` rejects, `initPromise` is reset so the next call retries
 * instead of caching the failure permanently.
 */
export abstract class AbstractJWKSTokenService<E extends Env = Env> extends AbstractBearerTokenService<E> {
  protected initialized = false;
  protected initPromise: Promise<void> | null = null;

  protected async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.initialize().catch(error => {
        this.initPromise = null;
        throw error;
      });
    }

    await this.initPromise;
  }

  protected abstract initialize(): Promise<void>;
}
