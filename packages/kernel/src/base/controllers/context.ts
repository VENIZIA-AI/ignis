import type { TContext } from '@/base/controllers/common/types';
import type { Env } from 'hono';

/** Casts middleware context to TContext (safe -- structurally identical to Context). */
export const asTypedContext = <E extends Env>(context: unknown): TContext<E, string> => {
  return context as TContext<E, string>;
};
