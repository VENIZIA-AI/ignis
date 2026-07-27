---
title: Mail Component - Full Reference
description: Binding keys, configuration options, interfaces, and internal implementation of the Mail component
difficulty: intermediate
---

# Mail Component Reference

Every binding key, configuration variant, interface, and internal mechanism of `MailComponent`. For the task-oriented walkthrough, see [Usage & Examples](./usage).

**Files:**

- [`packages/core/src/components/mail/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/component.ts)
- [`packages/core/src/components/mail/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/common/types.ts)
- [`packages/core/src/components/mail/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/common/constants.ts)
- [`packages/core/src/components/mail/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/common/keys.ts)
- [`packages/core/src/components/mail/services/mail.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/services/mail.service.ts)
- [`packages/core/src/components/mail/services/template.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/services/template.service.ts)
- [`packages/core/src/components/mail/services/generator.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/services/generator.service.ts)
- [`packages/core/src/components/mail/providers/mail-transporter.provider.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/providers/mail-transporter.provider.ts)
- [`packages/core/src/components/mail/providers/mail-queue-executor.provider.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/providers/mail-queue-executor.provider.ts)
- [`packages/core/src/components/mail/helpers/transporters/nodemail-transporter.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/helpers/transporters/nodemail-transporter.helper.ts)
- [`packages/core/src/components/mail/helpers/transporters/mailgun-transporter.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/helpers/transporters/mailgun-transporter.helper.ts)
- [`packages/core/src/components/mail/helpers/executors/direct-executor.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/helpers/executors/direct-executor.helper.ts)
- [`packages/core/src/components/mail/helpers/executors/internal-queue-executor.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/helpers/executors/internal-queue-executor.helper.ts)
- [`packages/core/src/components/mail/helpers/executors/bull-mq-executor.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/helpers/executors/bull-mq-executor.helper.ts)
- [`packages/core/src/components/mail/utilities/type.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/utilities/type.utility.ts)
- [`packages/core/src/components/mail/utilities/verification.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/utilities/verification.utility.ts)

## Quick reference

| Item | Value |
|------|-------|
| Package | `@venizia/ignis` |
| Subpath | `@venizia/ignis/mail` |
| Component class | `MailComponent` |
| Runtimes | Both (Bun, Node.js) |

| Component | Purpose |
|-----------|---------|
| `MailComponent` | Registers mail services, transporters, generators, and the queue executor |
| `MailService` | `send()`, `sendBatch()`, `sendTemplate()`, `verify()` |
| `TemplateEngineService` | <code v-pre>{{variable}}</code> substitution engine, in-memory template registry |
| `NodemailerTransportHelper` | SMTP transport via `nodemailer` |
| `MailgunTransportHelper` | Mailgun HTTP API transport via `mailgun.js` |
| `DirectMailExecutorHelper` | Runs the processor immediately, no queue |
| `InternalQueueMailExecutorHelper` | In-memory queue (`SequentialQueueHelper`) |
| `BullMQMailExecutorHelper` | Redis-backed queue, distributed workers |
| `MailTransportProvider` | Factory: `TMailOptions` -> `IMailTransport` |
| `MailQueueExecutorProvider` | Factory: `IMailQueueExecutorConfig` -> `IMailQueueExecutor` |
| `NumericCodeGenerator` | Cryptographically random numeric codes |
| `RandomTokenGenerator` | Cryptographically random base64url tokens |
| `DefaultVerificationDataGenerator` | Composes both generators into an `IVerificationData` |

## Import paths

```typescript
import {
  MailComponent,
  MailKeys,
  MailProviders,
  MailErrorCodes,
  MailDefaults,
  MailExecutorErrors,
  MailQueueExecutorTypes,
  BullMQExecutorModes,
  MailService,
  TemplateEngineService,
  NumericCodeGenerator,
  RandomTokenGenerator,
  DefaultVerificationDataGenerator,
  MailTransportProvider,
  MailQueueExecutorProvider,
} from '@venizia/ignis/mail';

import type {
  TMailOptions,
  IBaseMailOptions,
  INodemailerMailOptions,
  IMailgunMailOptions,
  ICustomMailOptions,
  IGenericMailOptions,
  IMailService,
  IMailTemplateEngine,
  IMailMessage,
  IMailSendResult,
  IMailTransport,
  IMailAttachment,
  IMailQueueExecutor,
  IMailQueueExecutorConfig,
  IMailQueueOptions,
  IMailQueueResult,
  IMailProcessorResult,
  ITemplate,
  IVerificationCodeGenerator,
  IVerificationTokenGenerator,
  IVerificationDataGenerator,
  IVerificationData,
  IVerificationGenerationOptions,
  TMailProvider,
  TNodemailerConfig,
  TMailgunConfig,
} from '@venizia/ignis/mail';
```

## Architecture

```
  ┌─────────────────────────────────────────────────┐
  │               Your Application                   │
  │                                                   │
  │  preConfigure()                                   │
  │    ├── binds MailKeys.MAIL_OPTIONS  (required)   │
  │    ├── binds MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG │
  │    │     (optional -- defaults to `direct`)       │
  │    └── registers MailComponent                    │
  └───────────────────────┬─────────────────────────┘
                          │
                          ▼
  ┌─────────────────────────────────────────────────┐
  │               MailComponent.binding()             │
  │                                                   │
  │    ├── initGenerators()   (transient bindings)    │
  │    │     ├── NumericCodeGenerator                 │
  │    │     ├── RandomTokenGenerator                 │
  │    │     └── DefaultVerificationDataGenerator     │
  │    │                                               │
  │    ├── initProviders()    (singleton bindings)     │
  │    │     ├── MailTransportProvider                 │
  │    │     └── MailQueueExecutorProvider              │
  │    │                                               │
  │    ├── initServices()     (singleton bindings)     │
  │    │     ├── MailService                            │
  │    │     └── TemplateEngineService                  │
  │    │                                               │
  │    └── createAndBindInstances()                   │
  │          ├── Transport Instance  ◄── MAIL_OPTIONS  │
  │          └── Queue Executor      ◄── QUEUE_CONFIG  │
  │                                    (or the direct   │
  │                                     default)        │
  └─────────────────────────────────────────────────┘
```

`MailService` and the queue executor are **independent** consumers of the transport/config. `IMailQueueExecutor` never calls `MailService`. See [How it works](./#how-it-works) on the Overview for that distinction.

**Source:** [`component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/component.ts)

## Binding keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/components/mail/options` | `MailKeys.MAIL_OPTIONS` | `TMailOptions` | **Yes** | -- |
| `@app/components/mail/queue/executor-config` | `MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG` | `IMailQueueExecutorConfig` | No | `{ type: MailQueueExecutorTypes.DIRECT }` |
| `@app/components/mail/service` | `MailKeys.MAIL_SERVICE` | `IMailService` | No | `MailService` (singleton) |
| `@app/components/mail/services/template-engine` | `MailKeys.MAIL_TEMPLATE_ENGINE` | `IMailTemplateEngine` | No | `TemplateEngineService` (singleton) |
| `@app/components/mail/transport-provider` | `MailKeys.MAIL_TRANSPORT_PROVIDER` | `TGetMailTransportFn` | No | `MailTransportProvider` (singleton) |
| `@app/components/mail/transport-instance` | `MailKeys.MAIL_TRANSPORT_INSTANCE` | `IMailTransport` | No | Created by the component |
| `@app/components/mail/queue-executor-provider` | `MailKeys.MAIL_QUEUE_EXECUTOR_PROVIDER` | `TGetMailQueueExecutorFn` | No | `MailQueueExecutorProvider` (singleton) |
| `@app/components/mail/queue-executor-instance` | `MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE` | `IMailQueueExecutor` | No | Created by the component |
| `@app/components/mail/verification/code-generator` | `MailKeys.MAIL_VERIFICATION_CODE_GENERATOR` | `IVerificationCodeGenerator` | No | `NumericCodeGenerator` (transient) |
| `@app/components/mail/verification/token-generator` | `MailKeys.MAIL_VERIFICATION_TOKEN_GENERATOR` | `IVerificationTokenGenerator` | No | `RandomTokenGenerator` (transient) |
| `@app/components/mail/verification/data-generator` | `MailKeys.MAIL_VERIFICATION_DATA_GENERATOR` | `IVerificationDataGenerator` | No | `DefaultVerificationDataGenerator` (transient) |

> [!IMPORTANT]
> `MailKeys.MAIL_OPTIONS` is the only binding `MailComponent` requires. It throws `Mail options not configured` in `binding()` if the key is not bound. `MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG` is read with `isOptional: true` -- when it is not bound, `createAndBindInstances()` falls back to `{ type: MailQueueExecutorTypes.DIRECT }` rather than failing startup.

**Source:** [`common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/common/keys.ts)

## Configuration

### Transport options (`TMailOptions`)

A discriminated union on `provider`, extending `IBaseMailOptions`:

```typescript
interface IBaseMailOptions {
  from?: string;
  fromName?: string;
}

interface INodemailerMailOptions extends IBaseMailOptions {
  provider: 'nodemailer';
  config: TNodemailerConfig; // SMTPTransport | SMTPTransport.Options | string
  module?: TNodemailerModule; // the peer itself; see "Peer dependency loading"
}

interface IMailgunMailOptions extends IBaseMailOptions {
  provider: 'mailgun';
  config: TMailgunConfig; // AnyType & { domain: string } -- also requires username, key at runtime
  module?: TMailgunModule; // the peer itself; see "Peer dependency loading"
}

interface ICustomMailOptions extends IBaseMailOptions {
  provider: 'custom';
  config: IMailTransport; // Must implement send() and verify()
}

interface IGenericMailOptions extends IBaseMailOptions {
  provider: string;
  config: Record<string, AnyType>;
}

type TMailOptions =
  | INodemailerMailOptions
  | IMailgunMailOptions
  | ICustomMailOptions
  | IGenericMailOptions;
```

**Nodemailer (SMTP with basic auth):**

```typescript
{
  provider: MailProviders.NODEMAILER,
  from: 'noreply@example.com',
  fromName: 'Example App',
  config: {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: 'your-email@gmail.com', pass: 'your-app-password' },
  },
}
```

**Nodemailer (OAuth2):**

```typescript
{
  provider: MailProviders.NODEMAILER,
  from: applicationEnvironment.get<string>('APP_ENV_MAIL_FROM') ?? 'noreply@example.com',
  fromName: applicationEnvironment.get<string>('APP_ENV_MAIL_FROM_NAME') ?? 'Example App',
  config: {
    host: applicationEnvironment.get<string>('APP_ENV_MAIL_HOST') ?? 'smtp.gmail.com',
    port: +(applicationEnvironment.get<number>('APP_ENV_MAIL_PORT') ?? 465),
    secure: toBoolean(applicationEnvironment.get<boolean>('APP_ENV_MAIL_SECURE') ?? true),
    auth: {
      type: 'oauth2',
      user: applicationEnvironment.get<string>('APP_ENV_MAIL_USER'),
      clientId: applicationEnvironment.get<string>('APP_ENV_MAIL_CLIENT_ID'),
      clientSecret: applicationEnvironment.get<string>('APP_ENV_MAIL_CLIENT_SECRET'),
      refreshToken: applicationEnvironment.get<string>('APP_ENV_MAIL_REFRESH_TOKEN'),
    },
  },
}
```

`APP_ENV_MAIL_*` is an app-level convention, not a framework-defined env var. `applicationEnvironment.get()` reads whatever variables your wrapper component chooses to look up. A matching `.env`:

```
APP_ENV_MAIL_HOST=smtp.gmail.com
APP_ENV_MAIL_PORT=465
APP_ENV_MAIL_SECURE=true
APP_ENV_MAIL_USER=your-email@gmail.com
APP_ENV_MAIL_CLIENT_ID=your-oauth2-client-id
APP_ENV_MAIL_CLIENT_SECRET=your-oauth2-client-secret
APP_ENV_MAIL_REFRESH_TOKEN=your-oauth2-refresh-token
```

> [!TIP]
> For Gmail OAuth2, follow [Google's OAuth2 setup guide](https://developers.google.com/gmail/api/auth/web-server) to obtain the client ID, secret, and refresh token.

**Mailgun:**

```typescript
{
  provider: MailProviders.MAILGUN,
  from: 'noreply@example.com',
  fromName: 'Example App',
  config: {
    username: 'api',                        // required -- mailgun.js client username
    key: process.env.MAILGUN_API_KEY,        // required -- Mailgun API key
    domain: 'mg.example.com',                // required
    host: 'api.eu.mailgun.net',              // optional -- EU region
  },
}
```

> [!IMPORTANT]
> `MailgunTransportHelper` validates `username`, `key`, and `domain` on construction. It throws `Invalid Mailgun configuration | Missing required keys: <keys>` if any is missing. This check runs even though `TMailgunConfig`'s only *typed* requirement is `domain` - `username` and `key` are checked at runtime, not by the type.

**Custom transport:**

```typescript
{
  provider: MailProviders.CUSTOM,
  from: 'noreply@example.com',
  config: myTransportImplementingIMailTransport, // must have send() and verify()
}
```

**Generic provider (extensibility escape hatch):**

```typescript
{
  provider: 'sendgrid',
  from: 'noreply@example.com',
  config: { apiKey: process.env.SENDGRID_API_KEY },
}
```

> [!WARNING]
> `IGenericMailOptions` falls through to the `default` case in `MailTransportProvider` and throws `Unsupported mail provider: <provider>`. The framework's built-in provider does not handle it. `IGenericMailOptions` exists only so you can bind a **custom** `MailTransportProvider` that recognizes the provider string.

### Queue executor options (`IMailQueueExecutorConfig`)

```typescript
interface IMailQueueExecutorConfig {
  type: TConstValue<typeof MailQueueExecutorTypes>; // 'direct' | 'internal-queue' | 'bullmq'
  internalQueue?: {
    identifier: string;
  };
  bullmq?: {
    redis: IRedisSingleHelperOptions;
    queue: { identifier: string; name: string };
    mode: TConstValue<typeof BullMQExecutorModes>; // REQUIRED -- no default
  };
}
```

```typescript
// Direct (also the implicit default when MAIL_QUEUE_EXECUTOR_CONFIG is unbound)
{ type: 'direct' }

// Internal queue (in-memory)
{ type: 'internal-queue', internalQueue: { identifier: 'mail-internal-queue' } }

// BullMQ (Redis-backed)
{
  type: 'bullmq',
  bullmq: {
    redis: { host: 'localhost', port: 6379, password: 'your-redis-password' },
    queue: { identifier: 'mail-queue', name: 'mail-queue' },
    mode: 'both', // 'queue-only' | 'worker-only' | 'both' -- required, no default
  },
}
```

**Choosing an executor:**

| Executor | Use when | Why |
|---|---|---|
| `direct` | Development or low-volume apps | No queueing overhead |
| `internal-queue` | Single-instance apps, moderate volume | In-memory, with retry |
| `bullmq` | Distributed or high-volume systems | Redis-backed, configurable concurrency/priority/backoff |

**Source:** [`common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/common/types.ts)

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MailDefaults.BATCH_CONCURRENCY` | `5` | Default concurrent sends in `sendBatch()` |
| `MailDefaults.FALLBACK_FROM` | `'noreply@example.com'` | Used by `getDefaultFrom()` when `options.from` is unset |
| `MailExecutorErrors.PROCESSOR_NOT_SET` | `'Processor not set. Call setProcessor() first.'` | Thrown by all three queue executors |
| `MailQueueExecutorTypes.DIRECT` | `'direct'` | Immediate execution |
| `MailQueueExecutorTypes.INTERNAL_QUEUE` | `'internal-queue'` | In-memory queue |
| `MailQueueExecutorTypes.BULLMQ` | `'bullmq'` | Redis-backed queue |
| `BullMQExecutorModes.QUEUE_ONLY` | `'queue-only'` | Producer only (enqueue) |
| `BullMQExecutorModes.WORKER_ONLY` | `'worker-only'` | Consumer only (process) |
| `BullMQExecutorModes.BOTH` | `'both'` | Full duplex (produce + consume) |

`MailQueueExecutorTypes` and `BullMQExecutorModes` both carry a `SCHEME_SET`/`MODE_SET` and a static `isValid()`:

```typescript
MailQueueExecutorTypes.isValid('bullmq');  // true
MailQueueExecutorTypes.isValid('unknown'); // false
BullMQExecutorModes.isValid('both');       // true
BullMQExecutorModes.isValid('invalid');    // false
```

#### `MailErrorCodes`

Built through `MessageCode.build()`, so every value is lower-case (`ApplicationError` lower-cases whatever it is handed):

| Constant | Value | Description |
|----------|-------|-------------|
| `MailErrorCodes.INVALID_CONFIGURATION` | `'core.mail.invalid_configuration'` | Invalid or missing configuration (transport, template engine, subject, body) |
| `MailErrorCodes.SEND_FAILED` | `'core.mail.send_failed'` | Single email send failed |
| `MailErrorCodes.VERIFICATION_FAILED` | `'core.mail.verification_failed'` | Transport connection verification failed |
| `MailErrorCodes.INVALID_RECIPIENT` | `'core.mail.invalid_recipient'` | Missing or empty recipient address |
| `MailErrorCodes.BATCH_SEND_FAILED` | `'core.mail.batch_send_failed'` | Batch email operation failed |
| `MailErrorCodes.TEMPLATE_NOT_FOUND` | `'core.mail.template_not_found'` | Template name not found in registry |

**Source:** [`common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/common/constants.ts)

## `IMailService` interface

```typescript
interface IMailService {
  send(message: IMailMessage): Promise<IMailSendResult>;

  sendBatch(
    messages: IMailMessage[],
    options?: { concurrency?: number },
  ): Promise<IMailSendResult[]>;

  sendTemplate(opts: {
    templateName: string;
    data: Record<string, any>;
    recipients: string | string[];
    options?: Partial<IMailMessage>;
  }): Promise<IMailSendResult>;

  verify(): Promise<boolean>;
}
```

**`send(message)`**

1. `validateMessage()` throws for missing `to`, missing `subject`, or missing both `text`/`html` (400, see below).
2. Merges `message.from` with `getDefaultFrom()` if unset.
3. Delegates to `transport.send()`.
4. Returns `{ success, messageId, error? }`.
5. If the transport throws, and the error is **not** already an `ApplicationError`, it is caught and re-thrown as `MailErrorCodes.SEND_FAILED` (500).
6. An `ApplicationError` thrown earlier in the same `try` block - for example, from `validateMessage()` - is re-thrown as-is, unchanged.

**`sendBatch(messages, options?)`**

Sends every message via `send()` with concurrency bounded by `executePromiseWithLimit()`, default `MailDefaults.BATCH_CONCURRENCY` (`5`). A `send()` that throws is caught per-message and downgraded to `{ success: false, error }`; a failure in the batch operation itself throws `MailErrorCodes.BATCH_SEND_FAILED`.

**`sendTemplate(opts)`**

Renders a registered template and sends it. Subject resolution order: `options.subject` -> the template's own `subject` (rendered through the same engine) -> `'No Subject'`. Throws `MailErrorCodes.INVALID_CONFIGURATION` ("Template engine not configured") if `templateEngine` was not injected. Re-throws any other error unchanged, including `TEMPLATE_NOT_FOUND` from the template engine.

**`verify()`**

Delegates to `transport.verify()`. If the transport throws, wraps it as `MailErrorCodes.VERIFICATION_FAILED` (500).

### Protected methods (`MailService`)

**`validateMessage(message)`**

| Check | Error code | Status | Message |
|-------|-----------|--------|---------|
| `to` is falsy or an empty array | `INVALID_RECIPIENT` | 400 | `Recipient email address is required` |
| `subject` is falsy | `INVALID_CONFIGURATION` | 400 | `Email subject is required` |
| Both `text` and `html` are falsy | `INVALID_CONFIGURATION` | 400 | `Email must have either text or html content` |

**`getDefaultFrom()`**

- If `options.from` is unset, returns `MailDefaults.FALLBACK_FROM` (`'noreply@example.com'`).
- Else if `options.fromName` is unset, returns `options.from` as-is.
- Else returns `"${fromName}" <${from}>`.

**Source:** [`services/mail.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/services/mail.service.ts)

## `IMailMessage` interface

```typescript
interface IMailMessage {
  from?: string;                  // Uses getDefaultFrom() if not provided
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: IMailAttachment[];
  headers?: Record<string, string>;
  requireValidate?: boolean;      // Passed through to sendTemplate()'s render() call
  [key: string]: any;             // Open-ended -- provider-specific fields pass through
}
```

| Field | Notes |
|-------|-------|
| `from` | Falls back to `getDefaultFrom()`. Can be overridden per message (multi-tenant scenarios). |
| `to`, `cc`, `bcc` | Single string or array. Nodemailer joins arrays with `', '`; Mailgun passes `to` as-is (always coerced to an array), `cc`/`bcc` pass through unmodified. |
| `replyTo` | Nodemailer passes it directly; Mailgun maps it to `h:Reply-To`. |
| `subject` | Rendered through the template engine when set via `sendTemplate()`. |
| `text`, `html` | At least one is required (`validateMessage()`). |
| `attachments` | See `IMailAttachment` below. |
| `headers` | Nodemailer passes them directly; Mailgun prefixes every key with `h:`. |
| `requireValidate` | `true` makes template rendering throw on missing placeholders instead of preserving them as literal text. Defaults to `false`. |

```typescript
interface IMailAttachment {
  filename?: string;
  contentType?: string;
  path?: string;
  content?: string | Buffer | Readable;
  cid?: string;
  [key: string]: any;
}
```

- File path: `{ filename: 'doc.pdf', path: '/path/to/doc.pdf' }`
- Buffer: `{ filename: 'data.txt', content: Buffer.from('...') }`
- Inline image: `{ filename: 'logo.png', path: '...', cid: 'logo' }`
- Mailgun maps each attachment to `{ filename, data: att.path ?? att.content ?? Buffer.from('') }`.

**Source:** [`common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/common/types.ts)

## `IMailTemplateEngine` interface

```typescript
interface IMailTemplateEngine {
  render(opts: {
    templateData?: string;
    templateName?: string;
    data: Record<string, any>;
    requireValidate?: boolean;
  }): string;

  registerTemplate(opts: { name: string; content: string }): void;

  validateTemplateData(opts: { template: string; data: Record<string, any> }): {
    isValid: boolean;
    missingKeys: string[];
    allKeys: string[];
  };

  getTemplate(name: string): ITemplate | undefined;
  listTemplates(): ITemplate[];
  hasTemplate(name: string): boolean;
  removeTemplate(name: string): boolean;
}
```

`TemplateEngineService` also exposes `clearTemplates(): void`. It resets the registry, but it is **not** part of the `IMailTemplateEngine` interface - you can only reach it when you hold the concrete class, not the interface type.

| Method | Behavior |
|--------|----------|
| `render(opts)` | Renders by `templateName` (registry lookup) or raw `templateData`. Throws if neither is given. Throws `TEMPLATE_NOT_FOUND` (404) if `templateName` is not registered. Delegates to `renderSimpleTemplate()`. |
| `registerTemplate(opts)` | `options` (on the class) accepts `subject`/`description` (`Partial<ITemplate>`). Overwrites an existing template with the same name. |
| `validateTemplateData(opts)` | Extracts every unique <code v-pre>{{key}}</code> via `/\{\{(\s*[\w.]+\s*)\}\}/g`, deduplicates, resolves nested dot-notation values. Returns `isValid`, `missingKeys`, `allKeys`. |
| `getTemplate(name)` | Returns `undefined` if not registered. |
| `listTemplates()` | All templates, as an array of `ITemplate`. |
| `hasTemplate(name)` | Registry membership check. |
| `removeTemplate(name)` | Logs the removal, returns `true`/`false`. |

```typescript
interface ITemplate {
  name: string;
  content?: string;
  render?: (data: Record<string, AnyType>) => string;
  subject?: string;
  description?: string;
}
```

The `render` field supports a custom per-template render function, though the built-in `TemplateEngineService` always uses `content` + `renderSimpleTemplate()` instead.

**Source:** [`services/template.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/services/template.service.ts)

## Transport layer

`MailTransportProvider.value()` returns a factory function that switches on `TMailOptions.provider`:

| Provider | Result |
|----------|--------|
| `'nodemailer'` | `NodemailerTransportHelper`, backed by `nodemailer` |
| `'mailgun'` | `MailgunTransportHelper`, backed by the Mailgun HTTP API (`mailgun.js`) |
| `'custom'` | The `config` value itself, validated to implement `IMailTransport` |
| Any other string | Throws `Unsupported mail provider: <provider>` (`INVALID_CONFIGURATION`, 500) |

Type narrowing uses three private guards, each checking `provider === X && 'config' in options`:

```typescript
private isNodemailerOptions(options: TMailOptions): options is INodemailerMailOptions
private isMailgunOptions(options: TMailOptions): options is IMailgunMailOptions
private isCustomOptions(options: TMailOptions): options is ICustomMailOptions
```

For `custom`, an additional `isMailTransport()` utility check reports specifically which of `send`/`verify` is missing.

```typescript
interface IMailTransport {
  send(message: IMailMessage): Promise<IMailSendResult>;
  verify(): Promise<boolean>;
  close?(): Promise<void>;
}
```

### Peer dependency loading

Pass the peer yourself through `module`, or let the transport find it. With `module` set, the transport uses it as-is; without it, the transport falls back to `ModuleUtility.loadSync({ module })` from the client-factory seam `configure()` calls. A missing package then throws the framework's install hint - `[ModuleUtility.loadSync] nodemailer is required. Please install 'nodemailer'` - not Node's raw `Cannot find module`.

That fallback keeps the specifier invisible to `Bun.build`. Importing `@venizia/ignis/mail` for the Nodemailer transport no longer drags `mailgun.js` into your bundle, and the reverse holds too.

**A compiled application must pass `module`.** A `bun build --compile` binary ships without `node_modules`, so the runtime lookup has nothing to resolve against and the component throws that install hint at boot - with the peer sitting in `package.json`, which is no help because nothing put it inside the binary. The static import is what embeds it:

```typescript
import * as nodemailer from 'nodemailer';

this.bind({ key: MailKeys.MAIL_OPTIONS }).toValue({
  provider: MailProviders.NODEMAILER,
  config: { host, port, secure, auth },
  module: nodemailer,
});
```

`module` is typed as the shape the transport calls (`createTransport` for Nodemailer, a constructor for Mailgun), so handing over the wrong thing is a compile error rather than a boot crash. Prefer it over [`ModuleUtility.register`](/references/utilities/module#compiled-binaries): the dependency arrives where it is used and cannot be defeated by binding order. `register` remains the answer for peers the framework reaches with no options seam in between.

**Nodemailer (`NodemailerTransportHelper`, extends `BaseHelper`):**

- `configure()` builds the transporter via `nodemailer.createTransport(config)`.
- `send()` maps `IMailMessage` fields to Nodemailer's mail options, joining array recipients with `', '`. It catches transport errors and returns `{ success: false, error }` - it never throws.
- `verify()` delegates to `transporter.verify()` (SMTP handshake). It catches errors and returns `false` - it never throws.
- `close()` calls `transporter.close()`.

**Mailgun (`MailgunTransportHelper`, extends `BaseHelper`):**

- `configure()` calls `validateConfig()` **before** building the client. `username`, `key`, and `domain` must all be present in `config`, or it throws `Invalid Mailgun configuration | Missing required keys: <keys>` (`INVALID_CONFIGURATION`, 500). This check runs even though `TMailgunConfig`'s type only requires `domain`.
- `send()` converts `IMailMessage` to Mailgun's format: `to` is coerced to an array, `replyTo` becomes `h:Reply-To`, and every custom header is prefixed `h:`. Attachments map to `{ filename, data: path ?? content ?? Buffer.from('') }`.
  - It catches send errors and returns `{ success: false, error }` - it never throws.
- `verify()` sends a test message to `verify@<domain>` with `o:testmode: 'yes'`, since Mailgun has no dedicated verify endpoint. It catches errors and returns `false` - it never throws.
- No `close()` - the HTTP API is stateless.

**Custom transport:** set `provider: MailProviders.CUSTOM` and pass an object implementing `IMailTransport` as `config`. Useful for SendGrid, AWS SES, or a custom SMTP relay that the framework does not ship a helper for.

**Source:** [`helpers/transporters/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/helpers/transporters)

## Queue executor implementations

All three implement:

```typescript
interface IMailQueueExecutor {
  enqueueVerificationEmail(email: string, options?: IMailQueueOptions): Promise<IMailQueueResult>;
  setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void;
}
```

**`DirectMailExecutorHelper`** extends `BaseHelper`. It calls the processor immediately, with no queue, and returns `{ queued: false, message: 'Email sent immediately (no queue)', result }`. If `enqueueVerificationEmail()` runs before `setProcessor()`, it throws `MailExecutorErrors.PROCESSOR_NOT_SET`.

**`InternalQueueMailExecutorHelper`** extends `BaseHelper` (constructor takes `IInternalQueueMailExecutorOpts`). It wraps `SequentialQueueHelper<IQueueJobPayload>` from `@venizia/ignis-helpers`, with `autoDispatch: true`.

- Job IDs: `job_<counter>_<timestamp>`.
- `options.delay > 0` schedules the enqueue itself via `setTimeout`, tracked in an internal `delayedJobs: Map<string, NodeJS.Timeout>`.
- Retry: on a thrown error, or `{ success: false }` from the processor, it retries up to `options.attempts ?? 3` times using `calculateBackoff()`:

  | `backoff` config | Delay |
  |---|---|
  | Not set | `1000ms` fixed |
  | `type: 'fixed'` | the raw `delay` |
  | `type: 'exponential'` | `delay * 2 ** (attempt - 1)` |

- `close()` clears every pending delayed/retry `setTimeout`. Without that cleanup, a live timer keeps the event loop open past shutdown.
- No persistence across restarts.

**`BullMQMailExecutorHelper`** extends `BaseHelper` (constructor takes `IBullMQMailExecutorOpts`). It wraps `BullMQHelper` (`@venizia/ignis-helpers/bullmq`) and a `RedisSingleHelper` connection.

| Mode | Queue created | Workers created | Can enqueue | Can process |
|------|----------------|------------------|-------------|-------------|
| `'queue-only'` | Yes | No (`setProcessor()` skips worker creation, logs a warning) | Yes - processor not required | No |
| `'worker-only'` | No | Yes | No (throws) | Yes |
| `'both'` | Yes | Yes | Yes - processor required | Yes |

`setProcessor(processor, opts?)` is `async`. It clears all existing workers, then creates `opts?.numberOfWorkers ?? 1` workers, each with `concurrencyPerWorker ?? 5` and `lockDuration ?? 30000`ms. In `queue-only` mode it stores the processor and returns without creating any worker.

`enqueueVerificationEmail()` throws in three cases:

| Condition | Throws |
|---|---|
| Mode is `worker-only` | `Cannot enqueue jobs in worker-only mode...` |
| Queue was never created (should not happen in a queue-enabled mode) | `Queue helper not initialized...` |
| No processor set, and `mode !== 'queue-only'` | `PROCESSOR_NOT_SET` |

Its enqueue options: `attempts: options?.attempts ?? 3`, `backoff: { type: options?.backoff?.type ?? 'exponential', delay: options?.backoff?.delay ?? 1000 }`, `removeOnComplete: true`, `removeOnFail: false`.

**Dynamic workers** - manage the worker pool without a restart:

| Method | Behavior |
|---|---|
| `addWorker(opts)` | Requires a processor set first. Takes a unique identifier, default concurrency `5`, default lock duration `30000`ms |
| `removeWorker(index)` | Closes the worker, then splices it out. Returns `false` if `index` is out of range |
| `clearWorkers()` | Closes and empties every worker. Called internally by `setProcessor()` |
| `getWorkerCount()` | Returns the current worker count |
| `getMode()` | Returns the executor's `BullMQExecutorModes` value |

`close()` tears down workers, then the queue, then the Redis connection. Every step runs even if an earlier one failed, and every failure is collected into one thrown error at the end.

```typescript
interface IBullMQMailExecutorOpts {
  redis: IRedisSingleHelperOptions; // from @venizia/ignis-helpers
  queue: { identifier: string; name: string };
  mode: TConstValue<typeof BullMQExecutorModes>; // REQUIRED, no default
}
```

**Source:** [`helpers/executors/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/helpers/executors)

## Additional interfaces

```typescript
interface IMailSendResult {
  success: boolean;
  messageId?: string;
  response?: any;
  error?: string;
}

interface IMailQueueOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: { type: 'fixed' | 'exponential'; delay: number };
}

interface IMailQueueResult {
  jobId?: string;
  queued: boolean;   // false for direct execution, true for internal-queue and bullmq
  message: string;
  result?: IMailProcessorResult; // populated only for direct execution (synchronous processor)
}

interface IMailProcessorResult {
  success: boolean;
  message: string;
  expiresInMinutes: number;
  nextResendAt?: string;
}

interface IVerificationData {
  verificationCode: string;
  codeGeneratedAt: string;
  codeExpiresAt: string;
  codeAttempts: number;
  verificationToken: string;
  tokenGeneratedAt: string;
  tokenExpiresAt: string;
  lastCodeSentAt: string;
}

interface IVerificationGenerationOptions {
  codeLength: number;       // all four fields required, no defaults
  tokenBytes: number;
  codeExpiryMinutes: number;
  tokenExpiryHours: number;
}

interface IQueueJobPayload {
  id: string;
  email: string;
  options?: IMailQueueOptions;
  attempts: number;
  scheduledAt: number;
}

interface IInternalQueueMailExecutorOpts {
  identifier: string;
}
```

**Source:** [`common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/common/types.ts)

## Utility functions

```typescript
// type.utility.ts
function isMailTransport(value: AnyType): value is IMailTransport;
function isValidMailOptions(options: AnyType): options is TMailOptions;

// verification.utility.ts
function getExpiryTime(minutes: number): Date;         // Date `minutes` minutes from now
function getExpiryTimeInHours(hours: number): Date;     // Date `hours` hours from now
```

- `isMailTransport()` checks that `send` and `verify` are functions, and that `close` is either a function or `undefined`.
- `isValidMailOptions()` checks that `provider` is a string and `config` is truthy. It does not validate the shape of `config` against the specific provider.

**Source:** [`utilities/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/mail/utilities)

## See also

- [Overview](./) -- quick start, imports, common configuration tasks
- [Usage & Examples](./usage) -- sending emails, templates, queue executors, verification generators
- [Error Reference](./errors) -- error codes and troubleshooting
- [Queue Helper](/extensions/helpers/queue/) -- `SequentialQueueHelper` and `BullMQHelper`
- [Redis Helper](/extensions/helpers/redis/) -- `RedisSingleHelper`, `IRedisSingleHelperOptions`
