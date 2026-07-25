# Mail - Error Reference & Troubleshooting

> Complete error code reference and troubleshooting guide for the Mail component.

## Error reference

All errors are created via `getError()`. Only errors that carry a status and a code reach you as an `ApplicationError` with those fields; the rows marked `--` throw a plain error with only a `message`. Read an error's code at `error.normalized.code` - there is no flat `error.messageCode`.

The 4xx rows below come from the `MailErrors` catalog, which holds the status and the code together so two throw sites cannot disagree. The 5xx rows stay codeless by design - a delivery failure is not something a caller can act on.

### `MailService` errors

| Condition | Status | Error code | Message |
|-----------|--------|-----------|---------|
| `to` is missing or an empty array | 400 | `core.mail.invalid_recipient` | `Recipient email address is required` |
| `subject` is falsy | 400 | `core.mail.invalid_configuration` | `Email subject is required` |
| Both `text` and `html` are falsy | 400 | `core.mail.invalid_configuration` | `Email must have either text or html content` |
| Transport throws during `send()` | 500 | `core.mail.send_failed` | `Failed to send email: <error>` |
| Batch operation fails | 500 | `core.mail.batch_send_failed` | `Failed to send batch emails: <error>` |
| Template engine not configured for `sendTemplate()` | 500 | `core.mail.invalid_configuration` | `Template engine not configured` |
| Transport throws during `verify()` | 500 | `core.mail.verification_failed` | `Mail transport verification failed: <error>` |

> [!NOTE]
> "Transport throws during `send()`/`verify()`" only fires for a **custom** transport. The built-in `NodemailerTransportHelper` and `MailgunTransportHelper` never throw from `send()` or `verify()`. They catch internally and return `{ success: false, error }` (or `false` for `verify()`). A 400 validation error raised by `validateMessage()` is re-thrown unchanged, not wrapped as `SEND_FAILED`.

### `MailComponent` errors

| Condition | Status | Error code | Message |
|-----------|--------|-----------|---------|
| `MAIL_OPTIONS` not bound before `component(MailComponent)` | -- | -- | `Mail options not configured` |

### `MailTransportProvider` errors

| Condition | Status | Error code | Message |
|-----------|--------|-----------|---------|
| Unsupported provider string | 500 | `core.mail.invalid_configuration` | `Unsupported mail provider: <provider>` |
| Nodemailer options fail the type guard | 500 | `core.mail.invalid_configuration` | `Invalid Nodemailer configuration` |
| Mailgun options fail the type guard | 500 | `core.mail.invalid_configuration` | `Invalid Mailgun configuration` |
| Custom options fail the type guard | 500 | `core.mail.invalid_configuration` | `Invalid custom mail provider configuration` |
| Custom config missing `send`/`verify` | 500 | `core.mail.invalid_configuration` | `Custom mail provider must implement IMailTransport interface. Missing methods: <methods>` |

### `MailgunTransportHelper` errors

| Condition | Status | Error code | Message |
|-----------|--------|-----------|---------|
| `config` is missing `username`, `key`, or `domain` | 500 | `core.mail.invalid_configuration` | `Invalid Mailgun configuration \| Missing required keys: <keys>` |

This check runs on `configure()`, one layer deeper than `MailTransportProvider`'s type guard. A `config` object that passes the provider's guard - it merely has *a* `config` property - can still fail this one if it is missing the specific keys Mailgun's client needs.

### `MailQueueExecutorProvider` errors

| Condition | Status | Error code | Message |
|-----------|--------|-----------|---------|
| `config.internalQueue` missing for `internal-queue` type | -- | -- | `Internal queue configuration is missing` |
| `config.bullmq` missing for `bullmq` type | -- | -- | `BullMQ configuration is missing` |
| Unknown executor type | -- | -- | `Unknown mail queue executor type: <type>` |

### `TemplateEngineService` errors

| Condition | Status | Error code | Message |
|-----------|--------|-----------|---------|
| Neither `templateName` nor `templateData` provided | -- | -- | `Either templateName or templateData must be provided` |
| Template name not found in registry | 404 | `core.mail.template_not_found` | `Template not found: <name>` |
| Missing template data keys (with `requireValidate: true`) | 400 | `core.mail.invalid_configuration` | `Missing template data for keys: <keys>` |

### Queue executor errors

| Condition | Executor | Message |
|-----------|----------|---------|
| Processor not set before enqueue | Direct, Internal Queue -- always | `Processor not set. Call setProcessor() first.` |
| Processor not set before enqueue | BullMQ -- only outside `'queue-only'` mode | `Processor not set. Call setProcessor() first.` |
| Processor not set before adding a worker | BullMQ | `Processor not set. Call setProcessor() first.` |
| Enqueue attempted in `worker-only` mode | BullMQ | `Cannot enqueue jobs in worker-only mode. Set mode to "queue-only" or "both".` |
| Queue helper unexpectedly `null` | BullMQ | `Queue helper not initialized. This should not happen in queue-enabled mode.` |

## Troubleshooting

### "Mail options not configured"

- **Cause.** `MailKeys.MAIL_OPTIONS` was not bound before `MailComponent` was registered. `binding()` checks `isBound()` and throws immediately.
- **Fix.** Bind the options before calling `this.component(MailComponent)`:

```typescript
this.bind({ key: MailKeys.MAIL_OPTIONS }).toValue({
  provider: MailProviders.NODEMAILER,
  from: 'noreply@example.com',
  config: { host: 'smtp.example.com', port: 587, secure: false, auth: { user: '...', pass: '...' } },
});

this.component(MailComponent);
```

### "Invalid Mailgun configuration | Missing required keys: ..."

- **Cause.** The Mailgun `config` object is missing `username`, `key`, or `domain`. A common mistake is naming the field `apiKey` instead of `key`.
- **Fix.** Use the exact field names `mailgun.js` expects:

```typescript
config: { username: 'api', key: process.env.MAILGUN_API_KEY, domain: 'mg.example.com' }
```

### `core.mail.template_not_found` from `sendTemplate()`

- **Cause.** The template name was never registered via `templateEngine.registerTemplate()`. This often happens because a database-backed sync runs after the first `sendTemplate()` call, not before it.
- **Fix.** Register the template first:

```typescript
this.templateEngine.registerTemplate({
  name: 'welcome-email',
  content: '<h1>Welcome {{userName}}</h1>',
});
```

### Emails silently fail with `success: false`

- **Cause.** The transport connection is misconfigured: wrong credentials, a blocked port, or an expired OAuth2 token. `MailService.send()` never throws for a built-in transport's connection failure - it returns `{ success: false, error }`.
- **Fix.** Check `result.error` for the underlying transport error, and verify the connection at startup:

```typescript
const isConnected = await this.mailService.verify();
if (!isConnected) {
  this.logger.error('Mail transport verification failed');
}
```

### BullMQ executor is not processing jobs

- **Cause.** Either `mode` is `'queue-only'` (enqueues but never starts a worker), or the Redis connection is unreachable.
- **Fix.** Run `mode: 'both'` or `'worker-only'` on the instance meant to process jobs, and confirm Redis connectivity:

```typescript
{
  type: 'bullmq',
  bullmq: {
    redis: { host: 'localhost', port: 6379 /* ... */ },
    queue: { identifier: 'mail-queue', name: 'mail-queue' },
    mode: 'both', // must be 'both' or 'worker-only' to process
  },
}
```

### Template placeholders show up literally in the output

- **Cause.** The `data` object passed to `render()`/`sendTemplate()` is missing a <code v-pre>{{key}}</code> the template uses. Without `requireValidate: true`, the engine preserves the original placeholder text. It does **not** replace a missing value with an empty string.
- **Fix.** Check what is missing before rendering, or fail loudly instead:

```typescript
const validation = this.templateEngine.validateTemplateData({ template, data });
if (!validation.isValid) {
  console.error('Missing keys:', validation.missingKeys);
}
```

```typescript
const html = this.templateEngine.render({
  templateName: 'welcome-email',
  data,
  requireValidate: true, // throws instead of leaving placeholders in the output
});
```

### "Processor not set. Call setProcessor() first."

- **Cause.** `enqueueVerificationEmail()` was called before `setProcessor()`. Direct and Internal Queue always require a processor first. BullMQ requires one too, except in `'queue-only'` mode, where enqueueing does not need a processor.
- **Fix.** Register a processor before enqueuing:

```typescript
executor.setProcessor(async (email: string) => {
  // Your email-sending logic, typically wrapping mailService.send()
  return { success: true, message: 'Verification email sent', expiresInMinutes: 10 };
});
```

### "Cannot enqueue jobs in worker-only mode"

- **Cause.** The BullMQ executor is running with `mode: 'worker-only'`, which never creates a queue and therefore cannot accept new jobs.
- **Fix.** Use `'both'` or `'queue-only'` on any instance that needs to enqueue. Reserve `'worker-only'` for dedicated worker processes that only consume.

### Startup logs and credentials

`MailComponent.createAndBindInstances()` logs only `mailOptions.provider` and `queueExecutorConfig.type`, at `info` level. It never logs the full config object, by design. That keeps SMTP passwords, OAuth2 secrets, Mailgun API keys, and Redis passwords out of the log - at least through the component itself.

> [!WARNING]
> That guarantee is scoped to `MailComponent`'s own logging. If your wrapper component or any other code logs the `TMailOptions`/`IMailQueueExecutorConfig` object directly - for example, `logger.info('%j', mailOptions)` while debugging - you reintroduce the leak yourself. Log individual safe fields instead of the whole object.

## See also

- [Overview](./) -- quick start, imports, common configuration tasks
- [Usage & Examples](./usage) -- sending emails, templates, queue executors, verification generators
- [API Reference](./api) -- architecture, binding keys, interfaces, and internals
