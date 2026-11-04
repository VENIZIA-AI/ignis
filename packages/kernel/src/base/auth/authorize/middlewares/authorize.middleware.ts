import type { IAuthorizationSpec } from '../common';
import { AuthorizationProvider } from '../providers';

const authorizationProvider = new AuthorizationProvider();
const authorizeFn = authorizationProvider.value();

/** Builds the authorization middleware for a route from an `IAuthorizationSpec`; `enforcerName` selects a registered enforcer, else the default one is used. */
export const authorize = (opts: { spec: IAuthorizationSpec; enforcerName?: string }) => {
  return authorizeFn(opts);
};
