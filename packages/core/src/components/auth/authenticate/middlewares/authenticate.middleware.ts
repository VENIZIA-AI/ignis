import { TAuthMode } from '../common';
import { AuthenticationProvider } from '../providers';

// --------------------------------------------------------------------------------------------------------
// Convenience function — singleton provider instance
// --------------------------------------------------------------------------------------------------------

const authenticationProvider = new AuthenticationProvider();
const authenticateFn = authenticationProvider.value();

export const authenticate = (opts: { strategies: string[]; mode?: TAuthMode }) => {
  return authenticateFn(opts);
};
