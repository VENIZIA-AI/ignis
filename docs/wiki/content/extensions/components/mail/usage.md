# Mail - Usage & Examples

> Practical examples for sending emails and attachments, using templates, queue executors, and verification generators.

## Sending emails

Inject `IMailService` via the `MailKeys.MAIL_SERVICE` binding key from any service.

**Send a single email:**

```typescript
import { BaseService, inject } from '@venizia/ignis';
import { MailKeys, type IMailService } from '@venizia/ignis/mail';

export class UserService extends BaseService {
  constructor(
    @inject({ key: MailKeys.MAIL_SERVICE })
    private _mailService: IMailService,
  ) {
    super({ scope: UserService.name });
  }

  async sendWelcomeEmail(opts: { userEmail: string; userName: string }) {
    const result = await this._mailService.send({
      to: opts.userEmail,
      subject: 'Welcome to Our App!',
      html: `<h1>Welcome ${opts.userName}!</h1><p>Thanks for joining us.</p>`,
      text: `Welcome ${opts.userName}! Thanks for joining us.`,
    });

    if (result.success) {
      this.logger.info('[sendWelcomeEmail] Email sent: %s', result.messageId);
    } else {
      this.logger.error('[sendWelcomeEmail] Failed to send email: %s', result.error);
    }

    return result;
  }
}
```

- **Default `from`.** If `message.from` is omitted, `send()` fills it from `MailKeys.MAIL_OPTIONS`. With `fromName` set, the default renders as `"fromName" <from>`; with neither `from` nor `fromName`, it falls back to `MailDefaults.FALLBACK_FROM` (`noreply@example.com`).
- **Transport errors never throw here.** The built-in Nodemailer, Mailgun and Amazon SES transports catch their own errors and return `{ success: false, error }`. `send()` only throws `SEND_FAILED` for a custom transport that throws instead of returning a failed result.

**Send a batch of emails:**

```typescript
async sendBulkNotifications(users: Array<{ email: string; name: string }>) {
  const messages = users.map(user => ({
    to: user.email,
    subject: 'Important Update',
    html: `<p>Hello ${user.name}, we have an important update for you.</p>`,
  }));

  const results = await this.mailService.sendBatch(messages, {
    concurrency: 5, // Send 5 emails at a time
  });

  const successCount = results.filter(r => r.success).length;
  this.logger.info(
    '[sendBulkNotifications] Sent %d/%d emails successfully',
    successCount,
    results.length,
  );

  return results;
}
```

- **Concurrency defaults to `MailDefaults.BATCH_CONCURRENCY` (`5`).** `sendBatch()` runs every message through `send()` with `executePromiseWithLimit()`.
- **One bad message never aborts the batch.** A `send()` that throws is caught per-message and converted to `{ success: false, error }`; only a failure of the batch operation itself throws `BATCH_SEND_FAILED`.

### Message validation

`MailService.validateMessage()` runs before every send. It throws immediately - before the transport is ever called - if any of these hold:

| Condition | Error code | Message |
|-----------|-----------|---------|
| `to` is missing or an empty array | `MailErrorCodes.INVALID_RECIPIENT` | `Recipient email address is required` |
| `subject` is missing | `MailErrorCodes.INVALID_CONFIGURATION` | `Email subject is required` |
| Both `text` and `html` are missing | `MailErrorCodes.INVALID_CONFIGURATION` | `Email must have either text or html content` |
| `text` or `html` is neither a string nor `null` (a `Buffer`, a stream, `{ path }`, `{ href }`) | `MailErrorCodes.BODY_SOURCE_REFUSED` | `Mail body refused \| text and html must be strings; ...` |

```typescript
// Throws before reaching the transport
await mailService.send({
  to: 'user@example.com',
  subject: '', // Empty subject triggers validation error
  html: '<p>Hello</p>',
});
// Error: { statusCode: 400, message: 'Email subject is required',
//          normalized: { code: 'core.mail.invalid_configuration', args: {}, text: 'Email subject is required' } }
```

### Attachments

Pass the bytes as `content` - a `Buffer`, a `Uint8Array`, a string, a Node `Readable` or a web `ReadableStream`:

```typescript
await this.mailService.send({
  to: 'user@example.com',
  subject: 'Your invoice',
  html: '<p>Invoice attached.</p>',
  attachments: [
    { filename: 'invoice.pdf', content: pdfBuffer, contentType: 'application/pdf' },
    { filename: 'notes.txt', content: 'Paid in full' },
    { filename: 'report.csv', content: createReadStream('./tmp/report.csv') },
  ],
});
```

To attach a file by `path` instead, set `attachmentRoot` on the mail options. A `path` is then read only from inside that directory:

```typescript
this.component(MailComponent, {
  options: {
    provider: MailProviders.NODEMAILER,
    config: { host, port, secure, auth },
    attachmentRoot: '/srv/app/mail-assets',
  },
});

// Reads /srv/app/mail-assets/logo.png; filename and contentType follow from the path
await this.mailService.send({
  to: 'user@example.com',
  subject: 'Hello',
  html: '<img src="cid:logo">',
  attachments: [{ path: 'logo.png', cid: 'logo' }],
});
```

`MailService.send()` turns every attachment into `content` bytes before the transport sees it, so no transport ever reads a path on its own. The rules:

| Attachment | Result |
|---|---|
| `path` with no `attachmentRoot` set | Refused - `core.mail.attachment_path_refused` (400) |
| `path` that resolves outside the root (`..`, an absolute path elsewhere, a symlink pointing out) | Refused - `core.mail.attachment_path_refused` (400) |
| `path` to a missing file, a directory, a FIFO or an unreadable file | Refused - the same error and message, so a caller cannot probe which files exist |
| `path` to a file inside the root | Read and sent as `content`; `filename` and `contentType` default from the path |
| `path` as a URL (`https://...`, `data:...`) | Treated as a file name under the root, never fetched |
| `href` or `raw` (Nodemailer sources) | Refused - `core.mail.attachment_path_refused` (400) |
| `content` that is not bytes, text or a stream | Refused - `core.mail.invalid_configuration` (400) |
| All attachments of one message over `maxAttachmentBytes` (default 25 MB) | Refused - `core.mail.attachment_too_large` (413) |

The size limit counts every attachment of the message together, so it also bounds each one. A file is sized before it is opened and counted again while it is read. A stream is counted while it drains: once the running total passes the limit, the read stops and the rest is never buffered. When a send is refused, every attachment stream it was given is destroyed.

The limit counts decoded bytes, and base64 adds about 37% on the wire. The 25 MB default therefore sends about 34 MB, over the 25 MB cap of Gmail and of Mailgun - set `maxAttachmentBytes: 18 * 1024 * 1024` for those. Plan memory for about four times the limit per send in flight.

Both options are checked when the component starts. `maxAttachmentBytes` must be a positive integer, and `attachmentRoot` an absolute path to an existing directory. Anything else fails the boot with `Invalid mail options`.

> [!WARNING]
> Never copy `attachments` from a request body into a message. Map what the caller uploaded to `content` yourself. `path` names a file on your server, so a caller who controls it chooses which file gets mailed. `attachmentRoot` limits that choice to one directory. It does not make `path` safe to hand over.
>
> Keep the root writable only by code you trust. Anything that can create links inside it - an archive extraction, a shared upload folder - can swap a directory for a symlink between the check and the read, and a hard link is followed like the file it points to.
>
> The same goes for the body. Nodemailer reads a `text` or `html` given as `{ path }` or `{ href }`, so `send()` accepts only strings there - `null` counts as absent - and refuses anything else, a `Buffer` or a stream included, with `core.mail.body_source_refused` (400). The Nodemailer transport also sets Nodemailer's own `disableFileAccess` and `disableUrlAccess`.

## Template engine

### Register and send a template

Inject both `IMailTemplateEngine` and `IMailService`. `sendTemplate()` renders through the engine and sends via `IMailService` -- it never bypasses `send()`.

```typescript
import { BaseService, inject } from '@venizia/ignis';
import { MailKeys, type IMailTemplateEngine, type IMailService } from '@venizia/ignis/mail';

export class NotificationService extends BaseService {
  constructor(
    @inject({ key: MailKeys.MAIL_TEMPLATE_ENGINE })
    private templateEngine: IMailTemplateEngine,
    @inject({ key: MailKeys.MAIL_SERVICE })
    private mailService: IMailService,
  ) {
    super({ scope: NotificationService.name });
    this.registerTemplates();
  }

  registerTemplates() {
    this.templateEngine.registerTemplate({
      name: 'welcome-email',
      content: `
        <html>
          <body>
            <h1>Welcome {{userName}}!</h1>
            <p>Your account has been created successfully.</p>
            <p>Your verification code is: <strong>{{verificationCode}}</strong></p>
          </body>
        </html>
      `,
      options: {
        subject: 'Welcome to {{appName}}',
        description: 'Welcome email for new users',
      },
    });
  }

  async sendWelcomeEmail(userEmail: string, userName: string, verificationCode: string) {
    return this.mailService.sendTemplate({
      templateName: 'welcome-email',
      data: { userName, verificationCode, appName: 'My Application' },
      recipients: userEmail,
      options: {
        // `path` is read under `attachmentRoot` - see Attachments above
        attachments: [{ path: 'logo.png', cid: 'logo' }],
      },
    });
  }
}
```

- **Subject resolution order.** `options.subject` wins if you pass it. Otherwise the template's own `subject` wins, rendered through the same engine. If neither is set, the subject falls back to the literal `'No Subject'`.
- **`sendTemplate()` requires the template engine binding.** It throws `INVALID_CONFIGURATION` ("Template engine not configured") if `MailKeys.MAIL_TEMPLATE_ENGINE` was never injected. The constructor parameter is `isOptional: true`, so a service still compiles without it - but the first `sendTemplate()` call then fails.

### How rendering works

`TemplateEngineService` keeps templates in an in-memory `Map<string, ITemplate>`. It substitutes <code v-pre>{{variable}}</code> placeholders using the regex `/\{\{(\s*[\w.]+\s*)\}\}/g`.

- **Nested lookup.** A key is trimmed, then resolved by splitting on `.` and walking the data object (`user.profile.name`).
- **Missing values are preserved, not blanked.** If a resolved value is `undefined` or `null`, the original <code v-pre>{{placeholder}}</code> text stays in the output, and a warning is logged. The engine never replaces it with an empty string.
- **String coercion.** The engine converts a resolved value with `String(value)`.

> [!IMPORTANT]
> Missing template variables are **not** replaced with empty strings. This makes debugging easier: the rendered output shows you exactly which variables did not resolve.

### Validate template data before sending

```typescript
const template = '<h1>Hello {{userName}}, your code is {{code}}</h1>';
const data = { userName: 'John' }; // Missing 'code'

const validation = this.templateEngine.validateTemplateData({ template, data });

if (!validation.isValid) {
  console.error('Missing template variables:', validation.missingKeys); // ['code']
}

// Or throw at render time instead of checking manually
try {
  const html = this.templateEngine.render({
    templateData: template,
    data,
    requireValidate: true, // Throws INVALID_CONFIGURATION if any placeholder is missing
  });
} catch (error) {
  console.error('Template rendering failed:', error.message);
}
```

`validateTemplateData()` extracts every unique placeholder key from the template and reports:

```typescript
{
  isValid: boolean;      // true if all placeholders resolve to a non-null value
  missingKeys: string[]; // placeholder names missing from data
  allKeys: string[];     // every unique placeholder name found
}
```

### Sync templates from a database

```typescript
async syncTemplatesFromDatabase() {
  const templateEngine = this.application.get<IMailTemplateEngine>({
    key: MailKeys.MAIL_TEMPLATE_ENGINE,
  });

  const configRepository = this.application.get<ConfigurationRepository>({
    key: 'repositories.ConfigurationRepository',
  });

  const templateConfigs = await configRepository.find({
    filter: { where: { code: { inq: ['MAIL_TEMPLATE_WELCOME', 'MAIL_TEMPLATE_VERIFICATION'] } } },
  });

  templateConfigs.forEach(config => {
    templateEngine.registerTemplate({
      name: config.code,
      content: config.jValue.content,
      options: { subject: config.jValue.subject, description: config.jValue.description },
    });
    this.logger.info('[syncTemplates] Registered template: %s', config.code);
  });
}
```

## Queue executors

`IMailQueueExecutor` is a separate subsystem from `MailService`. It only exposes `enqueueVerificationEmail()` and `setProcessor()`, and it never calls `send()` on its own. You provide the processor function - typically one that wraps `mailService.send()`. The executor's job is timing, retry, and delivery guarantees around calling that function.

| Executor | Class | Backing |
|----------|-------|---------|
| `direct` | `DirectMailExecutorHelper` | None -- calls the processor immediately |
| `internal-queue` | `InternalQueueMailExecutorHelper` | In-memory `SequentialQueueHelper` |
| `bullmq` | `BullMQMailExecutorHelper` | Redis, via `BullMQHelper` |

### Direct executor

The direct executor calls the processor immediately, with no queueing. It returns `{ queued: false, ... }`. If `enqueueVerificationEmail()` runs before `setProcessor()`, it throws `Processor not set. Call setProcessor() first.` Use it for development, or whenever a caller needs a synchronous result.

### Internal queue executor

The internal queue executor is in-memory and single-instance, backed by `SequentialQueueHelper` from `@venizia/ignis-helpers` with `autoDispatch: true`.

- Job IDs follow `job_<counter>_<timestamp>`.
- A `delay` option schedules the enqueue itself via `setTimeout`, tracked in a `delayedJobs` map.
- On failure - a thrown error, or the processor returning `{ success: false }` - it retries up to `options.attempts` (default `3`).
- Does not persist jobs across restarts. `close()` clears every pending delayed/retry timer.

Retry backoff:

| `backoff` config | Delay |
|---|---|
| `{ type: 'exponential', delay }` | `delay * 2^(attempt - 1)` |
| `{ type: 'fixed', delay }` | the raw `delay` |
| Not set | `1000ms` |

### BullMQ executor

Redis-backed, distributed, backed by `BullMQHelper`. Job persistence, worker concurrency, prioritization, and delayed execution come from BullMQ itself. `removeOnComplete: true`, `removeOnFail: false` (failed jobs stay for debugging). Default enqueue options: `attempts: 3`, `backoff: { type: 'exponential', delay: 1000 }`.

**Mode gates what the executor can do:**

| Mode | Queue created | Workers created | Can enqueue | Can process |
|------|----------------|------------------|-------------|-------------|
| `'queue-only'` | Yes | No (`setProcessor()` skips worker creation) | Yes -- **without** calling `setProcessor()` first | No |
| `'worker-only'` | No | Yes | No (throws) | Yes |
| `'both'` | Yes | Yes | Yes (requires `setProcessor()` first) | Yes |

> [!IMPORTANT]
> `'queue-only'` mode is the one exception to "call `setProcessor()` before you enqueue." In that mode, `enqueueVerificationEmail()` does not need a processor. A producer instance can enqueue jobs that a separate `worker-only` instance later processes.

**Dynamic worker management.** Get the bound instance and manage workers at runtime - no restart required:

```typescript
const executor = this.application.get<BullMQMailExecutorHelper>({
  key: MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE,
});

executor.addWorker({ workerIdentifier: 'mail-queue-worker-extra', concurrency: 10, lockDuration: 60000 });

executor.getWorkerCount(); // e.g. 2
executor.getMode();        // e.g. 'both'

await executor.removeWorker(1); // remove by array index
await executor.clearWorkers();  // close and remove every worker
```

`setProcessor()` on the BullMQ executor is `async` and takes an optional second argument for worker configuration. It clears all existing workers before creating new ones:

```typescript
await executor.setProcessor(
  async (email: string) => {
    // your processing logic
    return { success: true, message: 'Sent', expiresInMinutes: 10 };
  },
  {
    numberOfWorkers: 3,       // default: 1
    concurrencyPerWorker: 10, // default: 5
    lockDuration: 60000,      // job lock duration in ms, default: 30000
  },
);
```

## Verification generators

`MailComponent` binds three generators. All are **transient** - a fresh instance per resolution, since none is registered with `.setScope('singleton')`:

| Generator | Implements | Behavior |
|-----------|-----------|----------|
| `NumericCodeGenerator` | `IVerificationCodeGenerator` | `crypto.randomInt(0, 10^length)`, zero-padded via `padStart()` -- e.g. code `42` at length `6` becomes `"000042"` |
| `RandomTokenGenerator` | `IVerificationTokenGenerator` | `crypto.randomBytes(bytes).toString('base64url')` -- 32 bytes produces a 43-character string, URL-safe, no padding |
| `DefaultVerificationDataGenerator` | `IVerificationDataGenerator` | Composes both generators via `@inject`, producing a full `IVerificationData` with separate expiries |

`DefaultVerificationDataGenerator.generateVerificationData()` returns:

- A short numeric code (manual entry: SMS, email)
- A long base64url token (URL-based verification links)
- Separate expiries: code via `getExpiryTime(minutes)`, token via `getExpiryTimeInHours(hours)`
- ISO 8601 generation timestamps, `codeAttempts: 0`, `lastCodeSentAt` set to now

**End-to-end verification flow:**

```typescript
import { BaseService, inject } from '@venizia/ignis';
import { MailKeys, type IMailService, type IVerificationDataGenerator } from '@venizia/ignis/mail';

export class AuthService extends BaseService {
  constructor(
    @inject({ key: MailKeys.MAIL_SERVICE })
    private mailService: IMailService,
    @inject({ key: MailKeys.MAIL_VERIFICATION_DATA_GENERATOR })
    private verificationGenerator: IVerificationDataGenerator,
  ) {
    super({ scope: AuthService.name });
  }

  async sendVerificationEmail(userEmail: string) {
    const verificationData = this.verificationGenerator.generateVerificationData({
      codeLength: 6,
      tokenBytes: 32,
      codeExpiryMinutes: 10,
      tokenExpiryHours: 24,
    });

    // Persist verificationData to your own user/verification table here.

    const result = await this.mailService.send({
      to: userEmail,
      subject: 'Email Verification',
      html: `
        <h2>Verify Your Email</h2>
        <p>Your verification code is: <strong>${verificationData.verificationCode}</strong></p>
        <p>This code expires at: ${verificationData.codeExpiresAt}</p>
        <p>Or click this link: https://example.com/verify?token=${verificationData.verificationToken}</p>
      `,
    });

    return { result, verificationData };
  }
}
```

## Logging and credentials

`MailComponent.createAndBindInstances()` logs only `mailOptions.provider` and `queueExecutorConfig.type`, at `info` level. It never logs the full config objects, by design. That keeps SMTP passwords, OAuth2 secrets, API keys, and Redis passwords out of the log sink - at least through the component itself.

> [!WARNING]
> That guarantee only covers what `MailComponent` logs internally. If your own wrapper component or bootstrap code logs the `TMailOptions` or `IMailQueueExecutorConfig` object directly, you reintroduce the leak yourself. This commonly happens while debugging a binding. Log individual safe fields (`provider`, `type`) instead of the whole object.

## See also

- [Setup & Configuration](./) -- quick reference, setup, configuration, and binding keys
- [API Reference](./api) -- architecture, interfaces, and internals
- [Error Reference](./errors) -- error codes and troubleshooting
