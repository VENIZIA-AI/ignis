# Mail -- Usage & Examples

> Practical examples for sending emails, using templates, queue executors, verification generators, and batch operations.

## Sending Emails

Inject `IMailService` via the `MailKeys.MAIL_SERVICE` binding key to send emails from any service.

**Sending a simple email:**

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

**Batch email sending:**

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

**Message validation:**

The `MailService` validates every message before sending via its internal `validateMessage()` method. This pre-transport check throws immediately if any of these conditions is met:

| Condition | Error Code | Message |
|-----------|-----------|---------|
| `to` is missing or empty array | `MailErrorCodes.INVALID_RECIPIENT` | `Recipient email address is required` |
| `subject` is missing | `MailErrorCodes.INVALID_CONFIGURATION` | `Email subject is required` |
| Both `text` and `html` are missing | `MailErrorCodes.INVALID_CONFIGURATION` | `Email must have either text or html content` |

```typescript
// This will throw BEFORE reaching the transport
await mailService.send({
  to: 'user@example.com',
  subject: '', // Empty subject triggers validation error
  html: '<p>Hello</p>',
});
// Error: { statusCode: 400, messageCode: 'MAIL_INVALID_CONFIGURATION', message: 'Email subject is required' }
```

## Template Engine

### Using Templates

Inject both `IMailTemplateEngine` and `IMailService` to register templates and send template-based emails.

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
    // Register a welcome email template
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
    const result = await this.mailService.sendTemplate({
      templateName: 'welcome-email',
      data: {
        userName,
        verificationCode,
        appName: 'My Application',
      },
      recipients: userEmail,
      options: {
        // Optional: override template subject or add attachments
        attachments: [
          {
            filename: 'logo.png',
            path: '/path/to/logo.png',
            cid: 'logo',
          },
        ],
      },
    });

    return result;
  }
}
```

### Template Rendering

The `TemplateEngineService` provides a simple <code v-pre>{{variable}}</code> substitution engine using an in-memory `Map<string, ITemplate>` as its template store.

The `renderSimpleTemplate()` method uses regex `/\{\{(\s*[\w.]+\s*)\}\}/g` to find placeholders. For each match:

1. The key is trimmed of whitespace
2. Nested value lookup via dot notation (e.g., `user.profile.name` resolves by splitting on `.` and walking the object)
3. If the value is `undefined` or `null`, the **original placeholder is preserved as-is** (e.g., <code v-pre>{{missingKey}}</code> remains literally in the output). A warning is logged
4. Otherwise, the value is converted to string via `String(value)`

> [!IMPORTANT]
> Missing template variables are **not** replaced with empty strings. The original <code v-pre>{{placeholder}}</code> text is preserved in the output. This makes debugging easier since you can see which variables were not resolved.

**Template Features:**

- Simple <code v-pre>{{variable}}</code> syntax (no loops or conditionals)
- Nested object access via dot notation: <code v-pre>{{user.profile.name}}</code>
- Subject line templating (subjects are rendered through the same engine)
- HTML and plain text support
- Validation before rendering (optional, throws on missing keys)
- In-memory template registry (`Map<string, ITemplate>`)
- Template metadata (subject, description via `ITemplate`)
- Missing placeholders preserved as-is (not replaced with empty strings)
- `clearTemplates()` to reset the entire registry

### Template Validation

`validateTemplateData()` extracts all unique placeholder keys from a template string and checks if each key resolves to a non-null, non-undefined value in the data object. It returns:

```typescript
{
  isValid: boolean;      // true if all placeholders have values
  missingKeys: string[]; // placeholder names missing from data
  allKeys: string[];     // all unique placeholder names found
}
```

When `requireValidate: true` is passed to `render()` or `renderSimpleTemplate()`, validation runs first and throws with `MailErrorCodes.INVALID_CONFIGURATION` if any keys are missing.

Template validation example:

```typescript
const template = '<h1>Hello {{userName}}, your code is {{code}}</h1>';
const data = { userName: 'John' }; // Missing 'code'

const validation = this.templateEngine.validateTemplateData({ template, data });

if (!validation.isValid) {
  console.error('Missing template variables:', validation.missingKeys);
  // Output: ['code']
}

// Render with validation
try {
  const html = this.templateEngine.render({
    templateData: template,
    data,
    requireValidate: true, // Throws error if validation fails
  });
} catch (error) {
  console.error('Template rendering failed:', error.message);
}
```

### Syncing Templates from a Database

```typescript
async syncTemplatesFromDatabase() {
  const templateEngine = this.application.get<IMailTemplateEngine>({
    key: MailKeys.MAIL_TEMPLATE_ENGINE,
  });

  const configRepository = this.application.get<ConfigurationRepository>({
    key: 'repositories.ConfigurationRepository',
  });

  const templateConfigs = await configRepository.find({
    filter: {
      where: {
        code: { inq: ['MAIL_TEMPLATE_WELCOME', 'MAIL_TEMPLATE_VERIFICATION'] },
      },
    },
  });

  templateConfigs.forEach(config => {
    templateEngine.registerTemplate({
      name: config.code,
      content: config.jValue.content,
      options: {
        subject: config.jValue.subject,
        description: config.jValue.description,
      },
    });
    this.logger.info('[syncTemplates] Registered template: %s', config.code);
  });
}
```

## Queue Executors

### Direct Executor

The simplest executor. `DirectMailExecutorHelper` extends `BaseHelper`. Calls the processor function immediately without any queueing. Returns `{ queued: false, ... }` to indicate no queue was used. Throws if `setProcessor()` has not been called. Useful for development environments or when you need guaranteed synchronous email sending.

### Internal Queue Executor

`InternalQueueMailExecutorHelper` extends `BaseHelper`. Uses the in-memory `QueueHelper` from `@venizia/ignis-helpers` with `autoDispatch: true`. Key behaviors:

- Generates job IDs in the format `job_<counter>_<timestamp>`
- Supports delayed jobs via `setTimeout` (stored in a `delayedJobs` Map)
- Retry logic: on failure, retries up to `options.attempts` (default 3) with configurable backoff
- Backoff calculation: `exponential` uses `delay * 2^(attempt-1)`, `fixed` uses the raw delay, no backoff config defaults to 1000ms
- Does not persist jobs across restarts
- Logs queue state changes and individual job lifecycle events

### BullMQ Executor

`BullMQMailExecutorHelper` extends `BaseHelper`. Full-featured Redis-backed queue with:

- Job persistence across restarts
- Distributed worker support
- Configurable retry strategies (exponential by default, with 1000ms base delay)
- Job prioritization
- Delayed job execution
- Job progress tracking via worker callbacks
- `removeOnComplete: true`, `removeOnFail: false` (failed jobs retained for debugging)

**Mode behavior:**

| Mode | Queue Initialized | Workers Created | Can Enqueue | Can Process |
|------|-------------------|-----------------|-------------|-------------|
| `'queue-only'` | Yes | No (skipped in `setProcessor`) | Yes | No |
| `'worker-only'` | No | Yes | No (throws) | Yes |
| `'both'` | Yes | Yes | Yes | Yes |

## Verification Generators

Three generators are registered by `MailComponent`:

- **`NumericCodeGenerator`** -- Implements `IVerificationCodeGenerator`. Generates numeric verification codes of configurable length (e.g., 6-digit `"482917"`)
- **`RandomTokenGenerator`** -- Implements `IVerificationTokenGenerator`. Generates cryptographically random **base64url**-encoded tokens of configurable byte length
- **`DefaultVerificationDataGenerator`** -- Implements `IVerificationDataGenerator`. Composes both generators via `@inject` and produces a full `IVerificationData` object with expiry timestamps

**NumericCodeGenerator:**

Generates cryptographically random numeric codes. Uses `crypto.randomInt(0, 10^length)` to ensure uniform distribution. The result is zero-padded to the requested length via `padStart()` (e.g., code `42` with length 6 becomes `"000042"`).

**RandomTokenGenerator:**

Generates URL-safe random tokens using `crypto.randomBytes(bytes).toString('base64url')`. The output is **base64url-encoded** (not hex). For 32 bytes of input, this produces a 43-character base64url string (not 64 hex characters). Base64url encoding uses characters `A-Z`, `a-z`, `0-9`, `-`, `_` with no padding.

**DefaultVerificationDataGenerator:**

Uses `@inject` to receive both `NumericCodeGenerator` (via `MailKeys.MAIL_VERIFICATION_CODE_GENERATOR`) and `RandomTokenGenerator` (via `MailKeys.MAIL_VERIFICATION_TOKEN_GENERATOR`). Produces a complete verification data object with:
- A short numeric code for manual entry (SMS, email)
- A long random base64url token for URL-based verification
- Separate expiry times: code uses `getExpiryTime(minutes)`, token uses `getExpiryTimeInHours(hours)`
- Generation timestamps in ISO 8601 format
- Attempt counter (set to 0 initially)
- `lastCodeSentAt` set to `now`

**Email verification flow example:**

```typescript
import { BaseService, inject } from '@venizia/ignis';
import {
  MailKeys,
  type IMailService,
  type IVerificationDataGenerator,
} from '@venizia/ignis/mail';

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
    // Generate verification code and token
    const verificationData = this.verificationGenerator.generateVerificationData({
      codeLength: 6, // 6-digit code
      tokenBytes: 32, // 32-byte token
      codeExpiryMinutes: 10, // Code expires in 10 minutes
      tokenExpiryHours: 24, // Token expires in 24 hours
    });

    // Save verification data to database
    // await this.saveVerificationData(userEmail, verificationData);

    // Send verification email
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

**Storing verification data:**

```typescript
const verificationData = this.verificationGenerator.generateVerificationData({
  codeLength: 6, // 6-digit code
  tokenBytes: 32, // 32-byte token -> 43-char base64url string
  codeExpiryMinutes: 10, // Code expires in 10 minutes
  tokenExpiryHours: 24, // Token expires in 24 hours
});

// Store in database
await this.userRepo.update({
  where: { id: userId },
  data: {
    verificationCode: verificationData.verificationCode,
    verificationCodeExpiresAt: new Date(verificationData.codeExpiresAt),
    verificationToken: verificationData.verificationToken,
    verificationTokenExpiresAt: new Date(verificationData.tokenExpiresAt),
  },
});
```

## Security Note

The `MailComponent.createAndBindInstances()` method logs the full `mailOptions` object at `info` level:

```typescript
this.logger.for(this.createAndBindInstances.name).info('Mail Options: %j', mailOptions);
```

This includes sensitive fields such as SMTP passwords, OAuth2 client secrets, refresh tokens, and API keys. Similarly, the queue executor config (which may contain Redis passwords) is logged. In production environments, ensure your logging configuration either:
- Sets the mail component scope to a level higher than `info`
- Uses a log pipeline that redacts sensitive fields
- Strips credential fields before binding the options

## See Also

- [Setup & Configuration](./) -- Quick reference, setup steps, configuration options, and binding keys
- [API Reference](./api) -- Architecture, interfaces, and internals
- [Error Reference](./errors) -- Error codes and troubleshooting
