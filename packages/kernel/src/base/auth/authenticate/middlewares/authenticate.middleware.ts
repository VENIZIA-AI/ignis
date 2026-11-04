import type { Env } from 'hono';
import type { TAuthMode } from '../common';
import { AuthenticationProvider } from '../providers';

const authenticationProvider = new AuthenticationProvider<Env>();
const authenticateFn = authenticationProvider.value();

/** Route middleware factory: `authenticate({ strategies, mode })` authenticates a request with the named strategies, `mode` defaulting to `any`. */
export const authenticate = (opts: { strategies: string[]; mode?: TAuthMode }) => {
  return authenticateFn(opts);
};
