import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@venizia/ignis-kernel';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { IMailQueueExecutorConfig, TMailOptions } from './common';
import { MailErrorCodes, MailKeys, MailQueueExecutorTypes } from './common';
import type { TGetMailQueueExecutorFn, TGetMailTransportFn } from './providers';
import { MailQueueExecutorProvider, MailTransportProvider } from './providers';
import {
  DefaultVerificationDataGenerator,
  MailService,
  NumericCodeGenerator,
  RandomTokenGenerator,
  TemplateEngineService,
} from './services';

export class MailComponent extends BaseComponent<TMailOptions> {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: MailComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {},
    });
  }

  /** `application.component(MailComponent, { options })` lands here; the call site outranks a key bound earlier. */
  override async configure(opts?: TMailOptions): Promise<void> {
    // The base short-circuits a second call; binding before that check would swap the options
    // under a transport that was already built from the first ones.
    if (this.isConfigured) {
      return;
    }

    if (opts !== undefined) {
      this.application.bind<TMailOptions>({ key: MailKeys.MAIL_OPTIONS }).toValue(opts);
    }

    await super.configure(opts);
  }

  override binding(): void | Promise<void> {
    if (!this.application.isBound({ key: MailKeys.MAIL_OPTIONS })) {
      this.logger
        .for(this.binding.name)
        .error(
          'Mail options not configured. Please bind MailKeys.MAIL_OPTIONS before adding MailComponent.',
        );

      throw getError({
        message: 'Mail options not configured',
      });
    }

    this.initGenerators();
    this.initProviders();
    this.initServices();

    this.createAndBindInstances();

    this.logger.for(this.binding.name).info('Mail component initialized successfully');
  }

  initGenerators() {
    this.application
      .bind({ key: MailKeys.MAIL_VERIFICATION_CODE_GENERATOR })
      .toClass(NumericCodeGenerator);
    this.application
      .bind({ key: MailKeys.MAIL_VERIFICATION_TOKEN_GENERATOR })
      .toClass(RandomTokenGenerator);
    this.application
      .bind({ key: MailKeys.MAIL_VERIFICATION_DATA_GENERATOR })
      .toClass(DefaultVerificationDataGenerator);
  }

  initProviders() {
    this.application
      .bind({ key: MailKeys.MAIL_TRANSPORT_PROVIDER })
      .toProvider(MailTransportProvider)
      .setScope('singleton');
    this.application
      .bind({ key: MailKeys.MAIL_QUEUE_EXECUTOR_PROVIDER })
      .toProvider(MailQueueExecutorProvider)
      .setScope('singleton');
  }

  initServices() {
    this.application
      .bind({ key: MailKeys.MAIL_SERVICE })
      .toClass(MailService)
      .setScope('singleton');
    this.application
      .bind({ key: MailKeys.MAIL_TEMPLATE_ENGINE })
      .toClass(TemplateEngineService)
      .setScope('singleton');
  }

  /** A bad limit or root would otherwise surface on every send, as a 400 that blames the caller. */
  private validateAttachmentOptions(opts: { options: TMailOptions }): void {
    const { attachmentRoot, maxAttachmentBytes } = opts.options;
    const buildOptionError = (details: { message: string; cause?: unknown }) => {
      return getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        messageCode: MailErrorCodes.INVALID_CONFIGURATION,
        message: `Invalid mail options | ${details.message}`,
        cause: details.cause,
      });
    };

    const isValidLimit =
      maxAttachmentBytes === undefined ||
      (Number.isSafeInteger(maxAttachmentBytes) && maxAttachmentBytes > 0);

    if (!isValidLimit) {
      throw buildOptionError({ message: 'maxAttachmentBytes must be a positive integer' });
    }

    if (attachmentRoot === undefined) {
      return;
    }

    if (typeof attachmentRoot !== 'string' || !isAbsolute(attachmentRoot)) {
      throw buildOptionError({ message: 'attachmentRoot must be an absolute path' });
    }

    let isDirectory: boolean;

    try {
      isDirectory = statSync(attachmentRoot).isDirectory();
    } catch (error) {
      throw buildOptionError({
        message: 'attachmentRoot must be an existing directory',
        cause: error,
      });
    }

    if (!isDirectory) {
      throw buildOptionError({ message: 'attachmentRoot must be an existing directory' });
    }
  }

  createAndBindInstances(): void {
    // Transport
    const transportGetter = this.application.get<TGetMailTransportFn>({
      key: MailKeys.MAIL_TRANSPORT_PROVIDER,
    });
    const mailOptions = this.application.get<TMailOptions>({ key: MailKeys.MAIL_OPTIONS });
    this.validateAttachmentOptions({ options: mailOptions });

    // Only the provider is logged: the options carry SMTP / API credentials, which must never reach a log sink.
    this.logger
      .for(this.createAndBindInstances.name)
      .info('Mail provider: %s', mailOptions.provider);

    const mailTransportInstance = transportGetter(mailOptions);
    this.application.bind({ key: MailKeys.MAIL_TRANSPORT_INSTANCE }).toValue(mailTransportInstance);

    // Queue
    const queueGetter = this.application.get<TGetMailQueueExecutorFn>({
      key: MailKeys.MAIL_QUEUE_EXECUTOR_PROVIDER,
    });

    // Queueing is opt-in: with no executor config bound, fall back to the direct (inline) executor instead of a "binding is not bounded" crash at boot.
    const queueConfig = this.application.get<IMailQueueExecutorConfig>({
      key: MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG,
      isOptional: true,
    }) ?? { type: MailQueueExecutorTypes.DIRECT };

    // Same reason as above: a bullmq config carries the Redis password.
    this.logger
      .for(this.createAndBindInstances.name)
      .info('Mail queue executor type: %s', queueConfig.type);

    const queueExecutorInstance = queueGetter(queueConfig);
    this.application
      .bind({ key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE })
      .toValue(queueExecutorInstance);
  }
}
