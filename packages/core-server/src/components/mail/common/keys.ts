export class MailKeys {
  // Options & Configs
  static readonly MAIL_OPTIONS = '@app/components/mail/options';
  static readonly MAIL_QUEUE_EXECUTOR_CONFIG = '@app/components/mail/queue/executor-config';

  // Transporter
  static readonly MAIL_TRANSPORT_PROVIDER = '@app/components/mail/transport-provider';
  static readonly MAIL_TRANSPORT_INSTANCE = '@app/components/mail/transport-instance';

  // Services
  static readonly MAIL_TEMPLATE_ENGINE = '@app/components/mail/services/template-engine';
  static readonly MAIL_SERVICE = '@app/components/mail/service';

  // Generators
  static readonly MAIL_VERIFICATION_CODE_GENERATOR =
    '@app/components/mail/verification/code-generator';
  static readonly MAIL_VERIFICATION_TOKEN_GENERATOR =
    '@app/components/mail/verification/token-generator';
  static readonly MAIL_VERIFICATION_DATA_GENERATOR =
    '@app/components/mail/verification/data-generator';

  // Queue
  static readonly MAIL_QUEUE_EXECUTOR_PROVIDER = '@app/components/mail/queue-executor-provider';
  static readonly MAIL_QUEUE_EXECUTOR_INSTANCE = '@app/components/mail/queue-executor-instance';
}
