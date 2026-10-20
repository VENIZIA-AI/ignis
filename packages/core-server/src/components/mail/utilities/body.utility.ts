import { getError } from '@venizia/ignis-helpers/core';
import { MailErrors, type IMailMessage } from '../common';

/** nodemailer reads a `text`/`html` given as `{ path }` or `{ href }`, so only a string may pass; `null` counts as absent. */
export const assertMailBodyIsText = (opts: { message: IMailMessage }): void => {
  const { text, html } = opts.message;
  const isTextValid = text === undefined || text === null || typeof text === 'string';
  const isHtmlValid = html === undefined || html === null || typeof html === 'string';

  if (isTextValid && isHtmlValid) {
    return;
  }

  throw getError({
    error: MailErrors.BODY_SOURCE_REFUSED,
    message:
      'Mail body refused | text and html must be strings; pass the content itself, not a { path } or { href } for the transport to read',
  });
};
