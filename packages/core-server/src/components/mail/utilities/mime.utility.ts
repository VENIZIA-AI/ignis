import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { getError } from '@venizia/ignis-helpers/core';
import { MailErrorCodes, type IMailAttachment, type IMailMessage } from '../common';

const CRLF = '\r\n';
const BASE64_LINE_LENGTH = 76;

/** RFC 2047 "encoded word" - only non-ASCII values pay for it, so a plain-English subject stays byte-for-byte readable. */
function encodeHeaderValue(value: string): string {
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) > 127) {
      return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
    }
  }

  return value;
}

/** MIME requires encoded body lines capped well under the RFC 5322 998-byte hard limit. */
function foldBase64(base64: string): string {
  const lines: string[] = [];

  for (let index = 0; index < base64.length; index += BASE64_LINE_LENGTH) {
    lines.push(base64.slice(index, index + BASE64_LINE_LENGTH));
  }

  return lines.join(CRLF);
}

/** UTF-8 text (`text`/`html` bodies) must be encoded before folding - unlike {@link encodeBufferBase64}, which folds bytes that are already final. Two names instead of one so the caller can never feed raw bytes through the wrong path and silently double-encode them. */
function encodeTextBase64(text: string): string {
  return foldBase64(Buffer.from(text, 'utf-8').toString('base64'));
}

/** Attachment bytes are already final binary content - only folding applies, no UTF-8 re-encode. */
function encodeBufferBase64(buffer: Buffer): string {
  return foldBase64(buffer.toString('base64'));
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function readAttachmentContent(attachment: IMailAttachment): Promise<Buffer> {
  if (attachment.content !== undefined) {
    if (Buffer.isBuffer(attachment.content)) {
      return attachment.content;
    }

    if (typeof attachment.content === 'string') {
      return Buffer.from(attachment.content, 'utf-8');
    }

    return streamToBuffer(attachment.content);
  }

  if (attachment.path) {
    return readFile(attachment.path);
  }

  return Buffer.alloc(0);
}

/** A literal CR/LF/NUL inside a header-bound value would let it break out of its own header line and forge additional headers or smuggle body content - classic email header injection. Every value spliced into a raw header line is checked here first, so an attempt fails loudly instead of silently reaching the wire. */
function assertNoHeaderInjection(opts: { field: string; value: string }): void {
  const { field, value } = opts;

  if (!value.includes('\r') && !value.includes('\n') && !value.includes('\0')) {
    return;
  }

  throw getError({
    statusCode: 500,
    messageCode: MailErrorCodes.INVALID_CONFIGURATION,
    message: `Invalid Amazon SES message | ${field} contains illegal control characters`,
  });
}

function buildHeaders(message: IMailMessage): string[] {
  const headers: string[] = [];

  if (message.from) {
    assertNoHeaderInjection({ field: 'from', value: message.from });
    headers.push(`From: ${message.from}`);
  }

  if (message.to) {
    const to = Array.isArray(message.to) ? message.to.join(', ') : message.to;
    assertNoHeaderInjection({ field: 'to', value: to });
    headers.push(`To: ${to}`);
  }

  if (message.cc) {
    const cc = Array.isArray(message.cc) ? message.cc.join(', ') : message.cc;
    assertNoHeaderInjection({ field: 'cc', value: cc });
    headers.push(`Cc: ${cc}`);
  }

  if (message.replyTo) {
    assertNoHeaderInjection({ field: 'replyTo', value: message.replyTo });
    headers.push(`Reply-To: ${message.replyTo}`);
  }

  assertNoHeaderInjection({ field: 'subject', value: message.subject });
  headers.push(`Subject: ${encodeHeaderValue(message.subject)}`);
  headers.push('MIME-Version: 1.0');

  if (message.headers) {
    for (const [key, value] of Object.entries(message.headers)) {
      assertNoHeaderInjection({ field: `headers.${key}`, value: key });
      assertNoHeaderInjection({ field: `headers.${key}`, value });
      headers.push(`${key}: ${value}`);
    }
  }

  return headers;
}

/** One text/plain or text/html MIME part. `boundary` omitted only for the single-part, no-attachment case, where the content type belongs on the top-level headers instead of a nested part. */
function textPart(
  boundary: string,
  contentType: 'text/plain' | 'text/html',
  content: string,
): string {
  return [
    `--${boundary}`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    encodeTextBase64(content),
  ].join(CRLF);
}

async function attachmentPart(attachment: IMailAttachment, boundary: string): Promise<string> {
  const content = await readAttachmentContent(attachment);
  const contentType = attachment.contentType ?? 'application/octet-stream';
  assertNoHeaderInjection({ field: 'attachment.contentType', value: contentType });

  if (attachment.filename) {
    assertNoHeaderInjection({ field: 'attachment.filename', value: attachment.filename });
  }

  if (attachment.cid) {
    assertNoHeaderInjection({ field: 'attachment.cid', value: attachment.cid });
  }

  const nameAttribute = attachment.filename ? `; name="${attachment.filename}"` : '';
  const filenameAttribute = attachment.filename ? `; filename="${attachment.filename}"` : '';
  const disposition = attachment.cid ? 'inline' : 'attachment';

  const headerLines = [
    `--${boundary}`,
    `Content-Type: ${contentType}${nameAttribute}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: ${disposition}${filenameAttribute}`,
  ];

  if (attachment.cid) {
    headerLines.push(`Content-ID: <${attachment.cid}>`);
  }

  return [...headerLines, '', encodeBufferBase64(content)].join(CRLF);
}

/** Every boundary is generated the same way - a fixed prefix plus random hex - so no two nested multipart sections in one message can ever collide. */
function newBoundary(label: string): string {
  return `----=_${label}_${randomBytes(12).toString('hex')}`;
}

/**
 * Builds a raw RFC 822 message with zero external dependencies - Amazon SES's `SendEmailCommand`
 * `Content.Simple` shape has no attachment field, so attachments require a raw MIME body. Written
 * by hand instead of depending on `nodemailer`'s `MailComposer` so the `ses` provider never needs
 * the `nodemailer` peer installed at all.
 */
export async function buildRawMimeMessage(message: IMailMessage): Promise<Buffer> {
  const headers = buildHeaders(message);
  const attachments = message.attachments ?? [];
  const hasAttachments = attachments.length > 0;
  const hasBothBodies = Boolean(message.text) && Boolean(message.html);
  const singleContentType = message.html ? ('text/html' as const) : ('text/plain' as const);
  const singleContent = message.html ?? message.text ?? '';

  if (!hasAttachments && !hasBothBodies) {
    headers.push(`Content-Type: ${singleContentType}; charset=UTF-8`);
    headers.push('Content-Transfer-Encoding: base64');
    return Buffer.from([...headers, '', encodeTextBase64(singleContent)].join(CRLF), 'utf-8');
  }

  if (!hasAttachments) {
    const boundary = newBoundary('Alt');
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const parts = [
      textPart(boundary, 'text/plain', message.text ?? ''),
      textPart(boundary, 'text/html', message.html ?? ''),
      `--${boundary}--`,
    ];
    return Buffer.from([...headers, '', parts.join(CRLF)].join(CRLF), 'utf-8');
  }

  const mixedBoundary = newBoundary('Mixed');
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const bodyParts: string[] = [];

  if (hasBothBodies) {
    const altBoundary = newBoundary('Alt');
    const altParts = [
      textPart(altBoundary, 'text/plain', message.text ?? ''),
      textPart(altBoundary, 'text/html', message.html ?? ''),
      `--${altBoundary}--`,
    ];
    bodyParts.push(
      [
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
        altParts.join(CRLF),
      ].join(CRLF),
    );
  } else {
    bodyParts.push(textPart(mixedBoundary, singleContentType, singleContent));
  }

  for (const attachment of attachments) {
    bodyParts.push(await attachmentPart(attachment, mixedBoundary));
  }

  bodyParts.push(`--${mixedBoundary}--`);

  return Buffer.from([...headers, '', bodyParts.join(CRLF)].join(CRLF), 'utf-8');
}
