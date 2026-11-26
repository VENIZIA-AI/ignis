import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { MailErrors, MailProviders, type TMailOptions } from '@/components/mail/common';
import { MailTransportProvider } from '@/components/mail/providers/mail-transporter.provider';

describe('a custom mail transport with a bad config', () => {
  for (const [name, config] of [
    ['null', null],
    ['a string', 'smtp'],
    ['an object with no method', {}],
  ] as const) {
    test(`${name} is refused as an invalid configuration, naming both methods`, () => {
      const provider = new MailTransportProvider();
      const create = provider.value({} as never);
      let caught: unknown;

      try {
        create({ provider: MailProviders.CUSTOM, config } as unknown as TMailOptions);
      } catch (error) {
        caught = error;
      }

      expect(isApplicationError(caught) && caught.normalized.code).toBe(
        MailErrors.INVALID_CONFIGURATION.message.code,
      );
      expect(String(caught)).toContain('send, verify');
    });
  }
});
