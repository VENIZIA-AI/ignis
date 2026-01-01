# Mail Component

Flexible email sending system with support for multiple transports, templating, and queue-based processing.

## Quick Reference

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

### Key Binding Keys

| Key                                     | Purpose                                        |
| --------------------------------------- | ---------------------------------------------- |
| `MailKeys.MAIL_OPTIONS`                 | Mail transport configuration (required)        |
| `MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG`   | Queue executor configuration (required)        |
| `MailKeys.MAIL_SERVICE`                 | Main mail service instance                     |
| `MailKeys.MAIL_TEMPLATE_ENGINE`         | Template engine service                        |
| `MailKeys.MAIL_TRANSPORT_INSTANCE`      | Transport instance (created by component)      |
| `MailKeys.MAIL_QUEUE_EXECUTOR_INSTANCE` | Queue executor instance (created by component) |

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

## Architecture Components

- **`MailComponent`**: Initializes and registers all mail services, transporters, and queue executors
- **`MailService`**: Provides methods to send single emails, batch emails, and template-based emails
- **`TemplateEngineService`**: Manages email templates with simple `{{variable}}` substitution
- **Verification Generators**: Generate verification codes, tokens, and data for email verification flows
- **Transport Providers**: Factory functions that create transport instances based on configuration
- **Queue Executor Providers**: Factory functions that create queue executor instances based on configuration

## Implementation Details

### Tech Stack

- **Nodemailer**: SMTP-based email sending
- **Mailgun**: Mailgun API client
- **BullMQ** (optional): Redis-backed queue for distributed processing
- **Handlebars-style Templates**: Simple `{{variable}}` syntax for email templates

### Configuration

The Mail component requires two main configurations to be bound before registering the component:

1. **`MailKeys.MAIL_OPTIONS`**: Transport configuration
2. **`MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG`**: Queue executor configuration

**Environment Variables (for Nodemailer with OAuth2):**

```
APP_ENV_MAIL_HOST=smtp.gmail.com
APP_ENV_MAIL_PORT=465
APP_ENV_MAIL_SECURE=true
APP_ENV_MAIL_USER=your-email@gmail.com
APP_ENV_MAIL_CLIENT_ID=your-oauth2-client-id
APP_ENV_MAIL_CLIENT_SECRET=your-oauth2-client-secret
APP_ENV_MAIL_REFRESH_TOKEN=your-oauth2-refresh-token
```

::: tip
For Gmail OAuth2 setup, you need to create credentials in Google Cloud Console and generate a refresh token. See [Nodemailer OAuth2 documentation](https://nodemailer.com/smtp/oauth2/) for details.
:::

### Code Samples

#### 1. Basic Setup with Nodemailer

The simplest way to set up the Mail component is by creating a custom component that wraps `MailComponent` with the necessary bindings.

```typescript
// src/components/mail/component.ts
import {
  BaseApplication,
  BaseComponent,
  Binding,
  CoreBindings,
  inject,
  MailComponent,
  MailKeys,
  MailProviders,
  applicationEnvironment,
  toBoolean,
} from '@venizia/ignis';

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

Then register it in your application:

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

#### 2. Nodemailer with Simple SMTP Auth

For basic SMTP authentication (username/password):

```typescript
{
  provider: MailProviders.NODEMAILER,
  from: 'noreply@example.com',
  fromName: 'My App',
  config: {
    host: 'smtp.example.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: 'smtp-username',
      pass: 'smtp-password',
    },
  },
}
```

#### 3. Mailgun Configuration

```typescript
{
  provider: MailProviders.MAILGUN,
  from: 'noreply@example.com',
  fromName: 'My App',
  config: {
    domain: 'mg.example.com',
    apiKey: process.env.MAILGUN_API_KEY,
    url: 'https://api.mailgun.net', // Optional, defaults to US region
  },
}
```

#### 4. Queue Executor Configurations

**Direct Executor (No Queue):**

```typescript
{
  type: 'direct',
}
```

**Internal Queue Executor:**

```typescript
{
  type: 'internal-queue',
  internalQueue: {
    identifier: 'mail-verification-queue',
  },
}
```

**BullMQ Executor:**

```typescript
{
  type: 'bullmq',
  bullmq: {
    redis: {
      name: 'mail-redis',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: process.env.REDIS_PORT ?? 6379,
      password: process.env.REDIS_PASSWORD ?? '',
      database: 0,
      autoConnect: true,
    },
    queue: {
      identifier: 'mail-queue-executor',
      name: 'mail-verification-queue',
    },
    mode: 'both', // 'queue-only' | 'worker-only' | 'both'
  },
}
```

**BullMQ Executor Mode Options:**

- **`queue-only`**: Only enqueue jobs, no workers (useful for API servers that just add jobs)
- **`worker-only`**: Only process jobs, cannot enqueue (useful for dedicated worker servers)
- **`both`**: Can both enqueue and process jobs (useful for single-server deployments)

#### 5. Sending Emails

Inject the `MailService` to send emails:

```typescript
import { BaseService, inject, MailKeys, IMailService } from '@venizia/ignis';

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

#### 6. Using Templates

Register and use email templates:

```typescript
import { BaseService, inject, MailKeys, IMailTemplateEngine, IMailService } from '@venizia/ignis';

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

#### 7. Batch Email Sending

Send multiple emails with controlled concurrency:

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

#### 8. Email Verification Flow

Using the verification data generators:

```typescript
import {
  BaseService,
  inject,
  MailKeys,
  IMailService,
  IVerificationDataGenerator,
} from '@venizia/ignis';

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

#### 9. Template Validation

Ensure all required template variables are provided:

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

#### 10. Syncing Templates from Database

For applications that store templates in a database:

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

## API Specifications

### Mail Options Configuration

```typescript
// Nodemailer Options
interface INodemailerMailOptions {
  provider: 'nodemailer';
  from?: string;
  fromName?: string;
  config: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      type?: 'oauth2' | 'login';
      user: string;
      pass?: string; // For simple auth
      // OAuth2 specific
      clientId?: string;
      clientSecret?: string;
      refreshToken?: string;
    };
  };
}

// Mailgun Options
interface IMailgunMailOptions {
  provider: 'mailgun';
  from?: string;
  fromName?: string;
  config: {
    domain: string;
    apiKey: string;
    url?: string; // Optional, defaults to US region
  };
}

// Queue Executor Configuration
interface IMailQueueExecutorConfig {
  type: 'direct' | 'internal-queue' | 'bullmq';

  // For internal-queue type
  internalQueue?: {
    identifier: string;
  };

  // For bullmq type
  bullmq?: {
    redis: {
      name: string;
      host: string;
      port: string | number;
      password: string;
      user?: string;
      database?: number;
      autoConnect?: boolean;
      maxRetry?: number;
    };
    queue: {
      identifier: string;
      name: string;
    };
    mode: 'queue-only' | 'worker-only' | 'both';
  };
}
```

### IMailService Interface

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

### IMailMessage Interface

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
}
```

### IMailTemplateEngine Interface

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
  registerTemplate(opts: { name: string; content: string; options?: Partial<ITemplate> }): void;

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

## Best Practices

1. **Always bind configuration before registering MailComponent**: The component will throw an error if `MailKeys.MAIL_OPTIONS` is not bound.

2. **Use environment variables for sensitive data**: Never hardcode SMTP credentials or API keys in your code.

3. **Choose the right queue executor**:
   - Use `direct` for development or low-volume applications
   - Use `internal-queue` for single-instance applications with moderate volume
   - Use `bullmq` for distributed systems or high-volume applications

4. **Validate templates in development**: Use `requireValidate: true` during development to catch missing template variables early.

5. **Handle send failures gracefully**: Always check the `success` field in `IMailSendResult` and implement proper error handling.

6. **Use batch sending for bulk operations**: The `sendBatch` method with controlled concurrency prevents overwhelming your mail server.

7. **Verify transport on startup**: Call `mailService.verify()` during application startup to ensure mail configuration is correct.
