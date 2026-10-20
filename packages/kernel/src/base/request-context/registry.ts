import { SingletonRealm } from '@/helpers/singleton-realm';
import type { Context } from 'hono';
import type { TRequestContextResolver } from './common/types';

/**
 * The seam that keeps `hono/context-storage` out of the kernel and the connectors: that module runs
 * `new AsyncLocalStorage()` in its own body, so importing it is a `TypeError` at load in a browser -
 * not a lazy failure at first use. The server layer installs a resolver over it; a host that
 * installs none resolves to `undefined`.
 *
 * `resolve()` returning `undefined` means NO REQUEST CONTEXT. A context that exists but carries no
 * user is a different state, reported by that context's own variables - callers that collapse the
 * two lose the distinction their error handling is built on.
 */
interface IResolverSlot {
  resolver: TRequestContextResolver | undefined;
}

export class RequestContextRegistry {
  static readonly SINGLETON_REAL_KEY = 'request-context-resolver';

  /** Realm-anchored, so a second copy of this package installs the resolver the first copy reads. */
  private static slot(): IResolverSlot {
    return SingletonRealm.resolve({
      key: RequestContextRegistry.SINGLETON_REAL_KEY,
      create: (): IResolverSlot => ({ resolver: undefined }),
    });
  }

  static setResolver(opts: { resolver: TRequestContextResolver }): void {
    this.slot().resolver = opts.resolver;
  }

  static clearResolver(): void {
    this.slot().resolver = undefined;
  }

  static resolve(): Context | undefined {
    return this.slot().resolver?.();
  }
}
