import { describe, expect, test } from 'bun:test';
import { MailTypeUtility } from '@/components/mail/utilities';
import type { IMailTransport, TMailOptions } from '@/components/mail/common';

describe('MailTypeUtility', () => {
  describe('isTransport', () => {
    const send = async () => ({ messageId: 'id' });
    const verify = async () => true;

    test('accepts send and verify, with close absent', () => {
      expect(MailTypeUtility.isTransport({ send, verify })).toBe(true);
    });

    test('accepts a close function', () => {
      expect(MailTypeUtility.isTransport({ send, verify, close: () => {} })).toBe(true);
    });

    test('refuses a close that is not a function', () => {
      expect(MailTypeUtility.isTransport({ send, verify, close: 'nope' })).toBe(false);
    });

    test('refuses a missing send or verify', () => {
      expect(MailTypeUtility.isTransport({ verify })).toBe(false);
      expect(MailTypeUtility.isTransport({ send })).toBe(false);
      expect(MailTypeUtility.isTransport({ send: 'x', verify })).toBe(false);
    });

    test('refuses a value that is not an object', () => {
      expect(MailTypeUtility.isTransport(null)).toBe(false);
      expect(MailTypeUtility.isTransport(undefined)).toBe(false);
      expect(MailTypeUtility.isTransport('transport')).toBe(false);
      expect(MailTypeUtility.isTransport(0)).toBe(false);
    });

    test('narrows the argument to IMailTransport', () => {
      const candidate: unknown = { send, verify };

      if (!MailTypeUtility.isTransport(candidate)) {
        throw new Error('expected a transport');
      }

      const transport: IMailTransport = candidate;
      expect(typeof transport.send).toBe('function');
    });
  });

  describe('isValidOptions', () => {
    test('accepts a string provider with a truthy config', () => {
      expect(MailTypeUtility.isValidOptions({ provider: 'custom', config: {} })).toBe(true);
    });

    test('refuses a provider that is not a string', () => {
      expect(MailTypeUtility.isValidOptions({ provider: 1, config: {} })).toBe(false);
      expect(MailTypeUtility.isValidOptions({ config: {} })).toBe(false);
    });

    test('refuses a missing or falsy config', () => {
      expect(MailTypeUtility.isValidOptions({ provider: 'custom' })).toBe(false);
      expect(MailTypeUtility.isValidOptions({ provider: 'custom', config: null })).toBe(false);
    });

    test('refuses a value that is not an object', () => {
      expect(MailTypeUtility.isValidOptions(null)).toBe(false);
      expect(MailTypeUtility.isValidOptions('options')).toBe(false);
    });

    test('narrows the argument to TMailOptions', () => {
      const candidate: unknown = { provider: 'custom', config: { send: 1 } };

      if (!MailTypeUtility.isValidOptions(candidate)) {
        throw new Error('expected valid options');
      }

      const options: TMailOptions = candidate;
      expect(options.provider).toBe('custom');
    });
  });
});
