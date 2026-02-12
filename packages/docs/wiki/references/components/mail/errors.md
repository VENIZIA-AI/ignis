# Mail -- Error Reference & Troubleshooting

> Complete error code reference and troubleshooting guide for the Mail component.

## Error Reference

All errors are created via `getError()` and include `statusCode`, `messageCode`, and `message` fields.

### MailService Errors

| Condition | Status | Error Code | Message |
|-----------|--------|-----------|---------|
| `to` is missing or empty array | 400 | `MAIL_INVALID_RECIPIENT` | `Recipient email address is required` |
| `subject` is falsy | 400 | `MAIL_INVALID_CONFIGURATION` | `Email subject is required` |
| Both `text` and `html` are falsy | 400 | `MAIL_INVALID_CONFIGURATION` | `Email must have either text or html content` |
| Transport throws during `send()` | 500 | `MAIL_SEND_FAILED` | `Failed to send email: <error>` |
| Batch operation fails | 500 | `MAIL_BATCH_SEND_FAILED` | `Failed to send batch emails: <error>` |
| Template engine not configured for `sendTemplate()` | 500 | `MAIL_INVALID_CONFIGURATION` | `Template engine not configured` |
| Transport throws during `verify()` | 500 | `MAIL_VERIFICATION_FAILED` | `Mail transport verification failed: <error>` |

### MailComponent Errors

| Condition | Status | Error Code | Message |
|-----------|--------|-----------|---------|
| `MAIL_OPTIONS` not bound | -- | -- | `Mail options not configured` |

### MailTransportProvider Errors

| Condition | Status | Error Code | Message |
|-----------|--------|-----------|---------|
| Unsupported provider string | 500 | `MAIL_INVALID_CONFIGURATION` | `Unsupported mail provider: <provider>` |
| Nodemailer options fail type guard | 500 | `MAIL_INVALID_CONFIGURATION` | `Invalid Nodemailer configuration` |
| Mailgun options fail type guard | 500 | `MAIL_INVALID_CONFIGURATION` | `Invalid Mailgun configuration` |
| Custom options fail type guard | 500 | `MAIL_INVALID_CONFIGURATION` | `Invalid custom mail provider configuration` |
| Custom config missing `send`/`verify` | 500 | `MAIL_INVALID_CONFIGURATION` | `Custom mail provider must implement IMailTransport interface. Missing methods: <methods>` |

### MailQueueExecutorProvider Errors

| Condition | Status | Error Code | Message |
|-----------|--------|-----------|---------|
| `config.internalQueue` missing for `internal-queue` type | -- | -- | `Internal queue configuration is missing` |
| `config.bullmq` missing for `bullmq` type | -- | -- | `BullMQ configuration is missing` |
| Unknown executor type | -- | -- | `Unknown mail queue executor type: <type>` |

### TemplateEngineService Errors

| Condition | Status | Error Code | Message |
|-----------|--------|-----------|---------|
| Neither `templateName` nor `templateData` provided | -- | -- | `Either templateName or templateData must be provided` |
| Template name not found in registry | 404 | `TEMPLATE_NOT_FOUND` | `Template not found: <name>` |
| Missing template data keys (with `requireValidate: true`) | 400 | `MAIL_INVALID_CONFIGURATION` | `Missing template data for keys: <keys>` |

### Queue Executor Errors

| Condition | Executor | Message |
|-----------|----------|---------|
| Processor not set before enqueue | Direct, Internal Queue, BullMQ | `Processor not set. Call setProcessor() first.` |
| Processor not set before adding worker | BullMQ | `Processor not set. Call setProcessor() first.` |
| Enqueue in worker-only mode | BullMQ | `Cannot enqueue jobs in worker-only mode. Set mode to "queue-only" or "both".` |
| Queue helper unexpectedly null | BullMQ | `Queue helper not initialized. This should not happen in queue-enabled mode.` |

## Troubleshooting

### "Mail options not configured"

**Cause:** `MailKeys.MAIL_OPTIONS` was not bound in the DI container before `MailComponent` was registered. The component checks `isBound()` in its `binding()` phase and throws immediately.

**Fix:** Ensure the options binding exists before calling `this.application.component(MailComponent)`:

```typescript
this.application.bind({ key: MailKeys.MAIL_OPTIONS }).toValue({
  provider: MailProviders.NODEMAILER,
  from: 'noreply@example.com',
  config: { host: 'smtp.example.com', port: 587, secure: false, auth: { user: '...', pass: '...' } },
});

// Then register the component
this.application.component(MailComponent);
```

### "TEMPLATE_NOT_FOUND" when calling `sendTemplate()`

**Cause:** The template name passed to `sendTemplate()` was never registered via `templateEngine.registerTemplate()`.

**Fix:** Register the template before sending. If templates are loaded from a database, ensure the sync runs before the first `sendTemplate()` call:

```typescript
this.templateEngine.registerTemplate({
  name: 'welcome-email',
  content: '<h1>Welcome {{userName}}</h1>',
});
```

### Emails silently fail with `success: false`

**Cause:** The transport connection is misconfigured (wrong credentials, blocked port, expired OAuth2 token). The `MailService.send()` method catches transport errors and returns `{ success: false, error: '...' }` rather than throwing.

**Fix:** Check `result.error` for the specific transport error. Verify transport on startup:

```typescript
const isConnected = await this.mailService.verify();
if (!isConnected) {
  this.logger.error('Mail transport verification failed');
}
```

### BullMQ executor not processing jobs

**Cause:** The `mode` is set to `'queue-only'` which only enqueues jobs without starting a worker, or the Redis connection is unreachable.

**Fix:** Ensure `mode` is `'both'` or `'worker-only'` on the instance that should process jobs. Verify Redis connectivity:

```typescript
{
  type: 'bullmq',
  bullmq: {
    redis: { host: 'localhost', port: 6379, /* ... */ },
    queue: { identifier: 'mail-queue', name: 'mail-queue' },
    mode: 'both', // Must be 'both' or 'worker-only' to process
  },
}
```

### Template variables not replaced (placeholders preserved)

**Cause:** The `data` object passed to `render()` or `sendTemplate()` does not contain all <code v-pre>{{key}}</code> placeholders found in the template. When `requireValidate` is **not** set (or set to `false`), the template engine preserves the original placeholder text as-is (e.g., <code v-pre>{{missingKey}}</code> remains literally in the output). It does **not** replace missing variables with empty strings.

**Fix:** Use `validateTemplateData()` to check which keys are missing before rendering:

```typescript
const validation = this.templateEngine.validateTemplateData({ template, data });
if (!validation.isValid) {
  console.error('Missing keys:', validation.missingKeys);
}
```

Or set `requireValidate: true` to throw an error when keys are missing:

```typescript
const html = this.templateEngine.render({
  templateName: 'welcome-email',
  data,
  requireValidate: true, // Throws if any placeholders are missing
});
```

### "Processor not set. Call setProcessor() first."

**Cause:** The queue executor's `enqueueVerificationEmail()` was called before `setProcessor()`. All three executor types (Direct, Internal Queue, BullMQ) require a processor function to be registered first.

**Fix:** Call `setProcessor()` before enqueuing any jobs:

```typescript
executor.setProcessor(async (email: string) => {
  // Your email processing logic here
  return { success: true, message: 'Verification email sent', expiresInMinutes: 10 };
});
```

### "Cannot enqueue jobs in worker-only mode"

**Cause:** The BullMQ executor is configured with `mode: 'worker-only'`, which does not initialize a queue and therefore cannot accept new jobs.

**Fix:** Use `mode: 'both'` or `mode: 'queue-only'` on instances that need to enqueue jobs. Use `mode: 'worker-only'` only on dedicated worker processes.

### Credential logging at startup

**Cause:** The `MailComponent.createAndBindInstances()` method logs the full `mailOptions` object (including credentials) at `info` level during initialization. This is by design for debugging, but it means sensitive values like API keys, passwords, and OAuth tokens will appear in logs.

**Fix:** In production, either use a log level higher than `info` for the mail component scope, or ensure your log pipeline redacts sensitive fields.

## See Also

- [Setup & Configuration](./) -- Quick reference, setup steps, configuration options, and binding keys
- [Usage & Examples](./usage) -- Sending emails, templates, queue executors, and verification
- [API Reference](./api) -- Architecture, interfaces, and internals
