import { describe, expect, test } from 'bun:test';
import { MailComponent } from '@/components/mail/component';
import { MailKeys, type IMailTransport, type TMailOptions } from '@/components/mail/common';
import {
  DirectMailExecutorHelper,
  InternalQueueMailExecutorHelper,
} from '@/components/mail/helpers';
import { Container } from '@/helpers/inversion';
import type { AnyType } from '@venizia/ignis-helpers';
import { FakeLogger, FakeMailTransport } from './fakes';

/**
 * The component only ever talks to the container (isBound/bind/get), so a plain Container stands in
 * for the application. The transport is bound through the `custom` provider - no SMTP peer needed.
 */
const buildComponent = (opts: {
  mailOptions?: TMailOptions | null;
  queueConfig?: AnyType | null;
  transport?: FakeMailTransport;
}) => {
  const container = new Container({ scope: 'MailComponentTest' });
  const transport = opts.transport ?? new FakeMailTransport();

  if (opts.mailOptions !== null) {
    container
      .bind({ key: MailKeys.MAIL_OPTIONS })
      .toValue(
        opts.mailOptions ??
          ({ provider: 'custom', config: transport, from: 'sender@example.com' } as TMailOptions),
      );
  }

  if (opts.queueConfig !== null) {
    container
      .bind({ key: MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG })
      .toValue(opts.queueConfig ?? { type: 'direct' });
  }

  const component = new MailComponent(container as AnyType);
  const fakeLogger = new FakeLogger();
  component['logger'] = fakeLogger as AnyType;

  return { container, component, transport, fakeLogger };
};

describe('MailComponent - wiring', () => {
  test('binds the transport instance, the executor and every declared service', async () => {
    const { container, component, transport } = buildComponent({});

    await component.configure();

    expect(container.get<IMailTransport>({ key: MailKeys.MAIL_TRANSPORT_INSTANCE })).toBe(
      transport as AnyType,
    );
    expect(container.get({ key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE })).toBeInstanceOf(
      DirectMailExecutorHelper,
    );

    // Class bindings are asserted by presence: `bun test` does not resolve the decorator flags that
    // live two `extends` hops away, so container.instantiate() of an @inject'ed class is not
    // exercisable in this runtime.
    for (const key of [
      MailKeys.MAIL_SERVICE,
      MailKeys.MAIL_TEMPLATE_ENGINE,
      MailKeys.MAIL_VERIFICATION_CODE_GENERATOR,
      MailKeys.MAIL_VERIFICATION_TOKEN_GENERATOR,
      MailKeys.MAIL_VERIFICATION_DATA_GENERATOR,
      MailKeys.MAIL_TRANSPORT_PROVIDER,
      MailKeys.MAIL_QUEUE_EXECUTOR_PROVIDER,
    ]) {
      expect(container.isBound({ key })).toBe(true);
    }
  });

  test('the internal-queue executor config is honoured', async () => {
    const { container, component } = buildComponent({
      queueConfig: { type: 'internal-queue', internalQueue: { identifier: 'component-queue' } },
    });

    await component.configure();

    const executor = container.get<InternalQueueMailExecutorHelper>({
      key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE,
    });

    expect(executor).toBeInstanceOf(InternalQueueMailExecutorHelper);
    await executor.close();
  });

  test('missing mail options fail loudly', async () => {
    const { component } = buildComponent({ mailOptions: null });

    const error = await component.configure().catch((caught: AnyType) => caught);
    expect(error.message).toContain('Mail options not configured');
  });

  test('an UNBOUND queue executor config falls back to the direct executor', async () => {
    const { container, component } = buildComponent({ queueConfig: null });

    await component.configure();

    expect(container.get({ key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE })).toBeInstanceOf(
      DirectMailExecutorHelper,
    );
  });

  test('configuring twice is idempotent - the transport instance is not rebuilt', async () => {
    const { container, component } = buildComponent({});

    await component.configure();
    const firstTransport = container.get<AnyType>({ key: MailKeys.MAIL_TRANSPORT_INSTANCE });
    const firstExecutor = container.get<AnyType>({ key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE });

    await component.configure();

    expect(container.get<AnyType>({ key: MailKeys.MAIL_TRANSPORT_INSTANCE })).toBe(firstTransport);
    expect(container.get<AnyType>({ key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE })).toBe(
      firstExecutor,
    );
  });
});

describe('MailComponent - confidentiality', () => {
  test('the SMTP password is never written to the logs', async () => {
    const { component, fakeLogger } = buildComponent({
      mailOptions: {
        provider: 'custom',
        config: new FakeMailTransport(),
        from: 'sender@example.com',
        auth: { user: 'mailer', pass: 'super-secret-pass' },
      } as AnyType,
    });

    await component.configure();

    const logged = fakeLogger.lines.join('\n');
    expect(logged).not.toContain('super-secret-pass');
  });

  test('the redis password of a bullmq queue config is never written to the logs', async () => {
    const { component, fakeLogger } = buildComponent({
      queueConfig: {
        type: 'direct',
        bullmq: {
          redis: { host: 'localhost', port: 6379, password: 'super-secret-redis' },
          queue: { identifier: 'mail', name: 'mail' },
          mode: 'both',
        },
      },
    });

    await component.configure();

    const logged = fakeLogger.lines.join('\n');
    expect(logged).not.toContain('super-secret-redis');
  });
});
