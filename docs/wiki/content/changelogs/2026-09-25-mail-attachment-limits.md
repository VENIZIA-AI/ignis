---
title: Mail Attachments Read Only Under a Root, and Stop at a Size Limit
description: "An attachment path is read only inside the new attachmentRoot option, a text or html body must be a string, a new maxAttachmentBytes option (default 25 MB) caps a message's attachments, and a failed send no longer echoes the raw error text."
packages: ['@venizia/ignis']
---

# Changelog - 2026-09-25

The mail component no longer reads a file or URL a caller names, and no longer buffers attachments without limit. Every change applies to every transport: Nodemailer, Mailgun and Amazon SES.

## An attachment `path` is read only under `attachmentRoot`

<Badge type="danger" text="Security" /> <Badge type="danger" text="Breaking" />

**In one line.** `attachment.path` no longer reads any file the caller names. Set `attachmentRoot`, or pass the bytes as `content`.

Before, `{ path: '/etc/passwd' }` put that file on the email, so an app that copied `attachments` from a request body let its caller mail any file the process could read.

- With no `attachmentRoot` set, any `path` is refused.
- With `attachmentRoot` set, a `path` is resolved against it and refused if it lands outside. Symlinks and `..` are followed first, so neither can escape.
- A missing file, a directory, an unreadable file and an escape all answer the same error and message, so a caller cannot probe which files exist.
- Nodemailer's `href` (a URL) and `raw` sources are refused too. `path: 'https://...'` and `path: 'data:...'` no longer work: fetch or decode the bytes yourself and pass them as `content`.
- A built-in transport called directly, outside `MailService`, has no root and refuses every `path`.
- An attachment read from `path` keeps the file's name as `filename` and gets a `contentType` from its extension, when you set neither.

Every refusal is `400 core.mail.attachment_path_refused`. `attachmentRoot` must be an absolute path to an existing directory; anything else fails the application at startup with `Invalid mail options | attachmentRoot ...`.

**Migration.** Pick one:

```typescript
// Option 1 - keep path, and name the one directory it may read from
this.component(MailComponent, {
  options: {
    provider: MailProviders.NODEMAILER,
    config: { host, port, secure, auth },
    attachmentRoot: '/srv/app/mail-assets',
  },
});

await mailService.send({
  to: 'user@example.com',
  subject: 'Hello',
  html: '<img src="cid:logo">',
  attachments: [{ path: 'logo.png', cid: 'logo' }], // relative to the root
});

// Option 2 - pass the bytes yourself
attachments: [{ filename: 'logo.png', content: await readFile('./assets/logo.png'), cid: 'logo' }], // readFile from node:fs/promises
```

An absolute `path` still works when it lies inside the root. See [Attachments](/extensions/components/mail/usage#attachments).

## `text` and `html` must be strings

<Badge type="danger" text="Security" /> <Badge type="danger" text="Breaking" />

**In one line.** A body that is not a string (a `Buffer`, a stream, a number, `{ path }`, `{ href }`, any object) is refused. Pass the content as a string.

Nodemailer reads `html: { path: '/etc/passwd' }` like an attachment path and sends that file as the body. `MailService.send()` now refuses a non-string `text` or `html` with `400 core.mail.body_source_refused`, before any transport runs. `null` and `undefined` count as absent.

**Migration.** `html: buffer.toString('utf-8')`, or `html: await readFile('./templates/welcome.html', 'utf-8')`. String bodies are unchanged.

## Attachments stop at `maxAttachmentBytes`

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A message's attachments may carry at most `maxAttachmentBytes` bytes together, 25 MB by default.

Before, every attachment was read whole into memory with no limit.

- Buffers, `Uint8Array` and strings are checked by length before the send. A file under `attachmentRoot` is checked by size before it is opened and again while it is read. A Node `Readable` or web `ReadableStream` is checked per chunk, and the read stops once the total passes the limit.
- Over the limit, `send()` throws `413 core.mail.attachment_too_large`.
- Any other `content` (`{ path }`, a number, a plain object) answers `400 core.mail.invalid_configuration`, not a `500`.
- `maxAttachmentBytes` must be a positive integer; anything else (`NaN`, `0`, `Infinity`, a string) fails the application at startup.
- Nodemailer and Mailgun now receive a stream attachment's bytes, buffered whole within the limit, instead of the stream.

```typescript
{
  provider: MailProviders.AMAZON_SES,
  config: { region: 'us-east-1' },
  maxAttachmentBytes: 35 * 1024 * 1024,
}
```

**Affected:** apps that send more than 25 MB of attachments in one message (raise the limit), and apps that pass streams to Nodemailer or Mailgun.

The limit counts decoded bytes. Base64 makes the message about 37% larger, so the 25 MB default becomes about 34 MB, over the 25 MB message cap of Gmail and Mailgun. For those, set `maxAttachmentBytes: 18 * 1024 * 1024`. Plan memory for roughly four times `maxAttachmentBytes` per send in flight. `sendBatch()` runs five sends at once by default.

## A failed send no longer echoes the raw error

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `core.mail.send_failed`, `core.mail.batch_send_failed` and `core.mail.verification_failed` now carry a fixed message, and the original error moves to `cause`.

Before, the message was `Failed to send email: <error text>`, which could put a server path in the response. Now it is `Failed to send email` (and `Failed to send batch emails`, `Mail transport verification failed`). The original error is logged and rides in `cause`, which only a `development` response shows.

**Affected:** code that parsed the text after `Failed to send email:`. Read `error.cause` instead.
