import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers/core';
import { ErrorScopes } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

/** Codes a client branches on for a repository-level failure that is the caller's fault, not the server's. */
export const RepositoryErrors = {
  ENTITY_NOT_FOUND: {
    message: { text: 'Entity not found', code: 'core.repository.entity_not_found' },
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
    category: ErrorScopes.BUSINESS,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. Augments the `/core` subpath, not the root barrel - kernel never imports the bare package, so nothing else in this program would make the root specifier resolvable for the merge. */
declare module '@venizia/ignis-helpers/core' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof RepositoryErrors> {}
}
