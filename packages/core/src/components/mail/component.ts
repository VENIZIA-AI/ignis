import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common';
import { getError } from '@/helpers';
import { IMailQueueExecutorConfig, MailKeys, TMailOptions } from './common';
import {
  MailQueueExecutorProvider,
  MailTransportProvider,
  TGetMailQueueExecutorFn,
  TGetMailTransportFn,
} from './providers';
import {
  DefaultVerificationDataGenerator,
  MailService,
  NumericCodeGenerator,
  RandomTokenGenerator,
  TemplateEngineService,
} from './services';

export class MailComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: MailComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {},
    });
  }

  // --------------------------------------------------------------------------------
  override binding(): void | Promise<void> {
    if (!this.application.isBound({ key: MailKeys.MAIL_OPTIONS })) {
      this.logger.error(
        '[binding] Mail options not configured. Please bind MailKeys.MAIL_OPTIONS before adding MailComponent.',
      );

      throw getError({
        message: 'Mail options not configured',
      });
    }

    this.initGenerators();
    this.initProviders();
    this.initServices();

    this.createAndBindInstances();

    this.logger.info('[binding] Mail component initialized successfully');
  }

  // --------------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------------
  createAndBindInstances(): void {
    // Transport
    const transportGetter = this.application.get<TGetMailTransportFn>({
      key: MailKeys.MAIL_TRANSPORT_PROVIDER,
    });
    const mailOptions = this.application.get<TMailOptions>({ key: MailKeys.MAIL_OPTIONS });

    this.logger.info('[createAndBindInstances] Mail Options: %j', mailOptions);
    const mailTransportInstance = transportGetter(mailOptions);
    this.application.bind({ key: MailKeys.MAIL_TRANSPORT_INSTANCE }).toValue(mailTransportInstance);

    // Queue
    const queueGetter = this.application.get<TGetMailQueueExecutorFn>({
      key: MailKeys.MAIL_QUEUE_EXECUTOR_PROVIDER,
    });
    const queueConf = this.application.get<IMailQueueExecutorConfig>({
      key: MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG,
    });

    this.logger.info('[createAndBindInstances] Mail Queue Executor Config: %j', queueConf);
    const queueExecutorInstance = queueGetter(queueConf);
    this.application
      .bind({ key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE })
      .toValue(queueExecutorInstance);
  }
}
