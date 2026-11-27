import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { MailErrors, MailProviders } from '@/components/mail/common';
import { MailTransportProvider } from '@/components/mail/providers/mail-transporter.provider';
import { Container } from '@/helpers';

describe('a custom mail transport with a bad config', () => {
  for (const [name, config] of [
    ['null', null],
    ['a string', 'smtp'],
    ['an object with no method', {}],
  ] as const) {
    test(`${name} is refused as an invalid configuration, naming both methods`, () => {
      const create = new MailTransportProvider().value(new Container());
      let caught: unknown;

      try {
        // Applied by reflection: the options under test are ones the type refuses.
        Reflect.apply(create, undefined, [{ provider: MailProviders.CUSTOM, config }]);
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
