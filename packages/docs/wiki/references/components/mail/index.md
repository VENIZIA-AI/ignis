# Mail -- Setup & Configuration

> Flexible email sending system with support for multiple transports (Nodemailer, Mailgun, custom), template-based rendering with mustache-style variable syntax, and queue-based processing via Direct, Internal Queue, or BullMQ executors.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `MailComponent` |
| **Runtimes** | Both |

### Key Components

| Component | Purpose |
| --------- | ------- |
| **MailComponent** | Main component registering mail services, transporters, and executors |
| **MailService** | Core service for sending emails, batch emails, and template-based emails |
| **TemplateEngineService** | Simple template engine with <code v-pre>{{variable}}</code> syntax |
| **NodemailerTransportHelper** | Nodemailer-based email transport implementation |
| **MailgunTransportHelper** | Mailgun API-based email transport implementation |
| **DirectMailExecutorHelper** | Execute email sending immediately without queue |
| **InternalQueueMailExecutorHelper** | Queue emails using in-memory queue |
| **BullMQMailExecutorHelper** | Queue emails using BullMQ for distributed processing |
| **MailTransportProvider** | Factory provider that creates transport instances based on configuration |
| **MailQueueExecutorProvider** | Factory provider that creates queue executor instances based on configuration |
| **NumericCodeGenerator** | Generates cryptographically random numeric verification codes |
| **RandomTokenGenerator** | Generates cryptographically random base64url tokens |
| **DefaultVerificationDataGenerator** | Composes code + token generators into full verification data objects |

### Transport Providers

| Provider | Value | When to Use |
| -------- | ----- | ----------- |
| **Nodemailer** | `MailProviders.NODEMAILER` | SMTP-based email sending (Gmail, SendGrid, etc.) |
| **Mailgun** | `MailProviders.MAILGUN` | Mailgun API for transactional emails |
| **Custom** | `MailProviders.CUSTOM` | Custom transport implementation |

### Queue Executor Types

| Type | Value | When to Use |
| ---- | ----- | ----------- |
| **Direct** | `'direct'` | No queue, send immediately |
| **Internal Queue** | `'internal-queue'` | In-memory queue for simple use cases |
| **BullMQ** | `'bullmq'` | Redis-backed queue for distributed systems |

#### Import Paths
```typescript
import {
  MailComponent,
  MailKeys,
  MailProviders,
  MailErrorCodes,
  MailDefaults,
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

## Setup

The recommended approach is to create a wrapper component that binds the mail options and queue executor config, then registers `MailComponent` internally.

### Step 1: Bind Configuration

```typescript
// src/components/mail/component.ts
import {
  BaseApplication,
  BaseComponent,
  Binding,
  CoreBindings,
  inject,
  applicationEnvironment,
  toBoolean,
} from '@venizia/ignis';
import { MailComponent, MailKeys, MailProviders } from '@venizia/ignis/mail';

export class NodemailerComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    protected application: BaseApplication,
  ) {
    super({
      scope: NodemailerComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        // Configure mail transport options
        [MailKeys.MAIL_OPTIONS]: Binding.bind({
          key: MailKeys.MAIL_OPTIONS,
        }).toValue({
          provider: MailProviders.NODEMAILER,
          from: 'noreply@example.com',
          fromName: 'Example App',
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
        }),
        // Configure queue executor
        [MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG]: Binding.bind({
          key: MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG,
        }).toValue({
          type: 'internal-queue',
          internalQueue: {
            identifier: 'mail-internal-queue',
          },
        }),
      },
    });
  }

  override async binding(): Promise<void> {
    this.logger.info('[binding] Binding mail component...');

    // Register the core MailComponent
    this.application.component(MailComponent);

    this.logger.info('[binding] Mail component initialized successfully');
  }
}
```

### Step 2: Register Component

```typescript
// src/application.ts
import { BaseApplication, ValueOrPromise } from '@venizia/ignis';
import { NodemailerComponent } from './components/mail/component';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // Register the mail component
    this.component(NodemailerComponent);

    // ... other components
  }
}
```

## Configuration

### Transport Options

The `TMailOptions` configuration determines which email transport provider is used and how it's configured. It is a discriminated union of four variants.

**Nodemailer SMTP example:**

```typescript
{
  provider: MailProviders.NODEMAILER,
  from: 'noreply@example.com',
  fromName: 'Example App',
  config: {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: 'your-email@gmail.com',
      pass: 'your-app-password',
    },
  },
}
```

**Simple SMTP Authentication (e.g., Gmail with app password):**

```typescript
// Simple SMTP Authentication (e.g., Gmail with app password)
this.bind<TMailOptions>({ key: MailBindingKeys.MAIL_OPTIONS }).toValue({
  provider: 'nodemailer',
  from: 'noreply@example.com',
  fromName: 'My App',
  config: {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.APP_ENV_MAIL_USER,
      pass: process.env.APP_ENV_MAIL_PASS,
    },
  },
});
```

**Mailgun example:**

```typescript
{
  provider: MailProviders.MAILGUN,
  from: 'noreply@example.com',
  fromName: 'Example App',
  config: {
    apiKey: process.env.MAILGUN_API_KEY,
    domain: 'mg.example.com',
    host: 'api.eu.mailgun.net', // Optional: EU region
  },
}
```

**Generic provider example:**

The `IGenericMailOptions` variant allows any arbitrary provider string with a `Record<string, AnyType>` config. This is the catch-all for providers not covered by the named variants:

```typescript
{
  provider: 'sendgrid',
  from: 'noreply@example.com',
  config: {
    apiKey: process.env.SENDGRID_API_KEY,
    // Any key-value pairs accepted
  },
}
```

> [!WARNING]
> The `IGenericMailOptions` variant will fall through to the `default` case in `MailTransportProvider` and throw `Unsupported mail provider: <provider>` unless the transport provider is replaced with a custom one that handles the provider string. This variant exists for extensibility -- you must bind a custom `MailTransportProvider` that knows how to handle your provider string.

**OAuth2 with environment variables:**

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

**Example `.env` file for Nodemailer with OAuth2:**

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
> For Gmail OAuth2, follow [Google's OAuth2 setup guide](https://developers.google.com/gmail/api/auth/web-server) to obtain client ID, secret, and refresh token.

### Queue Executor Options

The `IMailQueueExecutorConfig` configuration determines how emails are queued and processed.

**Direct execution (no queue):**

```typescript
{
  type: 'direct',
}
```

**Internal queue (in-memory):**

```typescript
{
  type: 'internal-queue',
  internalQueue: {
    identifier: 'mail-internal-queue',
  },
}
```

**BullMQ (Redis-backed):**

```typescript
{
  type: 'bullmq',
  bullmq: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: 'your-redis-password',
    },
    queue: {
      identifier: 'mail-queue',
      name: 'mail-queue',
    },
    mode: 'both', // 'queue-only', 'worker-only', or 'both'
  },
}
```

> [!NOTE]
> - **`'queue-only'`** -- Only enqueues jobs, does not process them (useful for web servers that offload to workers)
> - **`'worker-only'`** -- Only processes jobs, does not enqueue (useful for dedicated worker processes)
> - **`'both'`** -- Both enqueues and processes jobs (simplest setup for single-instance apps)

> [!NOTE]
> Choose the right queue executor for your environment:
> - **`direct`** -- Development or low-volume applications. No queueing overhead.
> - **`internal-queue`** -- Single-instance applications with moderate volume. In-memory queue with retry support.
> - **`bullmq`** -- Distributed systems or high-volume applications. Redis-backed with configurable concurrency, priority, and backoff.

#### BullMQ Dynamic Worker Management

The `BullMQMailExecutorHelper` supports dynamic worker scaling at runtime. Workers can be added and removed without restarting the application:

```typescript
const executor = this.application.get<BullMQMailExecutorHelper>({
  key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE,
});

// Add a new worker with custom concurrency
executor.addWorker({
  workerIdentifier: 'mail-queue-worker-extra',
  concurrency: 10,
  lockDuration: 60000, // 60 seconds
});

// Check current worker count
const count = executor.getWorkerCount(); // e.g. 2

// Check current mode
const mode = executor.getMode(); // e.g. 'both'

// Remove a specific worker by index
await executor.removeWorker(1);

// Remove all workers
await executor.clearWorkers();
```

The `setProcessor()` method on BullMQ also accepts an optional second argument for worker configuration:

```typescript
await executor.setProcessor(
  async (email: string) => {
    // your processing logic
    return { success: true, message: 'Sent', expiresInMinutes: 10 };
  },
  {
    numberOfWorkers: 3,       // Spawn 3 workers (default: 1)
    concurrencyPerWorker: 10, // Each worker handles 10 concurrent jobs (default: 5)
    lockDuration: 60000,      // Job lock duration in ms (default: 30000)
  },
);
```

#### Full Transport Options Interface

The `TMailOptions` union type has four variants. All extend `IBaseMailOptions`:

```typescript
interface IBaseMailOptions {
  from?: string;
  fromName?: string;
}

interface INodemailerMailOptions extends IBaseMailOptions {
  provider: 'nodemailer';
  config: TNodemailerConfig; // SMTPTransport | SMTPTransport.Options | string
}

interface IMailgunMailOptions extends IBaseMailOptions {
  provider: 'mailgun';
  config: TMailgunConfig; // { domain: string; [key: string]: any }
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

#### Full Queue Executor Config Interface
```typescript
interface IMailQueueExecutorConfig {
  type: TConstValue<typeof MailQueueExecutorTypes>; // 'direct' | 'internal-queue' | 'bullmq'
  internalQueue?: {
    identifier: string;
  };
  bullmq?: {
    redis: IRedisHelperOptions;
    queue: {
      identifier: string;
      name: string;
    };
    mode: TConstValue<typeof BullMQExecutorModes>; // REQUIRED: 'queue-only' | 'worker-only' | 'both'
  };
}
```

> [!IMPORTANT]
> The `bullmq.mode` field is **required** when `type` is `'bullmq'`. There is no default value -- you must explicitly choose `'queue-only'`, `'worker-only'`, or `'both'`.

#### Nodemailer Transport Capabilities
- Basic SMTP authentication (`user`/`pass`)
- OAuth2 authentication (client ID, secret, refresh token)
- TLS/SSL connections
- Custom SMTP headers
- Connection pooling
- Attachment handling (file path, buffer, stream)
- HTML and plain text content
- SMTP connection verification via `verify()` method
- Peer dependency validation via `validateModule()` (requires `nodemailer` to be installed)

#### Mailgun Transport Capabilities
- US and EU regional endpoints
- API key authentication
- HTML and plain text emails
- Inline attachments with CID
- Custom headers (auto-prefixed with `h:`)
- Batch sending via Mailgun's API
- Test mode verification via `verify()` method (uses `o:testmode` flag)
- Peer dependency validation via `validateModule()` (requires `mailgun.js` to be installed)

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MailDefaults.BATCH_CONCURRENCY` | `5` | Default concurrent sends in batch |
| `MailQueueExecutorTypes.DIRECT` | `'direct'` | Immediate execution |
| `MailQueueExecutorTypes.INTERNAL_QUEUE` | `'internal-queue'` | In-memory queue |
| `MailQueueExecutorTypes.BULLMQ` | `'bullmq'` | Redis-backed queue |
| `BullMQExecutorModes.QUEUE_ONLY` | `'queue-only'` | Producer only (enqueue) |
| `BullMQExecutorModes.WORKER_ONLY` | `'worker-only'` | Consumer only (process) |
| `BullMQExecutorModes.BOTH` | `'both'` | Full duplex (produce + consume) |

#### MailErrorCodes

| Constant | Value | Description |
|----------|-------|-------------|
| `MailErrorCodes.INVALID_CONFIGURATION` | `'MAIL_INVALID_CONFIGURATION'` | Invalid or missing configuration (transport, template engine, subject, body) |
| `MailErrorCodes.SEND_FAILED` | `'MAIL_SEND_FAILED'` | Single email send failed |
| `MailErrorCodes.VERIFICATION_FAILED` | `'MAIL_VERIFICATION_FAILED'` | Transport connection verification failed |
| `MailErrorCodes.INVALID_RECIPIENT` | `'MAIL_INVALID_RECIPIENT'` | Missing or empty recipient address |
| `MailErrorCodes.BATCH_SEND_FAILED` | `'MAIL_BATCH_SEND_FAILED'` | Batch email operation failed |
| `MailErrorCodes.TEMPLATE_NOT_FOUND` | `'TEMPLATE_NOT_FOUND'` | Template name not found in registry |

#### MailQueueExecutorTypes Validation

Both `MailQueueExecutorTypes` and `BullMQExecutorModes` include a `SCHEME_SET` / `MODE_SET` and an `isValid()` static method for runtime validation:

```typescript
MailQueueExecutorTypes.isValid('bullmq');      // true
MailQueueExecutorTypes.isValid('unknown');      // false
BullMQExecutorModes.isValid('both');            // true
BullMQExecutorModes.isValid('invalid');         // false
```

## Binding Keys

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

## See Also

- [Usage & Examples](./usage) -- Sending emails, templates, queue executors, and verification
- [API Reference](./api) -- Architecture, interfaces, and internals
- [Error Reference](./errors) -- Error codes and troubleshooting
