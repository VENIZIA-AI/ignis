---
title: Mail Component
description: Send email through pluggable transports (Nodemailer, Mailgun, Amazon SES, custom) with templates, batch sending, and a pluggable queue executor
difficulty: intermediate
---

# Mail Component

`MailComponent` wires a pluggable email transport (Nodemailer, Mailgun, Amazon SES, or your own) into `MailService`. It adds template rendering, batch sending, and an independent queue executor for verification-code/token flows.

## In one example

Pass the options at the call site, then inject `IMailService` anywhere to send:

```typescript
import { BaseApplication, ValueOrPromise } from '@venizia/ignis';
import { MailComponent, MailProviders } from '@venizia/ignis/mail';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.component(MailComponent, {
      options: {
        provider: MailProviders.NODEMAILER,
        from: 'noreply@example.com',
        config: {
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user: process.env.APP_ENV_MAIL_USER, pass: process.env.APP_ENV_MAIL_PASS },
        },
      },
    });
  }
}
```

Binding `MailKeys.MAIL_OPTIONS` yourself works too, and the order does not matter. [How it works](#how-it-works) says why.

```typescript
import { BaseService, inject } from '@venizia/ignis';
import { MailKeys, type IMailService } from '@venizia/ignis/mail';

export class UserService extends BaseService {
  constructor(@inject({ key: MailKeys.MAIL_SERVICE }) private mailService: IMailService) {
    super({ scope: UserService.name });
  }

  async sendWelcomeEmail(email: string) {
    return this.mailService.send({ to: email, subject: 'Welcome!', html: '<h1>Welcome!</h1>' });
  }
}
```

`MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG` is optional -- omit it and `MailComponent` binds a `direct` executor (no queue) by default.

## How it works

- **One required setting.** `MailComponent.binding()` throws `Mail options not configured` if nothing supplied `MailKeys.MAIL_OPTIONS`. Every other binding is optional, with a working default: queue executor config, verification generators, and more.

- **Two ways to supply it, and order never matters.** `this.component(MailComponent, { options })` reaches `MailComponent.configure(opts)`, which binds `MailKeys.MAIL_OPTIONS` for you. Or bind the key yourself anywhere in `preConfigure()`. `configure()` does not run until the `registerComponents` boot step, several steps after `preConfigure()` finishes, so a hand-written binding placed after `this.component(...)` still lands in time. Supply both and the call-site options win.

- **Transport is a discriminated union.** `TMailOptions.provider` picks the transport class:

  | `provider` | Class |
  |---|---|
  | `nodemailer` | `NodemailerTransportHelper` |
  | `mailgun` | `MailgunTransportHelper` |
  | `amazon-ses` | `AmazonSesTransportHelper` |
  | `custom` | Your own object, implementing `IMailTransport` (`send()` + `verify()`) |

  `MailTransportProvider` is the factory that switches on the provider. It throws for an unsupported provider string.

- **`MailService` is the one sending entry point.** `send()`, `sendBatch()`, `sendTemplate()`, and `verify()` all validate first, then call the transport directly, then normalize failures into `MailErrorCodes`:

  | Case | Result |
  |---|---|
  | Validation error | Passes through unchanged as `400` |
  | Transport throws | Wrapped as `SEND_FAILED` (`500`) |
  | Nodemailer / Mailgun transport | Never throws - returns `{ success: false, error }` instead |

- **Attachments reach the transport as bytes, never as a path.** `send()` reads every attachment into `content` first. A `path` is read only inside the `attachmentRoot` option, and refused when that option is unset. A message's attachments together may not pass `maxAttachmentBytes` (default 25 MB). `text` and `html` must be strings for the same reason. See [Attachments](./usage#attachments).

- **The queue executor is a separate subsystem, not a mail queue.** `IMailQueueExecutor` (`direct` / `internal-queue` / `bullmq`) exposes only `enqueueVerificationEmail()` and `setProcessor()`, and never touches `MailService`. Call `setProcessor()` before `enqueueVerificationEmail()`, with your own function - typically one wrapping `mailService.send()`.

- **Templates are a simple substitution engine.** `TemplateEngineService` stores templates in an in-memory `Map`. It replaces <code v-pre>{{variable}}</code> placeholders, with dot-notation for nested values. A missing value is logged and left as the literal placeholder text, not blanked out.

- **Startup logging never leaks credentials.** `MailComponent` logs only `mailOptions.provider` and `queueExecutorConfig.type`. It never logs the SMTP password, OAuth2 secret, API key, or Redis password nested inside them.

## Common tasks

### Send an email

Inject `IMailService` via `MailKeys.MAIL_SERVICE` and call `send()`.

```typescript
const result = await this.mailService.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome!</h1>',
  text: 'Welcome!',
});
```

### Send a batch of emails

`sendBatch()` runs each message through `send()` with bounded concurrency (default `5`).

```typescript
const results = await this.mailService.sendBatch(messages, { concurrency: 5 });
```

### Send a registered template

Register a template on `IMailTemplateEngine`, then send it through `IMailService`.

```typescript
this.templateEngine.registerTemplate({
  name: 'welcome-email',
  content: '<h1>Welcome {{userName}}!</h1>',
  options: { subject: 'Welcome to {{appName}}' },
});

await this.mailService.sendTemplate({
  templateName: 'welcome-email',
  data: { userName: 'Jane', appName: 'My App' },
  recipients: 'user@example.com',
});
```

### Switch to Mailgun

`config` must carry `username`, `key`, and `domain` -- the transport validates them eagerly, on construction.

```typescript
{
  provider: MailProviders.MAILGUN,
  from: 'noreply@example.com',
  config: { username: 'api', key: process.env.MAILGUN_API_KEY, domain: 'mg.example.com' },
}
```

### Queue verification emails

Get the queue executor instance, register a processor, then enqueue.

```typescript
const executor = this.application.get<IMailQueueExecutor>({
  key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE,
});

executor.setProcessor(async email => {
  await this.mailService.send({ to: email, subject: 'Verify', html: '...' });
  return { success: true, message: 'Sent', expiresInMinutes: 10 };
});

await executor.enqueueVerificationEmail('user@example.com');
```

### Generate a verification code and token

`MAIL_VERIFICATION_DATA_GENERATOR` composes a numeric code and a base64url token in one call.

```typescript
const data = this.verificationGenerator.generateVerificationData({
  codeLength: 6,
  tokenBytes: 32,
  codeExpiryMinutes: 10,
  tokenExpiryHours: 24,
});
```

## See also

- [Usage & Examples](./usage) -- sending, templates, queue executors, and verification generators
- [API Reference](./api) -- architecture, binding keys, interfaces, and internals
- [Error Reference](./errors) -- error codes and troubleshooting
- [Components Overview](/guides/core-concepts/components) -- component system basics
- [Queue Helper](/extensions/helpers/queue/) -- the in-memory/BullMQ primitives the queue executors are built on
- [Redis Helper](/extensions/helpers/redis/) -- `RedisSingleHelper`, required by the BullMQ queue executor

**Files:**

- [`packages/core-server/src/components/mail/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/mail/component.ts) -- `MailComponent`
- [`packages/core-server/src/components/mail/services/mail.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/mail/services/mail.service.ts) -- `MailService`
- [`packages/core-server/src/components/mail/services/template.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/mail/services/template.service.ts) -- `TemplateEngineService`
- [`packages/core-server/src/components/mail/services/generators/`](https://github.com/VENIZIA-AI/ignis/tree/main/packages/core-server/src/components/mail/services/generators) -- verification generators
- [`packages/core-server/src/components/mail/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/mail/common/keys.ts) -- `MailKeys`
- [`packages/core-server/src/components/mail/common/types/`](https://github.com/VENIZIA-AI/ignis/tree/main/packages/core-server/src/components/mail/common/types) -- `TMailOptions`, `IMailMessage`, and every mail interface
