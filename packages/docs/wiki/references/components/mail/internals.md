# Component Internals

::: details Transport Layer

The `MailTransportProvider` is a factory function that creates the appropriate transport based on the `provider` field in `MailKeys.MAIL_OPTIONS`:

- **`'nodemailer'`** -- Creates a `NodemailerTransportHelper` backed by `nodemailer` with SMTP or OAuth2 auth
- **`'mailgun'`** -- Creates a `MailgunTransportHelper` using the Mailgun HTTP API
- **`'custom'`** -- Expects the `config` value to implement `IMailTransport` directly (must have `send()` and `verify()`)

Both built-in transports implement `IMailTransport`:

```typescript
interface IMailTransport {
  send(message: IMailMessage): Promise<IMailSendResult>;
  verify(): Promise<boolean>;
  close?(): Promise<void>;
}
```
:::

::: details Template Engine

`TemplateEngineService` provides a simple `{{variable}}` substitution engine:

- **`registerTemplate()`** -- Store a named template with optional subject and description
- **`render()`** -- Render a template by name or raw string, replacing `{{key}}` with data values
- **`validateTemplateData()`** -- Check if all `{{key}}` placeholders have corresponding data entries
- **`getTemplate()` / `listTemplates()` / `hasTemplate()` / `removeTemplate()`** -- Template registry management

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

Syncing templates from a database:

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
:::

::: details Queue Executors

The `MailQueueExecutorProvider` creates the executor based on the `type` field in `MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG`:

- **`DirectMailExecutorHelper`** (`type: 'direct'`) -- Executes email sending immediately, no queueing
- **`InternalQueueMailExecutorHelper`** (`type: 'internal-queue'`) -- In-memory queue backed by the Queue helper
- **`BullMQMailExecutorHelper`** (`type: 'bullmq'`) -- Redis-backed queue using BullMQ with configurable worker modes

All executors implement `IMailQueueExecutor`:

```typescript
interface IMailQueueExecutor {
  enqueueVerificationEmail(email: string, options?: IMailQueueOptions): Promise<IMailQueueResult>;
  setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void;
}
```

Queue options for controlling job behavior:

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
:::

::: details Verification Generators

Three generators registered by `MailComponent`:

- **`NumericCodeGenerator`** -- Generates numeric verification codes of configurable length (e.g., 6-digit `"482917"`)
- **`RandomTokenGenerator`** -- Generates cryptographically random hex tokens of configurable byte length
- **`DefaultVerificationDataGenerator`** -- Composes both generators and produces a full `IVerificationData` object with expiry timestamps

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
:::

::: details IMailService Interface

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
:::

::: details IMailMessage Interface

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
:::

::: details IMailTemplateEngine Interface

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
:::
