---
title: The mail types name their shapes instead of any
description: "The mail config, template data and the nodemailer, mailgun.js and SES module types say what they hold: unknown for free-form data, and small interfaces for the parts of the peers the transports call."
packages: ['@venizia/ignis']
migration:
  - id: mail-free-form-data-is-unknown
    symbols: [IGenericMailOptions, MailService.sendTemplate, TemplateEngineService.render, TemplateEngineService.validateTemplateData, TemplateEngineService.renderSimpleTemplate]
    upgrade:
      before: |
        const data: Record<string, AnyType> = user; // an interface-typed object
        await mailService.sendTemplate({ templateName: 'welcome', data, recipients: 'a@b.c' });
      after: |
        // the data is Record<string, unknown>: an interface-typed value needs a spread
        await mailService.sendTemplate({ templateName: 'welcome', data: { ...user }, recipients: 'a@b.c' });
    downgrade:
      steps:
        - "Type the data as Record<string, any> again; it is accepted everywhere."
  - id: mailgun-config-is-typed
    symbols: [TMailgunConfig]
    upgrade:
      before: |
        const config: TMailgunConfig = clientOptions; // TMailgunConfig was any & { domain: string }, so anything fit
      after: |
        // username and key are required by the type (the transport already threw without them); an
        // interface-typed value, such as mailgun.js MailgunClientOptions, needs a spread
        const config: TMailgunConfig = { ...clientOptions, domain: 'mg.example.com' };
    downgrade:
      steps:
        - "Type the config as any & { domain: string } again."
    data: "The runtime check is unchanged: a missing username, key or domain still throws when the transport is built."
  - id: mail-peer-module-types
    symbols: [TNodemailerModule, TMailgunModule, TAmazonSesModule, TAmazonSesClient, INodemailerTransporter, IMailgunMessagesClient, IAmazonSesClient, IAmazonSesSendEmailInput]
    upgrade:
      before: |
        // a test double or a wrapper handed over as the peer module; every member was any
        const module: TNodemailerModule = { createTransport: () => fakeTransporter };
      after: |
        // the module types name what the transport calls: the real nodemailer, mailgun.js and
        // @aws-sdk/client-sesv2 modules fit as they are. A double returns a value with sendMail, verify and close.
        const module: TNodemailerModule = { createTransport: () => ({ sendMail, verify, close }) };
    downgrade:
      steps:
        - "Hand over the module as before: the older types accepted any shape, so a double that fit the newer types fits the older ones."
  - id: mail-type-guards-take-unknown
    symbols: [MailTypeUtility.isTransport, MailTypeUtility.isValidOptions]
    upgrade:
      before: |
        MailTypeUtility.isTransport(value); // value: any
      after: |
        // non-breaking: the parameter is unknown, every call still compiles
        MailTypeUtility.isTransport(value);
    downgrade:
      steps:
        - "Nothing to restore: a call that compiled with unknown compiled with any."
---

# Changelog - 2026-11-15

## The mail types name their shapes instead of any

<Badge type="warning" text="Breaking Change" />

**In one line.** The mail types say what they hold, and nothing changes at runtime except one narrowing in the SES transport.

## What changed

- **Free-form data.** `IGenericMailOptions.config` and the `data` of `sendTemplate` and the template engine are `Record<string, unknown>`.
- **Mailgun.** `TMailgunConfig` lists `username`, `key`, `domain` and `url`; other options stay allowed.
- **Peer modules.** `TNodemailerModule`, `TMailgunModule` and `TAmazonSesModule` describe the parts the transports call. The real `nodemailer`, `mailgun.js` and `@aws-sdk/client-sesv2` modules fit them.
- **SES.** The transport reports `messageId` only when the SES answer carries it as a string.

## Who is affected

- **Code that passes an interface-typed value as template data or as a Mailgun config, or hands over a hand-written peer module.** See the migration above.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
await mailService.sendTemplate({ templateName: 'welcome', data: user, recipients: 'a@b.c' });
```

**After:**

```typescript
await mailService.sendTemplate({ templateName: 'welcome', data: { ...user }, recipients: 'a@b.c' });
```
