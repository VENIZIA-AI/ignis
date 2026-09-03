import type { IAuthorizationSpec } from '../common';
import { AuthorizationProvider } from '../providers';

const authorizationProvider = new AuthorizationProvider();
const authorizeFn = authorizationProvider.value();

export const authorize = (opts: { spec: IAuthorizationSpec; enforcerName?: string }) => {
  return authorizeFn(opts);
};
