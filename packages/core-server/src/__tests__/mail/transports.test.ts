import { describe, expect, test } from 'bun:test';
import { MailErrorCodes } from '@/components/mail/common';
import {
  AmazonSesTransportHelper,
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

class TestableAmazonSesTransport extends AmazonSesTransportHelper {
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

describe('AmazonSesTransportHelper - configuration', () => {
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

describe('AmazonSesTransportHelper - send', () => {
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
    // Reply-To has exactly one source of truth: the raw MIME header. Setting
    // `ReplyToAddresses` on the SDK command too would send the same address through two
    // channels SES treats independently.
    expect(sent.ReplyToAddresses).toBeUndefined();

    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    expect(raw).toContain('From: sender@example.com');
    expect(raw).toContain('To: a@b.com, c@d.com');
    expect(raw).toContain('Cc: cc@b.com');
    expect(raw.match(/Reply-To: reply@b\.com/g)).toHaveLength(1);
    expect(raw).toContain('Subject: Hi');
    expect(raw).toMatch(/\r\nDate: \w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT\r\n/);
    expect(raw).toMatch(/\r\nMessage-ID: <[0-9a-f]{32}@example\.com>\r\n/);
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

  test('a comma-separated `to` string becomes multiple SES recipients, not one malformed address', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com, b@b.com',
      subject: 'Hi',
      text: 'body',
    });

    expect(result.success).toBe(true);
    const [sent] = fakeClient.sentCommands;
    expect(sent.Destination.ToAddresses).toEqual(['a@b.com', 'b@b.com']);
  });

  test('a non-ASCII display name is RFC 2047 encoded, the address itself stays ASCII', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      from: '"Nguyễn Văn A" <no-reply@example.com>',
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
    });

    expect(result.success).toBe(true);
    const [sent] = fakeClient.sentCommands;
    // The SES API field carries the same 7-bit-ASCII requirement as the raw header - it must be
    // encoded too, not just the header this test also checks below.
    expect(sent.FromEmailAddress).toMatch(
      /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <no-reply@example\.com>$/,
    );

    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    const fromLine = raw.split('\r\n').find(line => line.startsWith('From:'));
    expect(fromLine).toMatch(/^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <no-reply@example\.com>$/);
    expect([...fromLine!].every(char => char.charCodeAt(0) <= 127)).toBe(true);
  });

  test('a long non-ASCII subject splits into multiple encoded-words without cutting a character in half', async () => {
    const { helper, fakeClient } = buildSesTransport();
    // 30 four-byte code points (120 UTF-8 bytes) forces at least 3 encoded-words at 45 bytes per
    // chunk - if a chunk boundary lands mid-character, decoding that chunk alone yields a
    // replacement character (U+FFFD) instead of the original emoji.
    const subject = '😀'.repeat(30);
    const result = await helper.send({ to: 'a@b.com', subject, text: 'body' });

    expect(result.success).toBe(true);
    const [sent] = fakeClient.sentCommands;
    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    const encodedWords = [...raw.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)].map(
      match => match[1],
    );

    expect(encodedWords.length).toBeGreaterThan(1);
    const decoded = encodedWords
      .map(word => Buffer.from(word, 'base64').toString('utf-8'))
      .join('');
    expect(decoded).toBe(subject);
    expect(decoded).not.toContain('\uFFFD');
  });

  test('a long recipient list is folded so no physical line exceeds the SES 1000-byte cap', async () => {
    const { helper, fakeClient } = buildSesTransport();
    const recipients = Array.from({ length: 50 }, (_, index) => `recipient${index}@example.com`);

    const result = await helper.send({ to: recipients, subject: 'Hi', text: 'body' });

    expect(result.success).toBe(true);
    const [sent] = fakeClient.sentCommands;
    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    for (const line of raw.split('\r\n')) {
      expect(line.length).toBeLessThan(999);
    }
    // Folding must not drop or duplicate recipients - re-joining every continuation line of the
    // folded `To:` header must reproduce the exact original address list.
    expect(sent.Destination.ToAddresses).toEqual(recipients);
  });

  test('a single recipient address with no natural break point is never split mid-address by folding', async () => {
    const { helper, fakeClient } = buildSesTransport();
    // 133 characters, no space anywhere - long enough to force a fold decision but with no
    // natural break point, unlike a comma-separated list. Folding must leave this on one
    // physical line rather than force a break through the middle of an atomic address.
    const longAddress = `${'a'.repeat(120)}@example.com`;

    const result = await helper.send({ to: longAddress, subject: 'Hi', text: 'body' });

    expect(result.success).toBe(true);
    const [sent] = fakeClient.sentCommands;
    expect(sent.Destination.ToAddresses).toEqual([longAddress]);

    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    const toBlock = raw
      .split('\r\n\r\n')[0]
      .split('\r\n')
      .filter(l => l.startsWith('To:') || l.startsWith(' '));
    expect(toBlock.join('').replace('To: ', '')).toBe(longAddress);
  });

  test('an inline `cid` attachment nests under multipart/related, not multipart/mixed, so mail clients render it inline', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      html: '<img src="cid:logo">',
      attachments: [
        { filename: 'logo.png', content: 'binarydata', contentType: 'image/png', cid: 'logo' },
      ],
    });

    expect(result.success).toBe(true);
    const [sent] = fakeClient.sentCommands;
    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    expect(raw).toContain('Content-Type: multipart/related');
    expect(raw).not.toContain('Content-Type: multipart/mixed');
    expect(raw).toContain('Content-ID: <logo>');
    expect(raw).toContain('Content-Disposition: inline');
  });

  test('a regular attachment alongside an inline `cid` attachment keeps mixed and related separate', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      html: '<img src="cid:logo">',
      attachments: [
        { filename: 'logo.png', content: 'binarydata', contentType: 'image/png', cid: 'logo' },
        { filename: 'report.pdf', content: 'pdfdata', contentType: 'application/pdf' },
      ],
    });

    expect(result.success).toBe(true);
    const [sent] = fakeClient.sentCommands;
    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    expect(raw).toContain('Content-Type: multipart/mixed');
    expect(raw).toContain('Content-Type: multipart/related');
    expect(raw).toContain('filename="report.pdf"');
    expect(raw).toContain('Content-ID: <logo>');
  });

  test('an attachment declared `encoding: "base64"` is not encoded a second time', async () => {
    const { helper, fakeClient } = buildSesTransport();
    const originalBytes = Buffer.from('Hello World!', 'utf-8');
    const preEncoded = originalBytes.toString('base64');

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      attachments: [
        {
          filename: 'hello.txt',
          content: preEncoded,
          encoding: 'base64',
          contentType: 'text/plain',
        },
      ],
    });

    expect(result.success).toBe(true);
    const [sent] = fakeClient.sentCommands;
    const raw = (sent.Content.Raw.Data as Buffer).toString('utf-8');
    // Decoding whatever base64 payload landed on the wire must reproduce the ORIGINAL bytes -
    // double-encoding would instead reproduce the already-base64 text.
    const attachmentSection = raw.split('Content-Disposition: attachment')[1];
    const payload = attachmentSection.split('\r\n\r\n')[1].split(`\r\n--`)[0].replace(/\r\n/g, '');
    expect(Buffer.from(payload, 'base64').toString('utf-8')).toBe('Hello World!');
  });

  test('a provider failure is reported as a failed result, not thrown', async () => {
    const { helper } = buildSesTransport({ sendError: new Error('MessageRejected') });

    const result = await helper.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('MessageRejected');
  });
});

describe('AmazonSesTransportHelper - header injection defense', () => {
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

  /** `bcc` is not a header; it is checked anyway so a bad address fails here, named, not at AWS. */
  test('a CRLF smuggled into bcc is rejected before the command is built', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      bcc: 'quiet@example.com\r\nTo: attacker@evil.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('bcc');
    expect(fakeClient.sentCommands).toHaveLength(0);
  });

  /** Negative control: a well-formed bcc still sends, and still never appears as a header. */
  test('a valid bcc reaches BccAddresses and no Bcc header is written', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      bcc: ['quiet@example.com', 'shadow@example.com'],
    });

    expect(result.success).toBe(true);
    const [input] = fakeClient.sentCommands;
    expect(input.Destination.BccAddresses).toEqual(['quiet@example.com', 'shadow@example.com']);
    expect(input.Content.Raw.Data.toString()).not.toContain('Bcc:');
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

  test('a header value smuggled as an array (bypassing a naive string-only CRLF check) is rejected', async () => {
    const { helper, fakeClient } = buildSesTransport();

    const result = await helper.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      // `IMailMessage.headers` is typed `Record<string, string>`, but nothing at runtime stops a
      // caller that forwards an untyped request body from putting an array here. `['x\r\nBcc:
      // ...'].includes('\r')` is `false` (array membership, not substring) - a value-must-be-a-
      // string check is what actually closes this, not the CRLF check alone.
      headers: { 'X-Trace': ['trace-1\r\nBcc: attacker@evil.com'] as unknown as string },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('headers.X-Trace');
    expect(fakeClient.sentCommands).toHaveLength(0);
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

describe('AmazonSesTransportHelper - verify and close', () => {
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

    const helper = new AmazonSesTransportHelper({
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
        new AmazonSesTransportHelper({ config: { region: 'us-east-1' } });
        return undefined;
      } catch (caught) {
        return caught as AnyType;
      }
    })();

    expect(error).toBeDefined();
    expect(error.message).toContain("Please install '@aws-sdk/client-sesv2'");
  });
});
