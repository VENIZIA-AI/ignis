# Configuration Options

## Transport Options (`MailKeys.MAIL_OPTIONS`)

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `provider` | `'nodemailer' \| 'mailgun' \| 'custom'` | Yes | Transport provider type |
| `from` | `string` | No | Default sender email address |
| `fromName` | `string` | No | Default sender display name |
| `config` | `object` | Yes | Provider-specific transport configuration |

**Nodemailer with Simple SMTP Auth:**

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

**Mailgun:**

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

> [!TIP]
> For Gmail OAuth2 setup, you need to create credentials in Google Cloud Console and generate a refresh token. See [Nodemailer OAuth2 documentation](https://nodemailer.com/smtp/oauth2/) for details.

::: details TMailOptions -- Full Reference
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

// Custom Transport Options
interface ICustomMailOptions {
  provider: 'custom';
  from?: string;
  fromName?: string;
  config: IMailTransport; // Must implement send() and verify()
}

// Union type
type TMailOptions =
  | INodemailerMailOptions
  | IMailgunMailOptions
  | ICustomMailOptions
  | IGenericMailOptions;
```
:::

## Queue Executor Options (`MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG`)

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `type` | `'direct' \| 'internal-queue' \| 'bullmq'` | Yes | Queue executor type |
| `internalQueue` | `object` | For `internal-queue` | Internal queue settings |
| `bullmq` | `object` | For `bullmq` | BullMQ settings |

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

> [!NOTE]
> Choose the right queue executor for your environment:
> - Use `direct` for development or low-volume applications
> - Use `internal-queue` for single-instance applications with moderate volume
> - Use `bullmq` for distributed systems or high-volume applications

::: details IMailQueueExecutorConfig -- Full Reference
```typescript
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
:::
