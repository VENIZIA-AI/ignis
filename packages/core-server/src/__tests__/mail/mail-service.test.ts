import { describe, expect, test } from 'bun:test';
import {
  MailDefaults,
  MailErrorCodes,
  MailErrors,
  type TMailOptions,
} from '@/components/mail/common';
import { MailService, TemplateEngineService } from '@/components/mail/services';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { type AnyType } from '@venizia/ignis-helpers/common';
import { FakeMailTransport } from './fakes';

const buildService = (opts?: {
  transport?: FakeMailTransport;
  options?: Partial<TMailOptions>;
  templateEngine?: TemplateEngineService;
}) => {
  const transport = opts?.transport ?? new FakeMailTransport();
  const mailOptions = {
    provider: 'custom',
    config: transport,
    from: 'sender@example.com',
    ...opts?.options,
  } as TMailOptions;

  const service = new MailService(mailOptions, transport, opts?.templateEngine);

  return { service, transport };
};

describe('MailService - validation errors', () => {
  test('a missing recipient keeps its 400 / INVALID_RECIPIENT identity', async () => {
    const { service, transport } = buildService();

    let error: AnyType;

    try {
      await service.send({ to: '', subject: 'Hi', text: 'body' });
    } catch (caught) {
      error = caught;
    }

    expect(isApplicationError(error)).toBe(true);
    expect(error.statusCode).toBe(400);
    expect(error.normalized.code).toBe(MailErrors.INVALID_RECIPIENT.message.code);
    expect(transport.sentMessages).toHaveLength(0);
  });

  test('an empty recipient array keeps its 400 identity', async () => {
    const { service } = buildService();

    let error: AnyType;

    try {
      await service.send({ to: [], subject: 'Hi', text: 'body' });
    } catch (caught) {
      error = caught;
    }

    expect(error.statusCode).toBe(400);
    expect(error.normalized.code).toBe(MailErrors.INVALID_RECIPIENT.message.code);
  });

  test('a missing subject keeps its 400 identity', async () => {
    const { service } = buildService();

    let error: AnyType;

    try {
      await service.send({ to: 'a@b.com', subject: '', text: 'body' });
    } catch (caught) {
      error = caught;
    }

    expect(error.statusCode).toBe(400);
    expect(error.normalized.code).toBe(MailErrors.INVALID_CONFIGURATION.message.code);
  });

  test('a transport that throws is still wrapped as 500 / SEND_FAILED', async () => {
    const transport = new FakeMailTransport({ sendError: new Error('socket hang up') });
    const { service } = buildService({ transport });

    let error: AnyType;

    try {
      await service.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });
    } catch (caught) {
      error = caught;
    }

    expect(error.statusCode).toBe(500);
    expect(error.normalized.code).toBe(MailErrorCodes.SEND_FAILED);
  });
});

describe('MailService - default sender', () => {
  test('fromName + from renders a display-name address', async () => {
    const { service, transport } = buildService({
      options: { from: 'sender@example.com', fromName: 'Ignis' },
    });

    await service.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });
    expect(transport.sentMessages[0].from).toBe('"Ignis" <sender@example.com>');
  });

  test('a quote or backslash in fromName is escaped, so it cannot end the display name', async () => {
    const { service, transport } = buildService({
      options: { from: 'sender@example.com', fromName: 'Ig"nis\\' },
    });

    await service.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });
    expect(transport.sentMessages[0].from).toBe('"Ig\\"nis\\\\" <sender@example.com>');
  });

  test('fromName without from never renders "<undefined>"', async () => {
    const { service, transport } = buildService({
      options: { from: undefined, fromName: 'Ignis' },
    });

    await service.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });

    const from = transport.sentMessages[0].from ?? '';
    expect(from).not.toContain('undefined');
    expect(from).toBe('noreply@example.com');
  });

  test('an explicit message.from wins over the configured default', async () => {
    const { service, transport } = buildService({
      options: { from: 'sender@example.com', fromName: 'Ignis' },
    });

    await service.send({ to: 'a@b.com', from: 'other@example.com', subject: 'Hi', text: 'body' });
    expect(transport.sentMessages[0].from).toBe('other@example.com');
  });
});

describe('MailService - header checks', () => {
  const refused = async (message: AnyType) => {
    const { service, transport } = buildService();
    let error: AnyType;

    try {
      await service.send({ to: 'a@b.com', subject: 'Hi', text: 'body', ...message });
    } catch (caught) {
      error = caught;
    }

    expect(transport.sentMessages).toHaveLength(0);

    return error;
  };

  test.each([
    ['replyTo', { replyTo: 'visitor@example.com\r\nBcc: attacker@evil.com' }],
    ['subject', { subject: 'Hi\r\nBcc: attacker@evil.com' }],
    ['bcc', { bcc: 'quiet@example.com\r\nTo: attacker@evil.com' }],
    ['to', { to: ['ok@example.com', 'bad@example.com\nBcc: x@y.z'] }],
    ['from', { from: 'a@b.com\0' }],
    ['a header value', { headers: { 'X-Trace': 'trace-1\r\nBcc: attacker@evil.com' } }],
    ['a header value that is an array', { headers: { 'X-Trace': ['x\r\nBcc: evil'] } }],
  ])('a line break in %s is refused with a 400 before any transport', async (_label, message) => {
    const error = await refused(message);

    expect(error.statusCode).toBe(400);
    expect(error.normalized.code).toBe('core.mail.invalid_header');
  });

  test.each(['X Bad', 'X:Bad', 'Naïve', ''])('the header name %p is refused', async (name) => {
    const error = await refused({ headers: { [name]: 'v' } });

    expect(error.normalized.code).toBe('core.mail.invalid_header');
  });

  test('well-formed headers and addresses still send', async () => {
    const { service, transport } = buildService();

    await service.send({
      to: ['a@b.com', '"Doe, Jane" <jane@x.com>'],
      cc: 'c@d.com',
      subject: 'Hi',
      text: 'body',
      headers: { 'X-Trace': 'trace-1', 'List-Unsubscribe': '<mailto:u@x.com>' },
    });

    expect(transport.sentMessages).toHaveLength(1);
  });
});

describe('MailService - sendBatch', () => {
  test('one invalid message does not abort the batch', async () => {
    const { service, transport } = buildService();

    const results = await service.sendBatch([
      { to: 'a@b.com', subject: 'Hi', text: 'body' },
      { to: '', subject: 'Hi', text: 'body' },
      { to: 'c@d.com', subject: 'Hi', text: 'body' },
    ]);

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.success)).toEqual([true, false, true]);
    expect(transport.sentMessages).toHaveLength(2);
  });

  test('an empty batch resolves to an empty result list', async () => {
    const { service } = buildService();
    const result = await service.sendBatch([]);
    expect(result).toEqual([]);
  });
});

describe('MailService - sendTemplate', () => {
  test('renders body and subject from the registered template', async () => {
    const templateEngine = new TemplateEngineService();
    templateEngine.registerTemplate({
      name: 'welcome',
      content: '<p>Hello {{name}}</p>',
      options: { subject: 'Welcome {{name}}' },
    });

    const { service, transport } = buildService({ templateEngine });

    await service.sendTemplate({
      templateName: 'welcome',
      data: { name: 'Phat' },
      recipients: 'a@b.com',
    });

    expect(transport.sentMessages[0].html).toBe('<p>Hello Phat</p>');
    expect(transport.sentMessages[0].subject).toBe('Welcome Phat');
  });

  test('values are HTML-escaped in the body, raw only with triple braces, and never in the subject', async () => {
    const templateEngine = new TemplateEngineService();
    templateEngine.registerTemplate({
      name: 'welcome',
      content: '<p>{{name}}</p><div>{{{trusted}}}</div>',
      options: { subject: 'Hi {{name}}' },
    });
    const { service, transport } = buildService({ templateEngine });

    await service.sendTemplate({
      templateName: 'welcome',
      data: { name: '<a href="x">Phat & co</a>', trusted: '<b>ok</b>' },
      recipients: 'a@b.com',
    });

    expect(transport.sentMessages[0].html).toBe(
      '<p>&lt;a href=&quot;x&quot;&gt;Phat &amp; co&lt;/a&gt;</p><div><b>ok</b></div>',
    );
    expect(transport.sentMessages[0].subject).toBe('Hi <a href="x">Phat & co</a>');
  });

  test('options cannot replace the recipients or the rendered body, and requireValidate is not sent', async () => {
    const templateEngine = new TemplateEngineService();
    templateEngine.registerTemplate({ name: 'welcome', content: '<p>Hello</p>' });
    const { service, transport } = buildService({ templateEngine });

    await service.sendTemplate({
      templateName: 'welcome',
      data: {},
      recipients: 'real@b.com',
      options: {
        to: 'attacker@evil.com',
        html: '<p>phish</p>',
        requireValidate: true,
        cc: 'c@d.com',
      },
    });

    const [sent] = transport.sentMessages;
    expect(sent.to).toBe('real@b.com');
    expect(sent.html).toBe('<p>Hello</p>');
    expect(sent.cc).toBe('c@d.com');
    expect('requireValidate' in sent).toBe(false);
    expect(sent.subject).toBe(MailDefaults.SUBJECT);
  });

  test('an unknown template surfaces 404 / TEMPLATE_NOT_FOUND', async () => {
    const { service } = buildService({ templateEngine: new TemplateEngineService() });

    let error: AnyType;

    try {
      await service.sendTemplate({ templateName: 'nope', data: {}, recipients: 'a@b.com' });
    } catch (caught) {
      error = caught;
    }

    expect(error.statusCode).toBe(404);
    expect(error.normalized.code).toBe(MailErrors.TEMPLATE_NOT_FOUND.message.code);
  });

  test('a missing template engine surfaces INVALID_CONFIGURATION', async () => {
    const { service } = buildService();

    let error: AnyType;

    try {
      await service.sendTemplate({ templateName: 'welcome', data: {}, recipients: 'a@b.com' });
    } catch (caught) {
      error = caught;
    }

    expect(error.normalized.code).toBe(MailErrors.INVALID_CONFIGURATION.message.code);
  });
});

describe('MailService - verify', () => {
  test('a false verification is returned, not thrown', async () => {
    const transport = new FakeMailTransport({ verifyResult: false });
    const { service } = buildService({ transport });

    const result = await service.verify();
    expect(result).toBe(false);
  });

  test('a throwing verification is wrapped as VERIFICATION_FAILED', async () => {
    const transport = new FakeMailTransport({ verifyError: new Error('ECONNREFUSED') });
    const { service } = buildService({ transport });

    let error: AnyType;

    try {
      await service.verify();
    } catch (caught) {
      error = caught;
    }

    expect(error.statusCode).toBe(500);
    expect(error.normalized.code).toBe(MailErrorCodes.VERIFICATION_FAILED);
  });
});
