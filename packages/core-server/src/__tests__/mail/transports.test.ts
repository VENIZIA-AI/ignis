import { describe, expect, test } from 'bun:test';
import { MailErrorCodes } from '@/components/mail/common';
import {
  AmazonSesTransporterHelper,
  MailgunTransportHelper,
  NodemailerTransportHelper,
} from '@/components/mail/helpers/transporters';
import type { AnyType } from '@venizia/ignis-helpers/common';

/** `nodemailer` and `mailgun.js` are OPTIONAL peers not installed here, so both helpers are exercised through their client-factory seam - no SMTP socket or Mailgun HTTP call is ever made. */

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

class FakeSendEmailCommand {
  constructor(public input: AnyType) {}
}

class FakeGetAccountCommand {
  constructor(public input?: AnyType) {}
}

class FakeSesClient {
  sentCommands: AnyType[] = [];
  destroyed = false;

  constructor(private behaviour: { sendError?: Error; sendingEnabled?: boolean } = {}) {}

  async send(command: AnyType) {
    if (command instanceof FakeSendEmailCommand) {
      if (this.behaviour.sendError) {
        throw this.behaviour.sendError;
      }

      this.sentCommands.push(command.input);
      return { MessageId: 'ses-1' };
    }

    if (command instanceof FakeGetAccountCommand) {
      return { SendingEnabled: this.behaviour.sendingEnabled ?? true };
    }

    throw new Error('Unknown SES command');
  }

  destroy() {
    this.destroyed = true;
  }
}

// The seam is invoked from the base constructor, before subclass fields exist, so the double to hand back is parked in module scope and picked up by the override.
let nextSmtpTransporter: FakeSmtpTransporter;
let nextMailgunClient: FakeMailgunMessagesClient;
let nextSesClient: FakeSesClient;

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

class TestableAmazonSesTransport extends AmazonSesTransporterHelper {
  protected override buildClient(): AnyType {
    return {
      client: nextSesClient,
      SendEmailCommand: FakeSendEmailCommand,
      GetAccountCommand: FakeGetAccountCommand,
    };
  }
}

const buildNodemailerTransport = (behaviour?: { sendError?: Error; verifyError?: Error }) => {
  nextSmtpTransporter = new FakeSmtpTransporter(behaviour ?? {});
  const helper = new TestableNodemailerTransport({ config: { host: 'localhost', port: 1025 } });

  return { helper, fakeTransporter: nextSmtpTransporter };
};

const buildMailgunTransport = (behaviour?: { createError?: Error }) => {
  nextMailgunClient = new FakeMailgunMessagesClient(behaviour ?? {});
  const helper = new TestableMailgunTransport({
    config: { username: 'api', key: 'fake-key', domain: 'mail.test' },
  });

  return { helper, fakeClient: nextMailgunClient };
};

const buildSesTransport = (behaviour?: { sendError?: Error; sendingEnabled?: boolean }) => {
  nextSesClient = new FakeSesClient(behaviour ?? {});
  const helper = new TestableAmazonSesTransport({ config: { region: 'us-east-1' } });

  return { helper, fakeClient: nextSesClient };
};

describe('MailgunTransportHelper - configuration', () => {
  test('a missing domain fails at CONFIGURE time, not at the first send', () => {
    nextMailgunClient = new FakeMailgunMessagesClient();

    const error = (() => {
      try {
        new TestableMailgunTransport({ config: { username: 'api', key: 'fake-key' } as AnyType });
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
        new TestableMailgunTransport({ config: { domain: 'mail.test' } as AnyType });
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
        new TestableMailgunTransport({
          config: { username: 'api', key: 'super-secret-key' } as AnyType,
        });
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

describe('AmazonSesTransporterHelper - configuration', () => {
  test('a missing region fails at CONFIGURE time, not at the first send', () => {
    nextSesClient = new FakeSesClient();

    const error = (() => {
      try {
        new TestableAmazonSesTransport({ config: {} as AnyType });
        return undefined;
      } catch (caught) {
        return caught as AnyType;
      }
    })();

    expect(error).toBeDefined();
    expect(error.normalized.code).toBe(MailErrorCodes.INVALID_CONFIGURATION);
    expect(error.message).toContain('region');
  });

  test('the configuration error never echoes credentials back', () => {
    nextSesClient = new FakeSesClient();

    const error = (() => {
      try {
        new TestableAmazonSesTransport({
          config: {
            credentials: { accessKeyId: 'AKIA', secretAccessKey: 'super-secret' },
          } as AnyType,
        });
        return undefined;
      } catch (caught) {
        return caught as AnyType;
      }
    })();

    expect(JSON.stringify({ message: error.message, extra: error.extra })).not.toContain(
      'super-secret',
    );
  });
});

describe('AmazonSesTransporterHelper - send', () => {
  test('maps recipients and reply-to onto the SendEmailCommand, using a real raw MIME body', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      from: 'sender@example.com',
      to: ['a@b.com', 'c@d.com'],
      cc: 'cc@b.com',
      subject: 'Hi',
      text: 'body',
      replyTo: 'reply@b.com',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('ses-1');

    const [sent] = fakeClient.sentCommands;
    expect(sent.FromEmailAddress).toBe('sender@example.com');
    expect(sent.Destination.ToAddresses).toEqual(['a@b.com', 'c@d.com']);
    expect(sent.Destination.CcAddresses).toEqual(['cc@b.com']);
    expect(sent.ReplyToAddresses).toEqual(['reply@b.com']);

    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    expect(raw).toContain('From: sender@example.com');
    expect(raw).toContain('To: a@b.com, c@d.com');
    expect(raw).toContain('Cc: cc@b.com');
    expect(raw).toContain('Subject: Hi');
    expect(raw).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(raw).toContain(Buffer.from('body', 'utf-8').toString('base64'));
  });

  test('embeds an attachment as a base64-encoded MIME part, with no nodemailer peer installed', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      attachments: [{ filename: 'hello.txt', content: 'Hello World!', contentType: 'text/plain' }],
    });

    expect(result.success).toBe(true);

    const [sent] = fakeClient.sentCommands;
    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    expect(raw).toContain('Content-Type: multipart/mixed');
    expect(raw).toContain('Content-Disposition: attachment; filename="hello.txt"');
    expect(raw).toContain(Buffer.from('Hello World!', 'utf-8').toString('base64'));
  });

  test('a provider failure is reported as a failed result, not thrown', async () => {
    const { helper } = buildSesTransport({ sendError: new Error('MessageRejected') });

    const result = await helper.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('MessageRejected');
  });
});

describe('AmazonSesTransporterHelper - header injection defense', () => {
  test('a CRLF smuggled into replyTo is rejected, not sent', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      replyTo: 'visitor@example.com\r\nBcc: attacker@evil.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('replyTo');
    expect(fakeClient.sentCommands).toHaveLength(0);
  });

  test('a CRLF smuggled into an all-ASCII subject is rejected even though it skips RFC 2047 encoding', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi\r\nBcc: attacker@evil.com',
      text: 'body',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('subject');
    expect(fakeClient.sentCommands).toHaveLength(0);
  });

  test('a CRLF smuggled into a custom header value is rejected', async () => {
    const { helper } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      headers: { 'X-Trace': 'trace-1\r\nBcc: attacker@evil.com' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('headers.X-Trace');
  });

  test('a CRLF smuggled into an attachment filename is rejected', async () => {
    const { helper } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      attachments: [
        {
          filename: 'hello.txt\r\nBcc: attacker@evil.com',
          content: 'data',
          contentType: 'text/plain',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('attachment.filename');
  });

  test('a legitimate reply-to address with no control characters still sends', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      replyTo: 'visitor@example.com',
    });

    expect(result.success).toBe(true);
    expect(fakeClient.sentCommands).toHaveLength(1);
  });
});

describe('AmazonSesTransporterHelper - verify and close', () => {
  test('an enabled sending account verifies true', async () => {
    const { helper } = buildSesTransport({ sendingEnabled: true });

    expect(await helper.verify()).toBe(true);
  });

  test('a disabled sending account verifies false', async () => {
    const { helper } = buildSesTransport({ sendingEnabled: false });

    expect(await helper.verify()).toBe(false);
  });

  test('a failed verification resolves false instead of throwing', async () => {
    const { helper, fakeClient } = buildSesTransport();
    fakeClient.send = async () => {
      throw new Error('AccessDenied');
    };

    expect(await helper.verify()).toBe(false);
  });

  test('close() releases the underlying client', async () => {
    const { helper, fakeClient } = buildSesTransport();

    await helper.close();
    expect(fakeClient.destroyed).toBe(true);
  });
});

// These build the REAL helpers, not the Testable subclasses: neither peer is installed here, so
// reaching the ModuleUtility fallback would throw. Getting a transport back IS the proof that the
// handed-over module was used - the same path a compiled binary takes.
describe('Transports - module handed over through the options', () => {
  test('nodemailer: the given module builds the transporter, no filesystem lookup', () => {
    const fakeTransporter = new FakeSmtpTransporter();
    const calls: AnyType[] = [];

    const helper = new NodemailerTransportHelper({
      config: { host: 'localhost', port: 1025 },
      module: {
        createTransport: (config: AnyType) => {
          calls.push(config);
          return fakeTransporter;
        },
      },
    });

    expect(calls).toEqual([{ host: 'localhost', port: 1025 }]);
    expect(helper).toBeInstanceOf(NodemailerTransportHelper);
  });

  test('mailgun: the given module builds the client, no filesystem lookup', async () => {
    const fakeClient = new FakeMailgunMessagesClient();

    const helper = new MailgunTransportHelper({
      config: { username: 'api', key: 'fake-key', domain: 'mail.test' },
      module: class {
        client() {
          return { messages: fakeClient };
        }
      } as AnyType,
    });

    const result = await helper.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });
    expect(result.success).toBe(true);
  });

  test('without a module, the missing peer still throws the install hint', () => {
    const error = (() => {
      try {
        new NodemailerTransportHelper({ config: { host: 'localhost', port: 1025 } });
        return undefined;
      } catch (caught) {
        return caught as AnyType;
      }
    })();

    expect(error).toBeDefined();
    expect(error.message).toContain("Please install 'nodemailer'");
  });

  test('ses: the given module builds the client and command constructors, no filesystem lookup', async () => {
    const fakeClient = new FakeSesClient();
    const calls: AnyType[] = [];

    const helper = new AmazonSesTransporterHelper({
      config: { region: 'us-east-1' },
      module: {
        SESv2Client: class {
          constructor(config: AnyType) {
            calls.push(config);
          }
          send = fakeClient.send.bind(fakeClient);
        } as AnyType,
        SendEmailCommand: FakeSendEmailCommand as AnyType,
        GetAccountCommand: FakeGetAccountCommand as AnyType,
      },
    });

    expect(calls).toEqual([{ region: 'us-east-1', credentials: undefined, endpoint: undefined }]);

    const result = await helper.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });
    expect(result.success).toBe(true);
  });

  test('without a module, the missing SES peer still throws the install hint', () => {
    const error = (() => {
      try {
        new AmazonSesTransporterHelper({ config: { region: 'us-east-1' } });
        return undefined;
      } catch (caught) {
        return caught as AnyType;
      }
    })();

    expect(error).toBeDefined();
    expect(error.message).toContain("Please install '@aws-sdk/client-sesv2'");
  });
});
