import { getError } from '@/modules/error';
import { readFormBody } from './form-body.utility';
import fs from 'node:fs';
import path from 'node:path';

export interface IRequestedRemark {
  id: string;
  url: string;
  method: string;
  [extra: string | symbol]: any;
}

interface IParseMultipartOptions<C extends { req: any } = { req: any }> {
  storage?: 'memory' | 'disk';
  uploadDir?: string;
  context: C;
}

interface IParsedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  filename?: string;
  path?: string;
}

/** Files and the text fields posted beside them - dropping the second silently loses what the client sent. */
export interface IParsedMultipartBody {
  files: IParsedFile[];
  fields: Record<string, string>;
}

export const parseMultipartBody = async <C extends { req: any } = { req: any }>(
  opts: IParseMultipartOptions<C>,
): Promise<IParsedMultipartBody> => {
  const { storage = 'memory', uploadDir = './uploads', context } = opts;

  if (storage === 'disk' && !fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const formData = await readFormBody({ req: context.req });
  const files: IParsedFile[] = [];
  const fields: Record<string, string> = {};

  const entries = formData.entries();
  for (const [fieldname, value] of entries) {
    if (typeof value === 'string') {
      // Last one wins, like a repeated query parameter.
      fields[fieldname] = value;
      continue;
    }

    const file = value as File;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsedFile: IParsedFile = {
      fieldname,
      originalname: file.name,
      encoding: 'utf8',
      mimetype: file.type,
      size: file.size,
    };

    switch (storage) {
      case 'memory': {
        parsedFile.buffer = buffer;
        break;
      }
      case 'disk': {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        // Sanitize filename to prevent path traversal
        const sanitizedName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${timestamp}-${randomString}-${sanitizedName}`;
        const filepath = path.join(uploadDir, filename);

        fs.writeFileSync(filepath, buffer);

        parsedFile.filename = filename;
        parsedFile.path = filepath;
        break;
      }
      default: {
        throw getError({
          message: `[parseMultipartBody] storage: ${storage} | Invalid storage type | Valids: ['memory', 'disk']`,
        });
      }
    }

    files.push(parsedFile);
  }

  return { files, fields };
};

/** Sanitizes a filename by removing path components and dangerous characters. The result is printable ASCII. */
export const sanitizeFilename = (filename: string): string => {
  const basename = path.basename(filename);
  let sanitized = basename.replace(/[^\w .-]/g, '_');
  sanitized = sanitized.replace(/^\.+/, '');
  sanitized = sanitized.replace(/\.{2,}/g, '.');
  sanitized = sanitized.replace(/\.\./g, '.');
  if (!sanitized || sanitized === '.' || sanitized.includes('..')) {
    sanitized = 'download';
  }
  return sanitized;
};

export const encodeRFC5987 = (filename: string): string => {
  return encodeURIComponent(filename)
    .replace(/['()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\*/g, '%2A');
};

/** Control, format (bidi overrides, zero-width space) and lone surrogate characters: a format character reorders the name a client shows, a lone surrogate makes `encodeURIComponent` throw. The zero-width joiner and non-joiner stay: they build emoji sequences and Persian words, and reorder nothing. */
const UNENCODABLE_FILENAME_CHARACTERS = /(?![\u200C\u200D])[\p{Cc}\p{Cf}\p{Cs}]/gu;
const LEADING_DOTS = /^\.+/;

export const createContentDispositionHeader = (opts: {
  filename: string;
  type: 'attachment' | 'inline';
}): string => {
  const { filename, type } = opts;
  const sanitized = sanitizeFilename(filename);
  const extendedName = path
    .basename(filename)
    .replace(UNENCODABLE_FILENAME_CHARACTERS, '_')
    .replace(LEADING_DOTS, '');
  const encoded = encodeRFC5987(extendedName || sanitized);

  // filename= is the ASCII fallback for old browsers, filename*= the UTF-8 form for modern ones.
  return `${type}; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
};

/**
 * Reads a filename out of a `Content-Disposition` value.
 *
 * Three forms, in the order the RFC gives them precedence: `filename*=UTF-8''...` (percent-encoded,
 * and the one hand-rolled parsers miss), a quoted `filename="..."`, and a bare `filename=...`.
 * Splitting on `filename=` alone returns the percent-encoded bytes for any non-ASCII name, which in
 * a product with non-English filenames is most of them.
 *
 * The pair of {@link createContentDispositionHeader}: one writes the header, this one reads it.
 */
export const parseContentDisposition = (opts: {
  header: string | null | undefined;
}): { type?: string; filename?: string } => {
  const { header } = opts;

  if (!header) {
    return {};
  }

  const type = header.split(';')[0]?.trim() || undefined;

  // `filename*` wins when both are present - it is the one that can carry a non-ASCII name.
  const extended = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (extended) {
    const value = extended[1].trim();
    // `UTF-8''name` or `UTF-8'lang'name`; anything before the last quote is charset and language.
    const encoded = value.slice(value.lastIndexOf("'") + 1);

    try {
      return { type, filename: decodeURIComponent(encoded) };
    } catch {
      // A malformed sequence is not worth failing a download over - fall through to `filename`.
    }
  }

  const quoted = header.match(/filename\s*=\s*"([^"]*)"/i);
  if (quoted) {
    return { type, filename: quoted[1] };
  }

  const bare = header.match(/filename\s*=\s*([^;]+)/i);
  return { type, filename: bare ? bare[1].trim() : undefined };
};
