# Setup Guide

### Step 1: Bind Configuration

The recommended approach is to create a wrapper component that binds the mail options and queue executor config, then registers `MailComponent` internally.

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

### Step 3: Use in Services

**Sending emails:**

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

**Using templates:**

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

**Email verification flow:**

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
