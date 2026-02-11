# Architecture Overview

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

- **`MailComponent`**: Initializes and registers all mail services, transporters, and queue executors
- **`MailService`**: Provides methods to send single emails, batch emails, and template-based emails
- **`TemplateEngineService`**: Manages email templates with simple `{{variable}}` substitution
- **Verification Generators**: Generate verification codes, tokens, and data for email verification flows
- **Transport Providers**: Factory functions that create transport instances based on configuration
- **Queue Executor Providers**: Factory functions that create queue executor instances based on configuration

**Tech Stack:**

- **Nodemailer**: SMTP-based email sending
- **Mailgun**: Mailgun API client
- **BullMQ** (optional): Redis-backed queue for distributed processing
- **Handlebars-style Templates**: Simple `{{variable}}` syntax for email templates
