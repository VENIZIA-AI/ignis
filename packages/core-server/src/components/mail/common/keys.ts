import { BindingKeys } from '@venizia/ignis-inversion';
import type { TGetMailQueueExecutorFn, TGetMailTransportFn } from '../providers';
import type { MailService, TemplateEngineService } from '../services';
import type {
  IMailQueueExecutor,
  IMailTransport,
  IVerificationCodeGenerator,
  IVerificationDataGenerator,
  IVerificationTokenGenerator,
  TMailOptions,
  TMailQueueExecutorConfig,
} from './types';

/** DI binding keys the mail component registers and reads: options, queue executor config, transport and queue provider/instance, services and verification generators. */
export class MailKeys {
  // Options & Configs
  static readonly MAIL_OPTIONS = BindingKeys.build<TMailOptions>({
    key: '@app/components/mail/options',
  });
  static readonly MAIL_QUEUE_EXECUTOR_CONFIG = BindingKeys.build<TMailQueueExecutorConfig>({
    key: '@app/components/mail/queue/executor-config',
  });

  // Transporter
  static readonly MAIL_TRANSPORT_PROVIDER = BindingKeys.build<TGetMailTransportFn>({
    key: '@app/components/mail/transport-provider',
  });
  static readonly MAIL_TRANSPORT_INSTANCE = BindingKeys.build<IMailTransport>({
    key: '@app/components/mail/transport-instance',
  });

  // Services
  static readonly MAIL_TEMPLATE_ENGINE = BindingKeys.build<TemplateEngineService>({
    key: '@app/components/mail/services/template-engine',
  });
  static readonly MAIL_SERVICE = BindingKeys.build<MailService>({
    key: '@app/components/mail/service',
  });

  // Generators
  static readonly MAIL_VERIFICATION_CODE_GENERATOR = BindingKeys.build<IVerificationCodeGenerator>({
    key: '@app/components/mail/verification/code-generator',
  });

  static readonly MAIL_VERIFICATION_TOKEN_GENERATOR = BindingKeys.build<IVerificationTokenGenerator>({
    key: '@app/components/mail/verification/token-generator',
  });

  static readonly MAIL_VERIFICATION_DATA_GENERATOR = BindingKeys.build<IVerificationDataGenerator>({
    key: '@app/components/mail/verification/data-generator',
  });

  // Queue
  static readonly MAIL_QUEUE_EXECUTOR_PROVIDER = BindingKeys.build<TGetMailQueueExecutorFn>({
    key: '@app/components/mail/queue-executor-provider',
  });
  static readonly MAIL_QUEUE_EXECUTOR_INSTANCE = BindingKeys.build<IMailQueueExecutor>({
    key: '@app/components/mail/queue-executor-instance',
  });
}
