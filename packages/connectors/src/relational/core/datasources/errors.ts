import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers/core';
import { ErrorScopes } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

/**
 * Codes a caller branches on when a transaction did not end the way it asked. A 500, not a 409: the client sent nothing it can
 * correct, the cause is a statement the application let fail and went on past, and a 4xx would hide that server bug.
 */
export const TransactionErrors = {
  /** `COMMIT` was answered with `ROLLBACK`: an earlier statement failed, so the server aborted the transaction and kept none of its writes. */
  COMMIT_ROLLED_BACK: {
    message: {
      text: 'The transaction was rolled back and nothing was saved',
      code: 'core.database.commit_rolled_back',
    },
    statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
    category: ErrorScopes.SYSTEM,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. */
import type {} from '@venizia/ignis-helpers';

declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof TransactionErrors> {}
}
