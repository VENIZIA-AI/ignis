import type { TContext } from './common/types';
import type { Env } from 'hono';

/** Casts of the Hono context that the types cannot prove. */
export class ContextUtility {
  /** Casts middleware context to TContext (safe -- structurally identical to Context). */
  static asTypedContext<E extends Env>(opts: { context: unknown }): TContext<E, string> {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the one bridge from a context typed elsewhere to `TContext`, which has the same members
    return opts.context as TContext<E, string>;
  }
}
