import { describe, expect, test } from 'bun:test';
import { MailErrorCodes, type TMailOptions } from '@/components/mail/common';
import { MailService, TemplateEngineService } from '@/components/mail/services';
import { isApplicationError, type AnyType } from '@venizia/ignis-helpers';
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

    const error = await service
      .send({ to: '', subject: 'Hi', text: 'body' })
      .catch((caught: AnyType) => caught);

    expect(isApplicationError(error)).toBe(true);
    expect(error.statusCode).toBe(400);
    expect(error.messageCode).toBe(MailErrorCodes.INVALID_RECIPIENT);
    expect(transport.sentMessages).toHaveLength(0);
  });

  test('an empty recipient array keeps its 400 identity', async () => {
    const { service } = buildService();

    const error = await service
      .send({ to: [], subject: 'Hi', text: 'body' })
      .catch((caught: AnyType) => caught);

    expect(error.statusCode).toBe(400);
    expect(error.messageCode).toBe(MailErrorCodes.INVALID_RECIPIENT);
  });

  test('a missing subject keeps its 400 identity', async () => {
    const { service } = buildService();

    const error = await service
      .send({ to: 'a@b.com', subject: '', text: 'body' })
      .catch((caught: AnyType) => caught);

    expect(error.statusCode).toBe(400);
    expect(error.messageCode).toBe(MailErrorCodes.INVALID_CONFIGURATION);
  });

  test('a transport that throws is still wrapped as 500 / SEND_FAILED', async () => {
    const transport = new FakeMailTransport({ sendError: new Error('socket hang up') });
    const { service } = buildService({ transport });

    const error = await service
      .send({ to: 'a@b.com', subject: 'Hi', text: 'body' })
      .catch((caught: AnyType) => caught);

    expect(error.statusCode).toBe(500);
    expect(error.messageCode).toBe(MailErrorCodes.SEND_FAILED);
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

describe('MailService - sendBatch', () => {
  test('one invalid message does not abort the batch', async () => {
    const { service, transport } = buildService();

    const results = await service.sendBatch([
      { to: 'a@b.com', subject: 'Hi', text: 'body' },
      { to: '', subject: 'Hi', text: 'body' },
      { to: 'c@d.com', subject: 'Hi', text: 'body' },
    ]);

    expect(results).toHaveLength(3);
    expect(results.map(result => result.success)).toEqual([true, false, true]);
    expect(transport.sentMessages).toHaveLength(2);
  });

  test('an empty batch resolves to an empty result list', async () => {
    const { service } = buildService();
    expect(await service.sendBatch([])).toEqual([]);
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

  test('an unknown template surfaces 404 / TEMPLATE_NOT_FOUND', async () => {
    const { service } = buildService({ templateEngine: new TemplateEngineService() });

    const error = await service
      .sendTemplate({ templateName: 'nope', data: {}, recipients: 'a@b.com' })
      .catch((caught: AnyType) => caught);

    expect(error.statusCode).toBe(404);
    expect(error.messageCode).toBe(MailErrorCodes.TEMPLATE_NOT_FOUND);
  });

  test('a missing template engine surfaces INVALID_CONFIGURATION', async () => {
    const { service } = buildService();

    const error = await service
      .sendTemplate({ templateName: 'welcome', data: {}, recipients: 'a@b.com' })
      .catch((caught: AnyType) => caught);

    expect(error.messageCode).toBe(MailErrorCodes.INVALID_CONFIGURATION);
  });
});

describe('MailService - verify', () => {
  test('a false verification is returned, not thrown', async () => {
    const transport = new FakeMailTransport({ verifyResult: false });
    const { service } = buildService({ transport });

    expect(await service.verify()).toBe(false);
  });

  test('a throwing verification is wrapped as VERIFICATION_FAILED', async () => {
    const transport = new FakeMailTransport({ verifyError: new Error('ECONNREFUSED') });
    const { service } = buildService({ transport });

    const error = await service.verify().catch((caught: AnyType) => caught);
    expect(error.statusCode).toBe(500);
    expect(error.messageCode).toBe(MailErrorCodes.VERIFICATION_FAILED);
  });
});
