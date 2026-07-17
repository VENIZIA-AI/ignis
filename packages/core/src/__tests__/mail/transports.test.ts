import { describe, expect, test } from 'bun:test';
import { MailErrorCodes } from '@/components/mail/common';
import {
  MailgunTransportHelper,
  NodemailerTransportHelper,
} from '@/components/mail/helpers/transporters';
import type { AnyType } from '@venizia/ignis-helpers';

/**
 * `nodemailer` and `mailgun.js` are OPTIONAL peers and are not installed here, so both helpers are
 * exercised through their client-factory seam - the same way BullMQHelper is run without Redis.
 * No SMTP socket and no Mailgun HTTP call is ever made.
 */

class FakeSmtpTransporter {
  sentMails: AnyType[] = [];
  isClosed = false;

  constructor(private behaviour: { sendError?: Error; verifyError?: Error } = {}) {}

  async sendMail(mailOptions: AnyType) {
    if (this.behaviour.sendError) {
      throw this.behaviour.sendError;
    }

    this.sentMails.push(mailOptions);
    return { messageId: 'smtp-1', response: '250 OK' };
  }

  async verify() {
    if (this.behaviour.verifyError) {
      throw this.behaviour.verifyError;
    }

    return true;
  }

  close() {
    this.isClosed = true;
  }
}

class FakeMailgunMessagesClient {
  createdMessages: Array<{ domain: string; payload: AnyType }> = [];

  constructor(private behaviour: { createError?: Error } = {}) {}

  async create(domain: string, payload: AnyType) {
    if (this.behaviour.createError) {
      throw this.behaviour.createError;
    }

    this.createdMessages.push({ domain, payload });
    return { id: 'mailgun-1', message: 'Queued' };
  }
}

// The seam is invoked from the base constructor, before subclass fields exist - the double to hand
// back is therefore parked here, in module scope, and picked up by the override.
let nextSmtpTransporter: FakeSmtpTransporter;
let nextMailgunClient: FakeMailgunMessagesClient;

class TestableNodemailerTransport extends NodemailerTransportHelper {
  protected override buildTransporter(): AnyType {
    return nextSmtpTransporter;
  }
}

class TestableMailgunTransport extends MailgunTransportHelper {
  protected override buildClient(): AnyType {
    return nextMailgunClient;
  }
}

const buildNodemailerTransport = (behaviour?: { sendError?: Error; verifyError?: Error }) => {
  nextSmtpTransporter = new FakeSmtpTransporter(behaviour ?? {});
  const helper = new TestableNodemailerTransport({ host: 'localhost', port: 1025 });

  return { helper, fakeTransporter: nextSmtpTransporter };
};

const buildMailgunTransport = (behaviour?: { createError?: Error }) => {
  nextMailgunClient = new FakeMailgunMessagesClient(behaviour ?? {});
  const helper = new TestableMailgunTransport({
    username: 'api',
    key: 'fake-key',
    domain: 'mail.test',
  });

  return { helper, fakeClient: nextMailgunClient };
};

describe('MailgunTransportHelper - configuration', () => {
  test('a missing domain fails at CONFIGURE time, not at the first send', () => {
    nextMailgunClient = new FakeMailgunMessagesClient();

    const error = (() => {
      try {
        new TestableMailgunTransport({ username: 'api', key: 'fake-key' } as AnyType);
        return undefined;
      } catch (caught) {
        return caught as AnyType;
      }
    })();

    expect(error).toBeDefined();
    expect(error.normalized.code).toBe(MailErrorCodes.INVALID_CONFIGURATION);
    expect(error.message).toContain('domain');
  });

  test('a missing credential fails at configure time', () => {
    nextMailgunClient = new FakeMailgunMessagesClient();

    const error = (() => {
      try {
        new TestableMailgunTransport({ domain: 'mail.test' } as AnyType);
        return undefined;
      } catch (caught) {
        return caught as AnyType;
      }
    })();

    expect(error).toBeDefined();
    expect(error.normalized.code).toBe(MailErrorCodes.INVALID_CONFIGURATION);
    expect(error.message).toContain('username');
    expect(error.message).toContain('key');
  });

  test('the configuration error never echoes the api key back', () => {
    nextMailgunClient = new FakeMailgunMessagesClient();

    const error = (() => {
      try {
        new TestableMailgunTransport({ username: 'api', key: 'super-secret-key' } as AnyType);
        return undefined;
      } catch (caught) {
        return caught as AnyType;
      }
    })();

    expect(JSON.stringify({ message: error.message, extra: error.extra })).not.toContain(
      'super-secret-key',
    );
  });
});

describe('MailgunTransportHelper - send', () => {
  test('maps recipients, reply-to and custom headers onto the mailgun payload', async () => {
    const { helper, fakeClient } = buildMailgunTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      replyTo: 'reply@b.com',
      headers: { 'X-Trace': 'trace-1' },
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('mailgun-1');

    const [sent] = fakeClient.createdMessages;
    expect(sent.domain).toBe('mail.test');
    expect(sent.payload.to).toEqual(['a@b.com']);
    expect(sent.payload['h:Reply-To']).toBe('reply@b.com');
    expect(sent.payload['h:X-Trace']).toBe('trace-1');
  });

  test('a provider failure is reported as a failed result, not thrown', async () => {
    const { helper } = buildMailgunTransport({ createError: new Error('Forbidden') });

    const result = await helper.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });
});

describe('NodemailerTransportHelper', () => {
  test('joins array recipients and forwards the message', async () => {
    const { helper, fakeTransporter } = buildNodemailerTransport();

    const result = await helper.send({
      to: ['a@b.com', 'c@d.com'],
      subject: 'Hi',
      html: '<p>body</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('smtp-1');
    expect(fakeTransporter.sentMails[0].to).toBe('a@b.com, c@d.com');
  });

  test('an SMTP failure is reported as a failed result, not thrown', async () => {
    const { helper } = buildNodemailerTransport({
      sendError: new Error('Invalid login: 535 5.7.8'),
    });

    const result = await helper.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid login: 535 5.7.8');
  });

  test('a failed verification resolves false instead of throwing', async () => {
    const { helper } = buildNodemailerTransport({ verifyError: new Error('ECONNREFUSED') });

    expect(await helper.verify()).toBe(false);
  });

  test('close() releases the underlying transporter', async () => {
    const { helper, fakeTransporter } = buildNodemailerTransport();

    await helper.close();
    expect(fakeTransporter.isClosed).toBe(true);
  });
});
