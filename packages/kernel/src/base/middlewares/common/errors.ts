import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers/core';
import { ErrorScopes } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

/** Codes a client branches on for a request refused before any repository ran - by the middleware layer, or by a handler reading the validated body. */
export const RequestErrors = {
  BODY_MALFORMED: {
    message: { text: 'Malformed body payload', code: 'core.request.body_malformed' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  NOTHING_TO_UPDATE: {
    message: { text: 'Nothing to update', code: 'core.request.nothing_to_update' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. Augments the `/core` subpath, not the root barrel - kernel never imports the bare package, so nothing else in this program would make the root specifier resolvable for the merge. */
declare module '@venizia/ignis-helpers/core' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof RequestErrors> {}
}
