import { describe, expect, test } from 'bun:test';
import { MailErrorCodes, MailErrors } from '@/components/mail/common';

describe('MailErrors', () => {
  test('a catalog code is a literal type, so a consumer gets autocomplete on it', () => {
    const code: 'core.mail.template_not_found' = MailErrors.TEMPLATE_NOT_FOUND.message.code;

    // @ts-expect-error the literal is not any other string
    const other: 'core.mail.invalid_recipient' = MailErrors.TEMPLATE_NOT_FOUND.message.code;

    expect([code, other]).toHaveLength(2);
  });

  test('the server-side codes live in MailErrorCodes only, and no code has two homes', () => {
    const catalog = Object.values(MailErrors).map((definition) => definition.message.code);
    const serverSide = [
      MailErrorCodes.SEND_FAILED,
      MailErrorCodes.BATCH_SEND_FAILED,
      MailErrorCodes.VERIFICATION_FAILED,
    ];

    expect(serverSide).toEqual([
      'core.mail.send_failed',
      'core.mail.batch_send_failed',
      'core.mail.verification_failed',
    ]);

    for (const code of serverSide) {
      expect(catalog).not.toContain(code);
    }
  });
});
