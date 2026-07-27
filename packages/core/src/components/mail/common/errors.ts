import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers';
import { ErrorScopes, HTTP } from '@venizia/ignis-helpers';

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
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. */
declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof MailErrors> {}
}
