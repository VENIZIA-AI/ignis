import type { TContext } from './common/types';
import type { Env } from 'hono';

/** Casts of the Hono context that the types cannot prove. */
export class ContextUtility {
  /** Casts middleware context to TContext (safe -- structurally identical to Context). */
  static asTypedContext<E extends Env>(opts: { context: unknown }): TContext<E, string> {
    return opts.context as TContext<E, string>;
  }
}

/** @deprecated Use ContextUtility.asTypedContext({ context }). Removed in 0.5. */
export const asTypedContext = <E extends Env>(context: unknown): TContext<E, string> => {
  return ContextUtility.asTypedContext<E>({ context });
};
