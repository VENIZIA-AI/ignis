import { getError } from '@venizia/ignis-helpers/core';
import { MailErrors, type IMailMessage } from '../common';

/** Printable ASCII without the colon: what RFC 5322 allows in a header field name. */
const HEADER_NAME_PATTERN = /^[\x21-\x39\x3b-\x7e]+$/;

/** A value spliced into a header line cannot hold a line break or NUL: it would break out of its line and forge headers or smuggle body content. */
const HEADER_VALUE_FORBIDDEN = /[\r\n\0]/;

/** The one place a message is checked for header injection, before any transport sees it. A transport called directly skips it. */
export class MailHeaderUtility {
  /** `value` is `unknown`: the message types end in `[key: string]: any`, so nothing stops a controller forwarding a request body from putting an array where a string is declared. */
  static assertValue(opts: { field: string; value: unknown }): void {
    const { field, value } = opts;

    if (typeof value === 'string' && !HEADER_VALUE_FORBIDDEN.test(value)) {
      return;
    }

    throw getError({
      error: MailErrors.INVALID_HEADER,
      message: `Invalid mail header | ${field} must be a string without line breaks or control characters`,
    });
  }

  /** Every address field, the subject and the custom headers, names included. */
  static assert(opts: { message: IMailMessage }): void {
    const { from, to, cc, bcc, replyTo, subject, headers } = opts.message;
    const addresses = { from, to, cc, bcc, replyTo };

    for (const [field, value] of Object.entries(addresses)) {
      if (value === undefined || value === null) {
        continue;
      }

      for (const item of Array.isArray(value) ? value : [value]) {
        MailHeaderUtility.assertValue({ field, value: item });
      }
    }

    MailHeaderUtility.assertValue({ field: 'subject', value: subject });

    for (const [name, value] of Object.entries(headers ?? {})) {
      if (!HEADER_NAME_PATTERN.test(name)) {
        throw getError({
          error: MailErrors.INVALID_HEADER,
          message: 'Invalid mail header | a header name must be printable ASCII without a colon',
        });
      }

      MailHeaderUtility.assertValue({ field: `headers.${name}`, value });
    }
  }
}
