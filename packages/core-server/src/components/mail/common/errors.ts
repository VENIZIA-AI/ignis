import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers/core';
import { ErrorScopes } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { MailErrorCodes } from './constants';

/** Codes a client branches on for a mail request it can fix - a missing template, a message that is not sendable. Delivery failures are NOT here: they are 5xx and stay codeless, because a client cannot act on the remote provider being down. */
/** The code strings live once, in `MailErrorCodes`; each entry here names its status and category. */
export const MailErrors = {
  TEMPLATE_NOT_FOUND: {
    message: { text: 'Mail template not found', code: MailErrorCodes.TEMPLATE_NOT_FOUND },
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
    category: ErrorScopes.BUSINESS,
  },
  INVALID_CONFIGURATION: {
    message: { text: 'Invalid mail configuration', code: MailErrorCodes.INVALID_CONFIGURATION },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  INVALID_RECIPIENT: {
    message: { text: 'Invalid mail recipient', code: MailErrorCodes.INVALID_RECIPIENT },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  /** One answer for every refused source - outside the root, missing, not a file - so a caller cannot probe which files exist. */
  ATTACHMENT_PATH_REFUSED: {
    message: {
      text: 'Mail attachment path refused',
      code: MailErrorCodes.ATTACHMENT_PATH_REFUSED,
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  ATTACHMENT_TOO_LARGE: {
    message: {
      text: 'Mail attachments are larger than the maximum allowed',
      code: MailErrorCodes.ATTACHMENT_TOO_LARGE,
    },
    statusCode: HTTP.ResultCodes.RS_4.ContentTooLarge,
    category: ErrorScopes.VALIDATION,
  },
  /** An address, the subject or a header holds a line break or another control character, or a header name is not printable ASCII: it would break out of its header line. */
  INVALID_HEADER: {
    message: { text: 'Invalid mail header', code: MailErrorCodes.INVALID_HEADER },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  BODY_SOURCE_REFUSED: {
    message: { text: 'Mail body must be text', code: MailErrorCodes.BODY_SOURCE_REFUSED },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. */
declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof MailErrors> {}
}
