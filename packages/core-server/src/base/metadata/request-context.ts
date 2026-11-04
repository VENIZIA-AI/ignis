import { tryGetContext } from 'hono/context-storage';
import type { Env } from 'hono/types';

/** Returns the Hono context of the request being handled, or `undefined` outside a request (uses `tryGetContext`, so it never throws). */
export const useRequestContext = <AppEnv extends Env = Env>() => {
  return tryGetContext<AppEnv>();
};
