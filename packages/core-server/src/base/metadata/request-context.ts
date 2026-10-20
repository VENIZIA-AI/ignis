import { tryGetContext } from 'hono/context-storage';
import type { Env } from 'hono/types';

export const useRequestContext = <AppEnv extends Env = Env>() => {
  return tryGetContext<AppEnv>();
};
