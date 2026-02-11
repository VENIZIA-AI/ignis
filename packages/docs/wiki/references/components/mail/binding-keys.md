# Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/components/mail/options` | `MailKeys.MAIL_OPTIONS` | `TMailOptions` | Yes | -- |
| `@app/components/mail/queue/executor-config` | `MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG` | `IMailQueueExecutorConfig` | Yes | -- |
| `@app/components/mail/service` | `MailKeys.MAIL_SERVICE` | `IMailService` | No | `MailService` (singleton) |
| `@app/components/mail/services/template-engine` | `MailKeys.MAIL_TEMPLATE_ENGINE` | `IMailTemplateEngine` | No | `TemplateEngineService` (singleton) |
| `@app/components/mail/transport-provider` | `MailKeys.MAIL_TRANSPORT_PROVIDER` | `TGetMailTransportFn` | No | `MailTransportProvider` (singleton) |
| `@app/components/mail/transport-instance` | `MailKeys.MAIL_TRANSPORT_INSTANCE` | `IMailTransport` | No | Created by component |
| `@app/components/mail/queue-executor-provider` | `MailKeys.MAIL_QUEUE_EXECUTOR_PROVIDER` | `TGetMailQueueExecutorFn` | No | `MailQueueExecutorProvider` (singleton) |
| `@app/components/mail/queue-executor-instance` | `MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE` | `IMailQueueExecutor` | No | Created by component |
| `@app/components/mail/verification/code-generator` | `MailKeys.MAIL_VERIFICATION_CODE_GENERATOR` | `IVerificationCodeGenerator` | No | `NumericCodeGenerator` |
| `@app/components/mail/verification/token-generator` | `MailKeys.MAIL_VERIFICATION_TOKEN_GENERATOR` | `IVerificationTokenGenerator` | No | `RandomTokenGenerator` |
| `@app/components/mail/verification/data-generator` | `MailKeys.MAIL_VERIFICATION_DATA_GENERATOR` | `IVerificationDataGenerator` | No | `DefaultVerificationDataGenerator` |

> [!IMPORTANT]
> Both `MailKeys.MAIL_OPTIONS` and `MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG` must be bound before registering `MailComponent`. The component throws an error if `MAIL_OPTIONS` is not found.
