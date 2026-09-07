import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { getError } from '@venizia/ignis-helpers/core';
import { MailErrorCodes, type IMailAttachment, type IMailMessage } from '../common';
import { splitAddressList } from './address.utility';

const CRLF = '\r\n';
const BASE64_LINE_LENGTH = 76;
/** RFC 5322 recommends folding well under its own 998-byte hard limit; 78 matches common MTA
 * practice. This is a *soft* preferred width, not a hard requirement - {@link foldHeaderLine}
 * only forces a line break past it when a natural whitespace break point exists nearby. */
const MAX_HEADER_LINE_LENGTH = 78;
/** The real hard requirement: SES rejects any raw-message physical line at or over 1000 bytes.
 * A 10-byte margin below that, and comfortably under RFC 5322's own 998-octet hard limit. Only
 * an unbroken token that would itself cross this line forces {@link foldHeaderLine}'s
 * content-altering hard-wrap fallback - below it, one long line is safer than corrupting an
 * atomic value (a single very long address, an unbroken encoded-word) by splitting it. */
const MAX_HEADER_HARD_LIMIT = 990;
/** RFC 2047 caps one encoded-word (`=?charset?B?...?=` included) at 75 characters. */
const ENCODED_WORD_MAX_LENGTH = 75;

function isAscii(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) > 127) {
      return false;
    }
  }

  return true;
}

/**
 * RFC 2047 §5(3) requires each encoded-word to carry whole characters - a multi-byte UTF-8
 * sequence split across two encoded-words decodes to mojibake or invalid UTF-8 on either side of
 * the cut. `bytesPerChunk` is a fixed byte budget, not a character-aligned one, so after slicing
 * at that budget we walk the boundary back over any UTF-8 continuation bytes (`10xxxxxx`, i.e.
 * `byte & 0xC0 === 0x80`) until it lands on the leading byte of a character. `bytesPerChunk` is
 * always far larger than the longest UTF-8 sequence (4 bytes), so this walk-back can never
 * consume the whole chunk. Words are joined with a single space - the required separator between
 * adjacent encoded-words, and also a valid header-folding point.
 */
function encodeWord(text: string): string {
  const prefix = '=?UTF-8?B?';
  const suffix = '?=';
  const maxPayloadChars = ENCODED_WORD_MAX_LENGTH - prefix.length - suffix.length;
  const bytesPerChunk = Math.floor(maxPayloadChars / 4) * 3;
  const bytes = Buffer.from(text, 'utf-8');
  const words: string[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    let end = Math.min(offset + bytesPerChunk, bytes.length);

    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }

    const chunk = bytes.subarray(offset, end);
    words.push(`${prefix}${chunk.toString('base64')}${suffix}`);
    offset = end;
  }

  return words.join(' ');
}

/** Only non-ASCII values pay for RFC 2047 encoding, so a plain-English subject or custom header
 * stays byte-for-byte readable. */
function encodeHeaderValue(value: string): string {
  return isAscii(value) ? value : encodeWord(value);
}

/**
 * Encodes only the *display-name* portion of `"Name" <addr@x.com>` (or bare `Name <addr@x.com>`).
 * The `<addr-spec>` must stay 7-bit ASCII per RFC 5321/5322 and per the SES raw-message
 * requirements - only the free-text name may become an RFC 2047 encoded-word. A bare address with
 * no display name is returned unchanged.
 */
function encodeAddress(address: string): string {
  const match = /^(.*)<([^<>]+)>\s*$/.exec(address);

  if (!match) {
    return address;
  }

  const [, rawName, addr] = match;
  const name = rawName.trim().replace(/^"|"$/g, '');

  if (name.length === 0 || isAscii(name)) {
    return rawName.trim().length > 0 ? `${rawName.trim()} <${addr}>` : `<${addr}>`;
  }

  return `${encodeWord(name)} <${addr}>`;
}

/** Formats a `to`/`cc`/`from`/`replyTo` field as one RFC 5322 address list: splits a
 * comma-separated string or array into individual mailboxes, RFC 2047-encodes each display name,
 * and rejoins with `, ` - the same shape whether the caller passed a string or an array. */
export function formatAddressHeader(value: string | string[]): string {
  return splitAddressList(value).map(encodeAddress).join(', ');
}

/**
 * RFC 5322 §2.2.3 header folding: inserting CRLF immediately before an existing whitespace
 * character splits one logical header value across physical lines without changing its content
 * (the folded whitespace is still there, just after a line break). SES enforces a 1000-byte
 * ceiling per raw-message line; folding at {@link MAX_HEADER_LINE_LENGTH} keeps arbitrarily long
 * recipient lists, subjects, or encoded display names deliverable regardless of how many
 * addresses or how much non-ASCII text a caller supplies - purely by adding more physical
 * lines, never by dropping or truncating anything (verified: rejoining every folded line always
 * reproduces the original value exactly).
 *
 * The one value-altering fallback is deliberately gated on the *hard* limit, not the soft one:
 * an unbroken token (a single very long address, an encoded-word with no adjacent break) that
 * fits under {@link MAX_HEADER_HARD_LIMIT} is left on one long physical line rather than
 * force-broken at the soft width - forcing a break through the middle of an atomic token (an
 * email address has no internal whitespace) would insert a space that was never there,
 * corrupting it. Only a token that would itself violate the real transport limit gets the
 * content-altering hard-wrap - a case that essentially never occurs with real-world input.
 */
function foldHeaderLine(line: string): string {
  const lines: string[] = [];
  let remaining = line;

  while (remaining.length > MAX_HEADER_LINE_LENGTH) {
    let breakAt = remaining.lastIndexOf(' ', MAX_HEADER_LINE_LENGTH);

    if (breakAt <= 0) {
      // No break within the soft width - look further ahead instead of forcing one through an
      // atomic token. Still bounded by the hard limit, so the physical line this produces can
      // never violate the real transport constraint.
      const nextBreak = remaining.indexOf(' ', MAX_HEADER_LINE_LENGTH);
      breakAt = nextBreak > 0 && nextBreak <= MAX_HEADER_HARD_LIMIT ? nextBreak : -1;
    }

    if (breakAt > 0) {
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt);
      continue;
    }

    if (remaining.length <= MAX_HEADER_HARD_LIMIT) {
      break;
    }

    // Truly no natural break within the hard limit - an unbroken token that would itself
    // violate the transport line cap. This is the only path that can alter the value.
    lines.push(remaining.slice(0, MAX_HEADER_HARD_LIMIT));
    remaining = ` ${remaining.slice(MAX_HEADER_HARD_LIMIT)}`;
  }

  lines.push(remaining);
  return lines.join(CRLF);
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

/** A string `content` is raw text unless `encoding` says otherwise (nodemailer's convention) - a
 * caller that already holds a base64 payload sets `encoding: 'base64'` instead of handing over
 * decoded bytes. */
async function readAttachmentContent(attachment: IMailAttachment): Promise<Buffer> {
  if (attachment.content !== undefined) {
    if (Buffer.isBuffer(attachment.content)) {
      return attachment.content;
    }

    if (typeof attachment.content === 'string') {
      return Buffer.from(attachment.content, attachment.encoding ?? 'utf-8');
    }

    return streamToBuffer(attachment.content);
  }

  if (attachment.path) {
    return readFile(attachment.path);
  }

  return Buffer.alloc(0);
}

/** A literal CR/LF/NUL inside a header-bound value would let it break out of its own header line and forge additional headers or smuggle body content - classic email header injection. Every value spliced into a raw header line is checked here first, so an attempt fails loudly instead of silently reaching the wire.
 *
 * `value` is `unknown`, not `string`: `IMailMessage`/`IMailAttachment` both end in
 * `[key: string]: any`, so nothing at the type layer stops a caller (e.g. a controller
 * forwarding a request body) from putting a non-string - notably an array - where a string is
 * declared. `Array.prototype.includes('\r')` checks element *equality*, not substring, so
 * `['x\r\nBcc: evil'].includes('\r')` is `false` and a naive string-only check would wave a
 * forged header straight through once it is later stringified by a template literal. Requiring
 * `typeof value === 'string'` up front closes that gap for every field that flows through here. */
function assertNoHeaderInjection(opts: { field: string; value: unknown }): void {
  const { field, value } = opts;

  if (typeof value !== 'string') {
    throw getError({
      statusCode: 500,
      messageCode: MailErrorCodes.INVALID_CONFIGURATION,
      message: `Invalid Amazon SES message | ${field} must be a string`,
    });
  }

  if (!value.includes('\r') && !value.includes('\n') && !value.includes('\0')) {
    return;
  }

  throw getError({
    statusCode: 500,
    messageCode: MailErrorCodes.INVALID_CONFIGURATION,
    message: `Invalid Amazon SES message | ${field} contains illegal control characters`,
  });
}

/** Same guard as {@link assertNoHeaderInjection}, applied to every address in a `to`/`cc`/`bcc`
 * field individually - a string field only, not `[key: string]: any`; validating the raw
 * caller-provided value (before splitting/joining) both types and content-checks each entry. */
function assertNoAddressListInjection(opts: { field: string; value: string | string[] }): void {
  const { field, value } = opts;
  const list = Array.isArray(value) ? value : [value];

  for (const item of list) {
    assertNoHeaderInjection({ field, value: item });
  }
}

function extractDomain(address: string | undefined): string {
  const match = address ? /@([^@>\s]+)>?\s*$/.exec(address) : null;
  return match ? match[1] : 'localhost';
}

function buildHeaders(message: IMailMessage): string[] {
  const headers: string[] = [];

  if (message.from) {
    assertNoAddressListInjection({ field: 'from', value: message.from });
    headers.push(foldHeaderLine(`From: ${formatAddressHeader(message.from)}`));
  }

  if (message.to) {
    assertNoAddressListInjection({ field: 'to', value: message.to });
    headers.push(foldHeaderLine(`To: ${formatAddressHeader(message.to)}`));
  }

  if (message.cc) {
    assertNoAddressListInjection({ field: 'cc', value: message.cc });
    headers.push(foldHeaderLine(`Cc: ${formatAddressHeader(message.cc)}`));
  }

  if (message.replyTo) {
    assertNoAddressListInjection({ field: 'replyTo', value: message.replyTo });
    headers.push(foldHeaderLine(`Reply-To: ${formatAddressHeader(message.replyTo)}`));
  }

  assertNoHeaderInjection({ field: 'subject', value: message.subject });
  headers.push(foldHeaderLine(`Subject: ${encodeHeaderValue(message.subject)}`));
  // RFC 5322 requires both on every message; SES's raw-message parser does not synthesize them,
  // so an omission here is an omission on the wire (some receiving MTAs reject a `Date`-less
  // message outright, and a missing `Message-ID` breaks threading and dedup).
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push(`Message-ID: <${randomBytes(16).toString('hex')}@${extractDomain(message.from)}>`);
  headers.push('MIME-Version: 1.0');

  if (message.headers) {
    for (const [key, value] of Object.entries(message.headers)) {
      assertNoHeaderInjection({ field: `headers.${key}`, value: key });
      assertNoHeaderInjection({ field: `headers.${key}`, value });
      headers.push(foldHeaderLine(`${key}: ${encodeHeaderValue(value)}`));
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

function escapeQuotedString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** RFC 2231 percent-encoding for the `filename*=`/`name*=` extended parameter form. */
function encodeRfc2231(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Builds the `; name="..."`/`; filename="..."` (and, for non-ASCII names, the RFC 2231
 * `; filename*=UTF-8''...` extended form) suffix for a Content-Type/Content-Disposition line.
 * ASCII names are still quoted-string escaped - an unescaped `"` or `\` in a filename would
 * terminate the quoted string early and let the rest of the value merge into a sibling MIME
 * parameter, corrupting the part header for every downstream reader.
 */
function attachmentNameParams(attribute: 'name' | 'filename', value: string): string {
  if (isAscii(value)) {
    return `; ${attribute}="${escapeQuotedString(value)}"`;
  }

  const asciiFallback = value.replace(/[^\x20-\x7E]/g, '_');
  return (
    `; ${attribute}="${escapeQuotedString(asciiFallback)}"` +
    `; ${attribute}*=UTF-8''${encodeRfc2231(value)}`
  );
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

  const nameAttribute = attachment.filename
    ? attachmentNameParams('name', attachment.filename)
    : '';
  const filenameAttribute = attachment.filename
    ? attachmentNameParams('filename', attachment.filename)
    : '';
  const disposition = attachment.cid ? 'inline' : 'attachment';

  const headerLines = [
    `--${boundary}`,
    foldHeaderLine(`Content-Type: ${contentType}${nameAttribute}`),
    'Content-Transfer-Encoding: base64',
    foldHeaderLine(`Content-Disposition: ${disposition}${filenameAttribute}`),
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
 *
 * Inline (`cid`) attachments nest under `multipart/related` next to the body - a mail client
 * only renders `cid:` references inline when they share a `multipart/related` parent with the
 * body; under `multipart/mixed` they show up as ordinary downloadable attachments instead. Plain
 * file attachments (no `cid`) stay under `multipart/mixed`, alongside the body or the
 * `multipart/related` group when both kinds are present.
 */
export async function buildRawMimeMessage(message: IMailMessage): Promise<Buffer> {
  const headers = buildHeaders(message);
  const attachments = message.attachments ?? [];
  const inlineAttachments = attachments.filter(attachment => Boolean(attachment.cid));
  const fileAttachments = attachments.filter(attachment => !attachment.cid);
  const hasBothBodies = Boolean(message.text) && Boolean(message.html);
  const singleContentType = message.html ? ('text/html' as const) : ('text/plain' as const);
  const singleContent = message.html ?? message.text ?? '';

  const bodyPart = (boundary: string): string => {
    if (!hasBothBodies) {
      return textPart(boundary, singleContentType, singleContent);
    }

    const altBoundary = newBoundary('Alt');
    return [
      `--${boundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      [
        textPart(altBoundary, 'text/plain', message.text ?? ''),
        textPart(altBoundary, 'text/html', message.html ?? ''),
        `--${altBoundary}--`,
      ].join(CRLF),
    ].join(CRLF);
  };

  if (attachments.length === 0 && !hasBothBodies) {
    headers.push(`Content-Type: ${singleContentType}; charset=UTF-8`);
    headers.push('Content-Transfer-Encoding: base64');
    return Buffer.from([...headers, '', encodeTextBase64(singleContent)].join(CRLF), 'utf-8');
  }

  if (attachments.length === 0) {
    const boundary = newBoundary('Alt');
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const parts = [
      textPart(boundary, 'text/plain', message.text ?? ''),
      textPart(boundary, 'text/html', message.html ?? ''),
      `--${boundary}--`,
    ];
    return Buffer.from([...headers, '', parts.join(CRLF)].join(CRLF), 'utf-8');
  }

  const buildRelatedPart = async (parentBoundary: string): Promise<string> => {
    const relatedBoundary = newBoundary('Related');
    const parts = [bodyPart(relatedBoundary)];

    for (const attachment of inlineAttachments) {
      parts.push(await attachmentPart(attachment, relatedBoundary));
    }

    parts.push(`--${relatedBoundary}--`);

    return [
      `--${parentBoundary}`,
      `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
      '',
      parts.join(CRLF),
    ].join(CRLF);
  };

  if (inlineAttachments.length > 0 && fileAttachments.length === 0) {
    const relatedBoundary = newBoundary('Related');
    const parts = [bodyPart(relatedBoundary)];

    for (const attachment of inlineAttachments) {
      parts.push(await attachmentPart(attachment, relatedBoundary));
    }

    parts.push(`--${relatedBoundary}--`);
    headers.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`);
    return Buffer.from([...headers, '', parts.join(CRLF)].join(CRLF), 'utf-8');
  }

  const mixedBoundary = newBoundary('Mixed');
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const bodyParts: string[] = [];

  if (inlineAttachments.length > 0) {
    bodyParts.push(await buildRelatedPart(mixedBoundary));
  } else {
    bodyParts.push(bodyPart(mixedBoundary));
  }

  for (const attachment of fileAttachments) {
    bodyParts.push(await attachmentPart(attachment, mixedBoundary));
  }

  bodyParts.push(`--${mixedBoundary}--`);

  return Buffer.from([...headers, '', bodyParts.join(CRLF)].join(CRLF), 'utf-8');
}
