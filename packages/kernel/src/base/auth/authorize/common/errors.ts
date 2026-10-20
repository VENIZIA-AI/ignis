import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers/core';
import { ErrorScopes } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

/** Codes a client branches on for a refused authorization. A throw site may override `message` for detail; the code and status come from here. */
export const AuthorizationErrors = {
  UNAUTHENTICATED: {
    message: {
      text: 'Authorization requires an authenticated user',
      code: 'core.authorization.unauthenticated',
    },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  DENIED: {
    message: { text: 'Authorization denied', code: 'core.authorization.denied' },
    statusCode: HTTP.ResultCodes.RS_4.Forbidden,
    category: ErrorScopes.AUTH,
  },
  /** Distinct from {@link DENIED}: a voter refused before the enforcer ever ran. */
  DENIED_BY_VOTER: {
    message: { text: 'Authorization denied by voter', code: 'core.authorization.denied_by_voter' },
    statusCode: HTTP.ResultCodes.RS_4.Forbidden,
    category: ErrorScopes.AUTH,
  },
  /** Distinct from {@link DENIED}: no enforcer ever ran - the route declared `authorize()` but the application registered none, and `defaultDecision` did not say ALLOW. */
  ENFORCER_NOT_REGISTERED: {
    message: {
      text: 'Authorization requires an enforcer, but none is registered',
      code: 'core.authorization.enforcer_not_registered',
    },
    statusCode: HTTP.ResultCodes.RS_4.Forbidden,
    category: ErrorScopes.AUTH,
  },
  PRINCIPAL_TYPE_MISSING: {
    message: {
      text: 'user.principalType is required for enforcer-based authorization',
      code: 'core.authorization.principal_type_missing',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  CACHE_KEY_INVALID: {
    message: {
      text: 'Authorization cache key resolver returned an empty key',
      code: 'core.authorization.cache_key_invalid',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. Augments the `/core` subpath, not the root barrel - kernel never imports the bare package, so nothing else in this program would make the root specifier resolvable for the merge. */
declare module '@venizia/ignis-helpers/core' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof AuthorizationErrors> {}
}
