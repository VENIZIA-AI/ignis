---
title: Mail escapes template values, checks headers for every transport, and cleans up on stop
description: "Template values are HTML-escaped, a message is checked for header injection once for every transport, failed BullMQ mail jobs expire, the mail component closes its executor and transport when the app stops, and Mailgun sends inline images."
packages: ['@venizia/ignis']
migration:
  - id: mail-template-escaping
    symbols: [MailService, MailTemplateService.render]
    upgrade:
      before: |
        <p>{{greetingHtml}}</p>
      after: |
        <p>{{{greetingHtml}}}</p>
    downgrade:
      steps:
        - "Use {{value}} again for the placeholders you switched to {{{value}}}, and remove any hand escaping you added."
  - id: mail-send-template-options
    symbols: [MailService.sendTemplate, MailService.send]
    upgrade:
      steps:
        - "Where sendTemplate options carried to or html, call MailService.send with the recipients and body you want; sendTemplate keeps the rendered body and its recipients."
        - "Send no address, subject or header value with a line break, CR or NUL; it now answers 400 core.mail.invalid_header on every transport."
    downgrade:
      steps:
        - "Call sendTemplate with options.to or options.html again; the older version let them replace the recipients and the rendered body."
    data: "Failed BullMQ mail jobs now expire after seven days (1000 at most). Jobs already kept stay until the next cleanup; nothing is migrated."
  - id: mail-component-stop-and-retention
    symbols: [MailComponent, MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG]
    upgrade:
      steps:
        - "Nothing to change: the component closes its executor and transport on stop, and enqueueVerificationEmail throws once the executor is closed."
        - "If you send through a transport you built yourself instead of MailService, validate headers with MailHeaderUtility.assert before transport.send; only MailService.send checks them."
    downgrade:
      steps:
        - "Nothing to undo. A stop in the older version leaves the queue executor and transport open, and failed BullMQ mail jobs stay in Redis forever."
    data: "Failed BullMQ mail jobs older than seven days leave Redis on their own after the upgrade; downgrading does not bring them back."
---

# Changelog - 2026-11-12

## Mail escapes template values, checks headers for every transport, and cleans up on stop

<Badge type="warning" text="Breaking Change" /> <Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** A user name such as `<a href=...>` no longer becomes live markup in a template mail, a line break in a subject or header is refused whatever the transport, and nothing the mail component opened outlives the app.

## What changed

- **Template values are escaped.** <code v-pre>{{value}}</code> is HTML-escaped; <code v-pre>{{{value}}}</code> inserts it as it is, for markup you wrote. `render()` takes `format: MailTemplateFormats.HTML` (the default) or `TEXT`; the subject of `sendTemplate()` is rendered as `TEXT`, so it is never escaped. A key is read from own properties only, so <code v-pre>{{constructor}}</code> stays unresolved.
- **One header check, for every transport.** `MailService.send()` refuses an address, subject or header value with a line break, CR or NUL, a non-string header value and a header name that is not printable ASCII without a colon, with `400` `core.mail.invalid_header`. Before, only the Amazon SES transport checked, and Nodemailer and Mailgun relied on their libraries. A transport you call directly, without `MailService`, skips the check.
- **`sendTemplate()` keeps what it renders.** `options.to` and `options.html` no longer replace the recipients or the rendered body, and `options.requireValidate` is no longer sent as a message field.
- **`fromName` is escaped.** A quote or backslash in `fromName` cannot end the display name early.
- **Failed jobs expire.** BullMQ mail jobs that fail are kept seven days and at most 1000 (`MailDefaults.FAILED_JOB_RETENTION`). They were kept forever, each with a recipient address. Queuing a mail logs the job id at `debug`, no longer the address.
- **A clean stop.** The mail component registers stop hooks that close the queue executor, then the transport. The internal queue executor arms no retry timer after `close()`, and `enqueueVerificationEmail()` throws once it is closed.
- **Mailgun inline images.** An attachment with a `cid` goes to Mailgun's `inline` field under that name, and every attachment keeps its `contentType`. Before, inline images arrived as plain attachments.

## Who is affected

- **Apps that put markup in template data.** Use <code v-pre>{{{name}}}</code> for the values that are markup you trust, and escape nothing yourself for the rest. A value you escaped by hand is now escaped twice.
- **Apps that relied on `options.to` or `options.html` in `sendTemplate()`.** Call `send()` instead.
- **Apps that send a header or address with a line break.** It now answers `400` instead of reaching the transport.
- **Apps that run a BullMQ mail queue.** Failed jobs older than seven days leave Redis on their own.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> <code v-pre>{{value}}</code> now HTML-escapes in the body. A template that inserted markup through a data value must switch that placeholder to <code v-pre>{{{value}}}</code>.

**Before:**

```html
<p>{{greetingHtml}}</p>
```

**After:**

```html
<p>{{{greetingHtml}}}</p>
```

See the [mail usage page](/extensions/components/mail/usage#how-rendering-works) and the [API reference](/extensions/components/mail/api#protected-methods-mailservice).
