import type { TContext } from '@/base/controllers/common/types';
import type { Env } from 'hono';
import type { IAuthUser } from './strategy';

export type TBasicTokenServiceOptions<E extends Env = Env> = {
  /** Callback to verify basic auth credentials. Returns IAuthUser if valid, null otherwise. */
  verifyCredentials: (opts: {
    credentials: { username: string; password: string };
    context: TContext<E, string>;
  }) => Promise<IAuthUser | null>;
};
