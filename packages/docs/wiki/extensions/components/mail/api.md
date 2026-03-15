# Mail -- API Reference

> Architecture, interfaces, and internal implementation details of the Mail component.

## Architecture

```
  ┌─────────────────────────────────────────────────┐
  │               Your Application                   │
  │                                                   │
  │  NodemailerComponent (wrapper)                   │
  │    ├── binds MailKeys.MAIL_OPTIONS               │
  │    ├── binds MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG │
  │    └── registers MailComponent                    │
  └───────────────────────┬─────────────────────────┘
                          │
                          ▼
  ┌─────────────────────────────────────────────────┐
  │               MailComponent                       │
  │                                                   │
  │  binding()                                        │
  │    ├── initGenerators()                           │
  │    │     ├── NumericCodeGenerator                 │
  │    │     ├── RandomTokenGenerator                 │
  │    │     └── DefaultVerificationDataGenerator     │
  │    │                                               │
  │    ├── initProviders()                            │
  │    │     ├── MailTransportProvider (singleton)     │
  │    │     └── MailQueueExecutorProvider (singleton) │
  │    │                                               │
  │    ├── initServices()                             │
  │    │     ├── MailService (singleton)               │
  │    │     └── TemplateEngineService (singleton)     │
  │    │                                               │
  │    └── createAndBindInstances()                   │
  │          ├── Transport Instance ◄── MAIL_OPTIONS  │
  │          └── Queue Executor ◄── QUEUE_CONFIG      │
  └─────────────────────────────────────────────────┘
```

**Architecture Components:**

- **`MailComponent`** -- Initializes and registers all mail services, transporters, and queue executors. Extends `BaseComponent`. Validates that `MailKeys.MAIL_OPTIONS` is bound before proceeding
- **`MailService`** -- Extends `BaseService`. Provides `send()`, `sendBatch()`, `sendTemplate()`, and `verify()`. Injects transport instance and template engine. Validates messages before sending
- **`TemplateEngineService`** -- Extends `BaseService`. Manages email templates with simple <code v-pre>{{variable}}</code> substitution. Stores templates in an in-memory `Map`
- **`MailTransportProvider`** -- Extends `BaseProvider`. Factory that creates transport instances with type-guard methods (`isNodemailerOptions`, `isMailgunOptions`, `isCustomOptions`) and throws `MailErrorCodes` on invalid configs
- **`MailQueueExecutorProvider`** -- Extends `BaseProvider`. Factory that creates queue executor instances. Throws for missing sub-configs (e.g., `config.internalQueue` or `config.bullmq`)
- **Verification Generators** -- `NumericCodeGenerator`, `RandomTokenGenerator`, `DefaultVerificationDataGenerator`. Generate verification codes, tokens, and data for email verification flows

**Tech Stack:**

- **Nodemailer** -- SMTP-based email sending (peer dependency: `nodemailer`)
- **Mailgun** -- Mailgun API client (peer dependency: `mailgun.js`)
- **BullMQ** (optional) -- Redis-backed queue for distributed processing (peer dependency: `bullmq`)
- **Handlebars-style Templates** -- Simple <code v-pre>{{variable}}</code> syntax for email templates (no external dependency)

## Transport Layer

### Transport Layer Implementation

The `MailTransportProvider` extends `BaseProvider` and returns a factory function from its `value()` method. It creates the appropriate transport based on the `provider` field in `MailKeys.MAIL_OPTIONS`:

- **`'nodemailer'`** -- Creates a `NodemailerTransportHelper` backed by `nodemailer` with SMTP or OAuth2 auth
- **`'mailgun'`** -- Creates a `MailgunTransportHelper` using the Mailgun HTTP API
- **`'custom'`** -- Expects the `config` value to implement `IMailTransport` directly (must have `send()` and `verify()`)
- **Any other string** -- Falls through to `default` and throws `Unsupported mail provider: <provider>` with `MailErrorCodes.INVALID_CONFIGURATION`

The provider uses three private type-guard methods to narrow the union type before creating transports:

```typescript
private isNodemailerOptions(options: TMailOptions): options is INodemailerMailOptions
private isMailgunOptions(options: TMailOptions): options is IMailgunMailOptions
private isCustomOptions(options: TMailOptions): options is ICustomMailOptions
```

For custom transports, an additional `isMailTransport()` utility validates that the config object has `send()` and `verify()` methods, reporting specific missing methods in the error message.

Both built-in transports implement `IMailTransport`:

```typescript
interface IMailTransport {
  send(message: IMailMessage): Promise<IMailSendResult>;
  verify(): Promise<boolean>;
  close?(): Promise<void>;
}
```

### Module Validation

Both `NodemailerTransportHelper` and `MailgunTransportHelper` call `validateModule()` in their `configure()` method before importing the peer dependency. This checks that the required npm module is installed:

- `NodemailerTransportHelper` requires `nodemailer`
- `MailgunTransportHelper` requires `mailgun.js`

If the module is not installed, `validateModule()` throws an error identifying the missing peer dependency.

**Nodemailer Transport:**

The `NodemailerTransportHelper` extends `BaseHelper` and wraps Nodemailer's SMTP transport. In `configure()`, it calls `require('nodemailer')` and creates a transporter. Key behaviors:
- `send()` maps `IMailMessage` fields to Nodemailer's mail options, joining array recipients with `, `
- `send()` catches transport errors and returns `{ success: false, error: ... }` instead of throwing
- `verify()` delegates to Nodemailer's built-in `transporter.verify()` SMTP handshake
- `close()` calls `transporter.close()` to release the connection

**Mailgun Transport:**

The `MailgunTransportHelper` extends `BaseHelper` and uses the Mailgun REST API via `mailgun.js`. In `configure()`, it creates a `Mailgun` client using `FormData`. Key behaviors:
- `send()` converts `IMailMessage` to Mailgun's format: `to` becomes an array, `replyTo` becomes `h:Reply-To`, all custom headers are prefixed with `h:`
- Attachments are mapped to `{ filename, data }` objects where `data` is `path ?? content ?? Buffer.from('')`
- `verify()` sends a test email to `verify@<domain>` with `o:testmode: 'yes'` flag to check API credentials without actually sending
- No `close()` method (HTTP API is stateless)

**Custom Transport:**

You can provide your own transport implementation by setting `provider: MailProviders.CUSTOM` and passing an object that implements `IMailTransport` as the `config` value. The provider validates that `send()` and `verify()` are functions, reporting specific missing methods. This is useful for integrating with services like SendGrid, AWS SES, or custom SMTP relays.

## IMailService Interface

```typescript
interface IMailService {
  // Send a single email
  send(message: IMailMessage): Promise<IMailSendResult>;

  // Send multiple emails with controlled concurrency
  sendBatch(
    messages: IMailMessage[],
    options?: { concurrency?: number },
  ): Promise<IMailSendResult[]>;

  // Send email using a registered template
  sendTemplate(opts: {
    templateName: string;
    data: Record<string, any>;
    recipients: string | string[];
    options?: Partial<IMailMessage>;
  }): Promise<IMailSendResult>;

  // Verify transport connection
  verify(): Promise<boolean>;
}
```

**Method Details:**

**`send(message: IMailMessage)`**

Sends a single email using the configured transport. Internally:
1. Calls `validateMessage()` which throws for missing `to`, `subject`, or both `text`/`html` (see error reference below)
2. Merges `message.from` with the default from address (via `getDefaultFrom()`)
3. Delegates to `transport.send()`
4. Returns a result object with `success`, `messageId`, and optional `error` fields
5. If the transport throws, catches the error and re-throws with `MailErrorCodes.SEND_FAILED`

**`sendBatch(messages: IMailMessage[], options?: { concurrency?: number })`**

Sends multiple emails with controlled concurrency using `executePromiseWithLimit()`. Default concurrency is `MailDefaults.BATCH_CONCURRENCY` (5). Each message is sent via `send()` individually. If an individual `send()` throws, it is caught and converted to `{ success: false, error: '...' }` so the batch continues. If the entire batch operation fails, throws with `MailErrorCodes.BATCH_SEND_FAILED`.

**`sendTemplate(opts: { templateName, data, recipients, options? })`**

Renders a registered template with the provided data and sends the email. The subject is resolved through a priority chain:

1. `options.subject` -- explicit override from the caller
2. Template subject rendered through the template engine (if `templateData.subject` is defined)
3. `'No Subject'` -- fallback if neither is provided

Throws `MailErrorCodes.INVALID_CONFIGURATION` if the template engine is not configured. Re-throws any other errors (including `TEMPLATE_NOT_FOUND` from the template engine).

**`verify()`**

Verifies the transport connection without sending an email. Delegates to `transport.verify()`. If the transport throws, catches and re-throws with `MailErrorCodes.VERIFICATION_FAILED`.

### Protected Methods (MailService)

**`validateMessage(message: IMailMessage)`**

Pre-transport validation that throws immediately for invalid messages:

| Check | Error Code | Status | Message |
|-------|-----------|--------|---------|
| `to` is falsy or empty array | `INVALID_RECIPIENT` | 400 | `Recipient email address is required` |
| `subject` is falsy | `INVALID_CONFIGURATION` | 400 | `Email subject is required` |
| Both `text` and `html` are falsy | `INVALID_CONFIGURATION` | 400 | `Email must have either text or html content` |

**`getDefaultFrom()`**

Constructs the default "from" address. If `options.fromName` is set, returns `"fromName" <from>`. Otherwise returns `options.from ?? 'noreply@example.com'`.

## IMailMessage Interface

```typescript
interface IMailMessage {
  from?: string; // Sender email (uses default if not provided)
  to: string | string[]; // Recipient(s)
  cc?: string | string[]; // CC recipient(s)
  bcc?: string | string[]; // BCC recipient(s)
  replyTo?: string; // Reply-to address
  subject: string; // Email subject
  text?: string; // Plain text content
  html?: string; // HTML content
  attachments?: IMailAttachment[]; // File attachments
  headers?: Record<string, string>; // Custom headers
  requireValidate?: boolean; // Validate template data
  [key: string]: any; // Additional arbitrary fields
}
```

**Field Details:**

**`from`**

Sender email address. If not provided, uses the default `from` value from `MailKeys.MAIL_OPTIONS`. When `fromName` is configured, the default from is formatted as `"Display Name" <email@example.com>`. Can be overridden per-message for multi-tenant scenarios.

**`to`, `cc`, `bcc`**

Recipient addresses. Can be a single string or an array of strings. Format can be either plain email (`user@example.com`) or display name + email (`John Doe <john@example.com>`). For Nodemailer, arrays are joined with `, `. For Mailgun, arrays are passed as-is.

**`replyTo`**

Reply-to address if different from the sender. Useful for no-reply addresses that route replies to a support inbox. Mailgun maps this to `h:Reply-To`.

**`subject`**

Email subject line. Supports template variables when used with `sendTemplate()` (the subject is rendered through the same template engine).

**`text`, `html`**

Plain text and HTML versions of the email body. At least one must be provided (validated by `validateMessage()`). Most email clients prefer HTML but fall back to text if HTML is not available. Best practice is to provide both.

**`attachments`**

Array of `IMailAttachment` objects:

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

Examples:
- A file path: `{ filename: 'doc.pdf', path: '/path/to/doc.pdf' }`
- A buffer: `{ filename: 'data.txt', content: Buffer.from('...') }`
- An inline image: `{ filename: 'logo.png', path: '...', cid: 'logo' }`

**`headers`**

Custom SMTP headers. For Nodemailer, passed directly. For Mailgun, each key is auto-prefixed with `h:`.

**`requireValidate`**

When `true`, template rendering will throw an error if any <code v-pre>{{variable}}</code> placeholders are missing from the data object. Defaults to `false` (missing variables are preserved as their original placeholder text, not replaced with empty strings).

**`[key: string]: any`**

The interface is open-ended -- additional fields are accepted for provider-specific options.

## IMailTemplateEngine Interface

```typescript
interface IMailTemplateEngine {
  // Render a template with data
  render(opts: {
    templateData?: string;
    templateName?: string;
    data: Record<string, any>;
    requireValidate?: boolean;
  }): string;

  // Register a new template
  registerTemplate(opts: { name: string; content: string }): void;

  // Validate template data
  validateTemplateData(opts: { template: string; data: Record<string, any> }): {
    isValid: boolean;
    missingKeys: string[];
    allKeys: string[];
  };

  // Get a registered template
  getTemplate(name: string): ITemplate | undefined;

  // List all registered templates
  listTemplates(): ITemplate[];

  // Check if template exists
  hasTemplate(name: string): boolean;

  // Remove a template
  removeTemplate(name: string): boolean;
}
```

**Method Details:**

**`render(opts: { templateData?, templateName?, data, requireValidate? })`**

Renders a template by name (from registry) or by raw template string (`templateData`). At least one of `templateData` or `templateName` must be provided -- throws if neither is given. If `templateName` is used, looks up the template and throws `TEMPLATE_NOT_FOUND` if not registered. Delegates to `renderSimpleTemplate()` which replaces all <code v-pre>{{variable}}</code> placeholders with values from the `data` object. If `requireValidate` is `true`, throws `INVALID_CONFIGURATION` if any placeholders are missing from the data.

**`registerTemplate(opts: { name, content, options? })`**

Registers a new template in the in-memory registry. The `options` parameter (on the class implementation) can include `subject` and `description` via `Partial<ITemplate>`. Overwrites any existing template with the same name.

**`validateTemplateData(opts: { template, data })`**

Extracts all <code v-pre>{{variable}}</code> placeholders from the template string using the regex `/\{\{(\s*[\w.]+\s*)\}\}/g`. Deduplicates keys. For each unique key, resolves nested values via dot notation. Returns:
- `isValid` -- `true` if all placeholders have non-null, non-undefined values
- `missingKeys` -- Array of placeholder names that are missing or null/undefined in the data
- `allKeys` -- Array of all unique placeholder names found in the template

**`getTemplate(name: string)`**

Retrieves a registered template by name. Returns `undefined` if the template does not exist.

**`listTemplates()`**

Returns an array of all registered templates (values from the internal `Map`).

**`hasTemplate(name: string)`**

Checks if a template with the given name exists in the registry.

**`removeTemplate(name: string)`**

Removes a template from the registry. Logs the removal. Returns `true` if the template was found and removed, `false` otherwise.

### ITemplate Interface

```typescript
interface ITemplate {
  name: string;
  content?: string;
  render?: (data: Record<string, AnyType>) => string;
  subject?: string;
  description?: string;
}
```

The `render` function on the interface supports custom render implementations, though the built-in `TemplateEngineService` uses `content` + `renderSimpleTemplate()` instead.

## Additional Interfaces

### IMailSendResult

```typescript
interface IMailSendResult {
  success: boolean;
  messageId?: string;
  response?: any;
  error?: string;
}
```

Returned by `send()` and individual entries in the `sendBatch()` result array. Transport-level errors populate `error` with the message string.

### IMailQueueExecutor

```typescript
interface IMailQueueExecutor {
  enqueueVerificationEmail(email: string, options?: IMailQueueOptions): Promise<IMailQueueResult>;
  setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void;
}
```

### IMailQueueOptions

```typescript
interface IMailQueueOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}
```

### IMailQueueResult

```typescript
interface IMailQueueResult {
  jobId?: string;
  queued: boolean;
  message: string;
  result?: IMailProcessorResult;
}
```

Returned by `enqueueVerificationEmail()`. The `queued` field is `false` for direct execution, `true` for internal queue and BullMQ. The `result` field is populated only for direct execution (since the processor runs synchronously).

### IMailProcessorResult

```typescript
interface IMailProcessorResult {
  success: boolean;
  message: string;
  expiresInMinutes: number;
  nextResendAt?: string;
}
```

The return type of the processor function registered via `setProcessor()`.

### IVerificationData

```typescript
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
```

### IVerificationGenerationOptions

```typescript
interface IVerificationGenerationOptions {
  codeLength: number;
  tokenBytes: number;
  codeExpiryMinutes: number;
  tokenExpiryHours: number;
}
```

All fields are required. Passed to `DefaultVerificationDataGenerator.generateVerificationData()`.

### IBullMQMailExecutorOpts

```typescript
interface IBullMQMailExecutorOpts {
  redis: IRedisHelperOptions;
  queue: { identifier: string; name: string };
  mode: TConstValue<typeof BullMQExecutorModes>; // REQUIRED
}
```

The `mode` field is **required** -- there is no default value. This is the config object for `IMailQueueExecutorConfig.bullmq`.

### BullMQ Dynamic Worker Management Methods

Dynamic worker management methods (on `BullMQMailExecutorHelper`, not on the interface):

- **`addWorker(opts)`** -- Adds a new BullMQ worker with configurable concurrency (default 5) and lock duration (default 30000ms). Requires `setProcessor()` to have been called first. Each worker gets a unique identifier
- **`removeWorker(index)`** -- Removes a worker by its array index. Calls `worker.close()` before removal. Returns `false` if the index is out of range
- **`clearWorkers()`** -- Closes all workers and empties the worker array. Called internally by `setProcessor()` before creating new workers
- **`getWorkerCount()`** -- Returns the current number of active workers
- **`getMode()`** -- Returns the current executor mode

**Extended `setProcessor()` signature (BullMQ only):**

Unlike the interface's synchronous `setProcessor()`, the BullMQ executor's version is `async` and accepts an optional second argument:

```typescript
async setProcessor(
  processor: (email: string) => Promise<IMailProcessorResult>,
  opts?: {
    numberOfWorkers?: number;       // default: 1
    concurrencyPerWorker?: number;  // default: 5
    lockDuration?: number;          // default: 30000 (ms)
  },
): Promise<void>
```

It clears all existing workers before creating new ones. In `queue-only` mode, it stores the processor but skips worker creation entirely (logs a warning).

## Utility Functions

### Type Utilities

```typescript
// Check if a value implements IMailTransport
function isMailTransport(value: AnyType): value is IMailTransport;

// Check if a value is valid TMailOptions
function isValidMailOptions(options: AnyType): options is TMailOptions;
```

`isMailTransport()` checks for `send` and `verify` as functions, and `close` as either a function or undefined.

`isValidMailOptions()` checks for a string `provider` field and a truthy `config` field.

### Verification Utilities

```typescript
// Get a Date object `minutes` minutes in the future
function getExpiryTime(minutes: number): Date;

// Get a Date object `hours` hours in the future
function getExpiryTimeInHours(hours: number): Date;
```

## See Also

- [Setup & Configuration](./) -- Quick reference, setup steps, configuration options, and binding keys
- [Usage & Examples](./usage) -- Sending emails, templates, queue executors, and verification
- [Error Reference](./errors) -- Error codes and troubleshooting
