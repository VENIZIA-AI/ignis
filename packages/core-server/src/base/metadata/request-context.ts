import { RequestContextRegistry } from '@venizia/ignis-kernel';
import type { Context } from 'hono';
import type { Env } from 'hono/types';

/** The Hono context of the request of the current execution frame, or `undefined` when the frame has none. It never throws. */
export const useRequestContext = <AppEnv extends Env = Env>() => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the caller names the variables its application puts on the context; no type reaches the frame
  return RequestContextRegistry.resolve() as Context<AppEnv> | undefined;
};
