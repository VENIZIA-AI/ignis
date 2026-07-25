import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers';
import { ErrorScopes, HTTP } from '@venizia/ignis-helpers';

/** Codes a client branches on for a failed authentication. A throw site may override `message` for detail; the code and status come from here. */
export const AuthenticationErrors = {
  HEADER_MISSING: {
    message: {
      text: 'Missing authorization header',
      code: 'core.authentication.header_missing',
    },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  SCHEME_INVALID: {
    message: {
      text: 'Unsupported authorization scheme',
      code: 'core.authentication.scheme_invalid',
    },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  HEADER_MALFORMED: {
    message: {
      text: 'Malformed authorization header',
      code: 'core.authentication.header_malformed',
    },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  TOKEN_MISSING: {
    message: { text: 'Missing request token', code: 'core.authentication.token_missing' },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  /** Covers expiry, a bad signature and a malformed token alike - the reason rides in `cause`, never in the code a client sees. */
  TOKEN_INVALID: {
    message: { text: 'Invalid or expired token', code: 'core.authentication.token_invalid' },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  TOKEN_PAYLOAD_INVALID: {
    message: {
      text: 'Invalid token payload',
      code: 'core.authentication.token_payload_invalid',
    },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  CREDENTIALS_MALFORMED: {
    message: {
      text: 'Malformed credentials',
      code: 'core.authentication.credentials_malformed',
    },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  CREDENTIALS_INVALID: {
    message: {
      text: 'Invalid username or password',
      code: 'core.authentication.credentials_invalid',
    },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  FAILED: {
    message: { text: 'Authentication failed', code: 'core.authentication.failed' },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
  USER_UNRESOLVED: {
    message: {
      text: 'Failed to identify authenticated user',
      code: 'core.authentication.user_unresolved',
    },
    statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
    category: ErrorScopes.AUTH,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. */
declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof AuthenticationErrors> {}
}
