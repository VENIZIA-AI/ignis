import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { ContentTypeTable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { LoggerFactory } from '@venizia/ignis-helpers';
import { MailErrors, type IMailAttachment } from '../common';

const logger = LoggerFactory.getLogger(['MailAttachments']);

// O_NONBLOCK: opening a FIFO must not wait for a writer; the fstat check then refuses it.
// Windows has neither flag; there the realpath containment check stands alone.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

// One reason for missing, directory, unreadable and escaping paths: no existence oracle.
const PATH_OUTSIDE_REASON =
  'attachment.path must name a readable file inside attachmentRoot | pass the bytes as content instead';

type TAttachmentStream = AsyncIterable<Uint8Array | string>;

const buildPathRefusedError = (opts: { reason: string; cause?: unknown }) => {
  return getError({
    error: MailErrors.ATTACHMENT_PATH_REFUSED,
    message: `Mail attachment path refused | ${opts.reason}`,
    cause: opts.cause,
  });
};

const buildTooLargeError = (opts: { maxBytes: number }) => {
  return getError({
    error: MailErrors.ATTACHMENT_TOO_LARGE,
    message: `Mail attachments are over maxAttachmentBytes (${opts.maxBytes} bytes per message) | raise maxAttachmentBytes on the mail options, or send smaller attachments`,
  });
};

const assertWithinLimit = (opts: { byteLength: number; usedBytes: number; maxBytes?: number }) => {
  const { byteLength, usedBytes, maxBytes } = opts;

  if (maxBytes === undefined || usedBytes + byteLength <= maxBytes) {
    return;
  }

  throw buildTooLargeError({ maxBytes });
};

const isAttachmentStream = (value: unknown): value is TAttachmentStream => {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
};

const toBuffer = (chunk: Uint8Array | string): Buffer => {
  if (typeof chunk === 'string') {
    return Buffer.from(chunk);
  }

  return Buffer.isBuffer(chunk)
    ? chunk
    : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
};

/** Throwing out of `for await` destroys a Node Readable and cancels a web ReadableStream. */
const drainStream = async (opts: {
  stream: TAttachmentStream;
  usedBytes: number;
  maxBytes?: number;
}): Promise<Buffer> => {
  const { stream, usedBytes, maxBytes } = opts;
  const chunks: Buffer[] = [];
  let streamBytes = 0;

  for await (const chunk of stream) {
    const buffer = toBuffer(chunk);
    streamBytes += buffer.byteLength;

    // Per chunk: a stream has no length up front, and the rest must never be buffered.
    assertWithinLimit({ byteLength: streamBytes, usedBytes, maxBytes });
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, streamBytes);
};

/**
 * Both sides go through realpath, so neither `..` nor a symlink can leave the root. Not closed: a
 * directory inside the root swapped for a symlink between this check and `open` - that takes write
 * access inside the root, so keep the root writable only by what the application trusts.
 */
const resolveConfinedPath = async (opts: {
  path: string;
  attachmentRoot: string;
}): Promise<string> => {
  const { path, attachmentRoot } = opts;

  let rootPath: string;
  let filePath: string;

  // `resolve` throws synchronously on a non-string `path` from an untyped caller; it lands here too.
  try {
    [rootPath, filePath] = await Promise.all([
      realpath(attachmentRoot),
      realpath(resolve(attachmentRoot, path)),
    ]);
  } catch (error) {
    throw buildPathRefusedError({ reason: PATH_OUTSIDE_REASON, cause: error });
  }

  const relation = relative(rootPath, filePath);
  const isOutside =
    relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation);

  if (isOutside) {
    throw buildPathRefusedError({ reason: PATH_OUTSIDE_REASON });
  }

  return filePath;
};

const readConfinedFile = async (opts: {
  path: string;
  usedBytes: number;
  attachmentRoot?: string;
  maxBytes?: number;
}): Promise<Buffer> => {
  const { path, usedBytes, attachmentRoot, maxBytes } = opts;

  if (!attachmentRoot) {
    throw buildPathRefusedError({
      reason:
        'attachment.path is read only under attachmentRoot, which is not set | set attachmentRoot on the mail options, or pass the bytes as content',
    });
  }

  const filePath = await resolveConfinedPath({ path, attachmentRoot });
  const handle = await open(filePath, OPEN_FLAGS).catch(error => {
    throw buildPathRefusedError({ reason: PATH_OUTSIDE_REASON, cause: error });
  });

  try {
    const stats = await handle.stat();

    if (!stats.isFile()) {
      throw buildPathRefusedError({ reason: PATH_OUTSIDE_REASON });
    }

    // Sized before reading, so a file known to be oversized is never opened for reading.
    assertWithinLimit({ byteLength: stats.size, usedBytes, maxBytes });

    // Counted while read, and read no further than one byte past the budget: the file may have
    // grown since fstat.
    const stream = handle.createReadStream({
      autoClose: false,
      end: maxBytes === undefined ? Infinity : maxBytes - usedBytes,
    });

    return await drainStream({ stream, usedBytes, maxBytes });
  } finally {
    await handle.close();
  }
};

/**
 * Reads one attachment's bytes. A string `content` is raw text unless `encoding` says otherwise
 * (nodemailer's convention); `null` counts as absent. A `path` is read only inside
 * `attachmentRoot` and refused without one. `maxBytes` caps the whole message; `usedBytes` is what
 * earlier attachments already took.
 */
export const readAttachmentContent = async (opts: {
  attachment: IMailAttachment;
  attachmentRoot?: string;
  maxBytes?: number;
  usedBytes?: number;
}): Promise<Buffer> => {
  const { attachment, attachmentRoot, maxBytes, usedBytes = 0 } = opts;
  const { content } = attachment;

  if (content !== undefined && content !== null) {
    if (typeof content === 'string') {
      const encoding = attachment.encoding ?? 'utf-8';
      assertWithinLimit({ byteLength: Buffer.byteLength(content, encoding), usedBytes, maxBytes });
      return Buffer.from(content, encoding);
    }

    if (content instanceof Uint8Array) {
      assertWithinLimit({ byteLength: content.byteLength, usedBytes, maxBytes });
      return toBuffer(content);
    }

    if (!isAttachmentStream(content)) {
      throw getError({
        error: MailErrors.INVALID_CONFIGURATION,
        message:
          'Invalid mail attachment | attachment.content must be a Buffer, a Uint8Array, a string or a stream',
      });
    }

    return drainStream({ stream: content, usedBytes, maxBytes });
  }

  if (attachment.path !== undefined && attachment.path !== null) {
    return readConfinedFile({ path: attachment.path, usedBytes, attachmentRoot, maxBytes });
  }

  return Buffer.alloc(0);
};

/**
 * Turns every attachment into `content` bytes and drops `path`, so no transport is ever handed a
 * file or URL to read on its own. `maxBytes` is shared by all attachments of the message. An
 * attachment read from `path` keeps the file's name and, when none is given, its content type.
 */
export const resolveMailAttachments = async (opts: {
  attachments: IMailAttachment[];
  attachmentRoot?: string;
  maxBytes?: number;
}): Promise<IMailAttachment[]> => {
  const { attachments, attachmentRoot, maxBytes } = opts;
  const resolved: IMailAttachment[] = [];
  let usedBytes = 0;

  // Sequential on purpose: each read spends the budget the previous ones left.
  for (const attachment of attachments) {
    const { path, href, raw, content, encoding, ...rest } = attachment;

    // nodemailer reads both on its own - `href` fetches a URL, `raw` can carry a `path`.
    if ((href !== undefined && href !== null) || (raw !== undefined && raw !== null)) {
      throw buildPathRefusedError({
        reason: 'attachment.href and attachment.raw are not supported | pass the bytes as content',
      });
    }

    const bytes = await readAttachmentContent({
      attachment: { content, encoding, path },
      attachmentRoot,
      maxBytes,
      usedBytes,
    });

    usedBytes += bytes.byteLength;

    const isReadFromPath = (content === undefined || content === null) && typeof path === 'string';
    const filename = rest.filename ?? (isReadFromPath ? basename(path) : undefined);
    const contentType =
      rest.contentType ??
      (isReadFromPath && filename ? ContentTypeTable.resolve({ filename }) : undefined);

    resolved.push({
      ...rest,
      ...(filename === undefined ? {} : { filename }),
      ...(contentType === undefined ? {} : { contentType }),
      content: bytes,
    });
  }

  return resolved;
};

/**
 * Releases every attachment stream of a refused send, read or not, so none keeps a descriptor
 * open. A drained stream is already closed; releasing it again is harmless.
 */
export const releaseAttachmentStreams = (opts: { attachments?: IMailAttachment[] }): void => {
  for (const attachment of opts.attachments ?? []) {
    const { content } = attachment;

    if (content instanceof ReadableStream) {
      if (!content.locked) {
        content.cancel().catch(error => {
          logger.warn(
            '[releaseAttachmentStreams] Cancelling a web stream failed | error: %s',
            error,
          );
        });
      }

      continue;
    }

    if (
      typeof content === 'object' &&
      content !== null &&
      'destroy' in content &&
      typeof content.destroy === 'function'
    ) {
      content.destroy();
    }
  }
};
