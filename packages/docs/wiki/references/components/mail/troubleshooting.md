# Troubleshooting

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

### Template validation fails with missing keys

**Cause:** The `data` object passed to `render()` or `sendTemplate()` does not contain all `{{key}}` placeholders found in the template, and `requireValidate: true` is set.

**Fix:** Use `validateTemplateData()` to check which keys are missing before rendering:

```typescript
const validation = this.templateEngine.validateTemplateData({ template, data });
if (!validation.isValid) {
  console.error('Missing keys:', validation.missingKeys);
}
```
