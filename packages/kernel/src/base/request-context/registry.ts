import { SingletonRealm } from '@/helpers/singleton-realm';
import { Execution } from '@venizia/ignis-helpers/core';
import type { Context } from 'hono';
import type { TRequestContextResolver } from './common/types';

/**
 * The seam that keeps `AsyncLocalStorage` out of the kernel and the connectors: a browser has none. The request is the
 * one of the current execution frame; a host without a runner may install a resolver, and with neither it resolves to
 * `undefined`.
 *
 * `resolve()` returning `undefined` means NO REQUEST CONTEXT. A context that exists but carries no
 * user is a different state, reported by that context's own variables - callers that collapse the
 * two lose the distinction their error handling is built on.
 */
interface IResolverSlot {
  resolver: TRequestContextResolver | undefined;
}

/** The current request context: the frame's request, else what the installed resolver answers. */
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

  /** Inside a frame the frame alone answers, so a frame with no request has none; outside every frame, the resolver. */
  static resolve(): Context | undefined {
    const frame = Execution.current();

    if (frame) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- helpers holds the request as unknown; only the server layer's request middleware puts one there, and it is a Hono context
      return frame.request as Context | undefined;
    }

    return this.slot().resolver?.();
  }
}
