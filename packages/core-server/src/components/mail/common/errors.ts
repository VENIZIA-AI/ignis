import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers/core';
import { ErrorScopes } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

/** Codes a client branches on for a mail request it can fix - a missing template, a message that is not sendable. Delivery failures are NOT here: they are 5xx and stay codeless, because a client cannot act on the remote provider being down. */
/** Codes are LITERAL strings, deliberately not `MailErrorCodes.*`: `MessageCode.build()` returns `string`, which erases the literal type `TRegisterErrors` is built on and silently kills autocomplete. The values are identical to what those constants produce - they are a public contract and must not shift. */
export const MailErrors = {
  TEMPLATE_NOT_FOUND: {
    message: { text: 'Mail template not found', code: 'core.mail.template_not_found' },
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
    category: ErrorScopes.BUSINESS,
  },
  INVALID_CONFIGURATION: {
    message: { text: 'Invalid mail configuration', code: 'core.mail.invalid_configuration' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  INVALID_RECIPIENT: {
    message: { text: 'Invalid mail recipient', code: 'core.mail.invalid_recipient' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  /** One answer for every refused source - outside the root, missing, not a file - so a caller cannot probe which files exist. */
  ATTACHMENT_PATH_REFUSED: {
    message: {
      text: 'Mail attachment path refused',
      code: 'core.mail.attachment_path_refused',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  ATTACHMENT_TOO_LARGE: {
    message: {
      text: 'Mail attachments are larger than the maximum allowed',
      code: 'core.mail.attachment_too_large',
    },
    statusCode: HTTP.ResultCodes.RS_4.ContentTooLarge,
    category: ErrorScopes.VALIDATION,
  },
  BODY_SOURCE_REFUSED: {
    message: { text: 'Mail body must be text', code: 'core.mail.body_source_refused' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. */
declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof MailErrors> {}
}
