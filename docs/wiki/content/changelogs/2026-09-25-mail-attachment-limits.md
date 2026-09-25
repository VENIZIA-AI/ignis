---
title: Mail Attachments Read Only Under a Root, and Stop at a Size Limit
description: "An attachment path is read only inside the new attachmentRoot option and refused without it, a text or html body must be a string, a new maxAttachmentBytes option (default 25 MB) caps the attachments of one message, and a failed send no longer echoes the raw error text."
---

# Changelog - 2026-09-25

The mail component no longer reads a file or URL a caller names, and no longer buffers attachments without limit. Every change applies to every transport - Nodemailer, Mailgun and Amazon SES.

| Change | Who is affected |
|---|---|
| [An attachment `path` is read only under `attachmentRoot`](#an-attachment-path-is-read-only-under-attachmentroot) | Applications that send an attachment by `path` |
| [`text` and `html` must be strings](#text-and-html-must-be-strings) | Applications that pass anything but a string as the body |
| [Attachments stop at `maxAttachmentBytes`](#attachments-stop-at-maxattachmentbytes) | Applications that send more than 25 MB of attachments in one message, or stream them |
| [A failed send no longer echoes the raw error](#a-failed-send-no-longer-echoes-the-raw-error) | Code that reads the text of `core.mail.send_failed` |
| [Every breaking change at a glance](#every-breaking-change-at-a-glance) | Everyone upgrading |

## An attachment `path` is read only under `attachmentRoot`

<Badge type="danger" text="Security" /> <Badge type="danger" text="Breaking" />

**In one line.** `attachment.path` no longer reads any file the caller names - set `attachmentRoot`, or pass the bytes as `content`.

Before, `{ path: '/etc/passwd' }` put that file on the email. An application that copied `attachments` from a request body let its caller mail any file the process could read. Nodemailer and the SES transport read `path` themselves; the Mailgun transport forwarded the `path` string as the attachment data.

Now `MailService.send()` reads every attachment into `content` bytes before the transport sees it:

- With no `attachmentRoot` set, any `path` is refused.
- With `attachmentRoot` set, a `path` is resolved against it and refused if it lands outside. Symlinks and `..` are followed first, so neither can escape.
- A missing file, a directory, a FIFO, an unreadable file and an escape all answer the same error and the same message, so a caller cannot probe which files exist.
- Nodemailer's `href` (a URL) and `raw` sources are refused too. The Nodemailer transport also sets Nodemailer's own `disableFileAccess` and `disableUrlAccess`.
- An attachment read from `path` keeps the file's name as `filename`, and gets a `contentType` from its extension, when you set neither.

Every refusal is `400 core.mail.attachment_path_refused`. `attachmentRoot` must be an absolute path to an existing directory; anything else fails the application at startup with `Invalid mail options | attachmentRoot ...`.

**Who is affected:** applications that send an attachment by `path`. Those sends now fail until you migrate. Messages with `content` attachments, or none, behave as before.

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
  attachments: [{ path: 'logo.png', cid: 'logo' }], // relative to the root; filename and type follow from it
});

// Option 2 - pass the bytes yourself
attachments: [{ filename: 'logo.png', content: await readFile('./assets/logo.png'), cid: 'logo' }], // readFile from node:fs/promises
```

An absolute `path` still works when it lies inside the root. A `path` is always a file name now: Nodemailer's `path: 'https://...'` (a URL fetch) and `path: 'data:...'` (a data URI) no longer work - fetch or decode the bytes yourself and pass them as `content`. A built-in transport called directly, outside `MailService`, has no root and refuses every `path`.

See [Attachments](/extensions/components/mail/usage#attachments).

## `text` and `html` must be strings

<Badge type="danger" text="Security" /> <Badge type="danger" text="Breaking" />

**In one line.** A body that is not a string - a `Buffer`, a stream, a number, `{ path }`, `{ href }`, any object - is refused. Pass the content itself as a string.

Nodemailer treats `html: { path: '/etc/passwd' }` like an attachment path: it reads that file and sends it as the body. `IMailMessage` types `text` and `html` as strings, but a caller that forwards a request body is not bound by that type.

Now `MailService.send()` refuses a `text` or `html` that is not a string with `400 core.mail.body_source_refused`, before any transport runs. The Nodemailer transport checks the same when called directly. `null` and `undefined` count as absent, so a body built from a database row with `html: null` still sends its `text`.

**Who is affected:** code that passes a `Buffer`, a stream or any other non-string as the body. String bodies are unchanged.

**Migration.** Pass the string: `html: buffer.toString('utf-8')`, or `html: await readFile('./templates/welcome.html', 'utf-8')`.

## Attachments stop at `maxAttachmentBytes`

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A message's attachments may carry at most `maxAttachmentBytes` bytes, 25 MB by default.

Before, every attachment was read whole into memory with no limit. A 200 MB attachment stayed resident for the whole send, with a base64 copy on top.

The limit counts all attachments of one message together, so it also bounds each one:

| Content | When it is checked |
|---|---|
| `Buffer`, `Uint8Array` or string | Before the send, by byte length |
| File under `attachmentRoot` | By its size on disk before it is opened, then again while it is read - a file that grows in between is still capped |
| Node `Readable` or web `ReadableStream` | Per chunk while it drains - the read stops as soon as the total passes the limit, and the rest is never buffered |

Over the limit, `send()` throws `413 core.mail.attachment_too_large`. Any other `content` - `{ path }`, a number, a plain object - answers `400 core.mail.invalid_configuration` instead of a `500`. When a send is refused for any reason, every attachment stream it was given is destroyed, so no file descriptor stays open.

`maxAttachmentBytes` must be a positive integer; anything else (`NaN`, `0`, `Infinity`, a string) fails the application at startup.

**Who is affected:**

- Applications that send more than 25 MB of attachments in one message. Raise the limit on the mail options.
- Applications that pass streams to Nodemailer or Mailgun. Those transports now receive the stream's bytes, buffered whole (within the limit), instead of the stream itself.

```typescript
{
  provider: MailProviders.AMAZON_SES,
  config: { region: 'us-east-1' },
  maxAttachmentBytes: 35 * 1024 * 1024,
}
```

The limit counts decoded bytes. Base64 makes the message about 37% larger on the wire, so the 25 MB default becomes about 34 MB - over the 25 MB message cap of Gmail and of Mailgun. For those, set `maxAttachmentBytes: 18 * 1024 * 1024`. Plan memory for roughly four times `maxAttachmentBytes` per send in flight: the bytes, their base64 copy, and the built message. `sendBatch()` runs five sends at once by default.

## A failed send no longer echoes the raw error

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `core.mail.send_failed`, `core.mail.batch_send_failed` and `core.mail.verification_failed` now carry a fixed message; the original error moves to `cause`.

Before, the message was `Failed to send email: <error text>`, and the error envelope sends it in every environment. A stream error such as `ENOENT: no such file or directory, open '/srv/...'` put a server path in the response. Now the message is `Failed to send email` (and `Failed to send batch emails`, `Mail transport verification failed`). The original error is logged, and rides in `cause`, which only a `development` response shows.

**Who is affected:** code that parsed the text after `Failed to send email:`. Read `error.cause` instead.

## Every breaking change at a glance

| Before | Now | What to do |
|---|---|---|
| `attachment.path` read any file | Refused without `attachmentRoot`, and outside it | Set `attachmentRoot`, or pass `content` |
| `path: 'https://...'` or `path: 'data:...'` (Nodemailer) | Refused - a `path` is a file under the root | Fetch or decode the bytes, pass `content` |
| `href` and `raw` attachments (Nodemailer) | Refused | Pass `content` |
| A built-in transport called directly read `path` | It refuses every `path` | Send through `MailService`, or pass `content` |
| `text`/`html` as a `Buffer`, stream or object | Refused (`null` still counts as absent) | Pass a string |
| No attachment size limit | 25 MB per message by default | Raise `maxAttachmentBytes` if you need more |
| Nodemailer and Mailgun streamed a stream attachment | They receive its bytes, buffered within the limit | Nothing, unless you relied on streaming past the limit |
| `send_failed` text carried the raw error | Fixed text; the error is in `cause` | Read `error.cause` |
