# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `MailComponent` |
| **Runtimes** | Both |

| Component                           | Purpose                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| **MailComponent**                   | Main component registering mail services, transporters, and executors    |
| **MailService**                     | Core service for sending emails, batch emails, and template-based emails |
| **TemplateEngineService**           | Simple template engine with `{{variable}}` syntax                        |
| **NodemailerTransportHelper**       | Nodemailer-based email transport implementation                          |
| **MailgunTransportHelper**          | Mailgun API-based email transport implementation                         |
| **DirectMailExecutorHelper**        | Execute email sending immediately without queue                          |
| **InternalQueueMailExecutorHelper** | Queue emails using in-memory queue                                       |
| **BullMQMailExecutorHelper**        | Queue emails using BullMQ for distributed processing                     |

### Transport Providers

| Provider       | Value                      | When to Use                                      |
| -------------- | -------------------------- | ------------------------------------------------ |
| **Nodemailer** | `MailProviders.NODEMAILER` | SMTP-based email sending (Gmail, SendGrid, etc.) |
| **Mailgun**    | `MailProviders.MAILGUN`    | Mailgun API for transactional emails             |
| **Custom**     | `MailProviders.CUSTOM`     | Custom transport implementation                  |

### Queue Executor Types

| Type               | Value              | When to Use                                |
| ------------------ | ------------------ | ------------------------------------------ |
| **Direct**         | `'direct'`         | No queue, send immediately                 |
| **Internal Queue** | `'internal-queue'` | In-memory queue for simple use cases       |
| **BullMQ**         | `'bullmq'`         | Redis-backed queue for distributed systems |

::: details Import Paths
```typescript
import {
  MailComponent,
  MailKeys,
  MailProviders,
  MailService,
  TemplateEngineService,
} from '@venizia/ignis';

import type {
  TMailOptions,
  IMailService,
  IMailTemplateEngine,
  IMailMessage,
  IMailSendResult,
  IMailQueueExecutorConfig,
  IVerificationDataGenerator,
} from '@venizia/ignis';
```
:::
