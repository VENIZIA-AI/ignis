import type { TConstValue } from '@/common/types';
import { getError } from '@/modules/error';
import { MIN_TOKEN_BYTES, TokenUidHelper, UidTokenEncodings } from '@/modules/uid';
import { FormBodyUtility, RequestBodyErrors } from './form-body.utility';
import fs from 'node:fs';
import path from 'node:path';

/** A request remark: `id`, `url` and `method`, plus any extra keys. */
export interface IRequestedRemark {
  id: string;
  url: string;
  method: string;
  [extra: string | symbol]: any;
}

/** Where `RequestUtility.parseMultipartBody` keeps an uploaded file: MEMORY (a buffer) or DISK (spooled to `uploadDir`). */
export class MultipartStorages {
  static readonly MEMORY = 'memory';
  static readonly DISK = 'disk';

  static readonly SCHEME_SET = new Set<string>([this.MEMORY, this.DISK]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid multipart storage values. */
export type TMultipartStorage = TConstValue<typeof MultipartStorages>;

interface IParseMultipartOptions<C extends { req: any } = { req: any }> {
  storage?: TMultipartStorage;
  uploadDir?: string;
  /** The most file parts one request may carry; more is refused (413) before anything is spooled. Unset: no limit. */
  maxFiles?: number;
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

/** Control, format (bidi overrides, zero-width space) and lone surrogate characters: a format character reorders the name a client shows, a lone surrogate makes `encodeURIComponent` throw. The zero-width joiner and non-joiner stay: they build emoji sequences and Persian words, and reorder nothing. */
const UNENCODABLE_FILENAME_CHARACTERS = /(?![‌‍])[\p{Cc}\p{Cf}\p{Cs}]/gu;
const LEADING_DOTS = /^\.+/;

/** How a client treats a download: ATTACHMENT saves it, INLINE shows it. */
export class ContentDispositionTypes {
  static readonly ATTACHMENT = 'attachment';
  static readonly INLINE = 'inline';

  static readonly SCHEME_SET = new Set<string>([this.ATTACHMENT, this.INLINE]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid Content-Disposition type values. */
export type TContentDispositionType = TConstValue<typeof ContentDispositionTypes>;

/** Multipart body parsing and `Content-Disposition` header building and parsing for requests and uploads. */
export class RequestUtility {
  /** Built on first use: a helper opens a logger, which is work an import alone should not do. */
  private static uploadTokens?: TokenUidHelper;

  /** Uniqueness for a spooled filename, not a secret; the helper's 16-byte floor is the shortest it makes. */
  private static getUploadTokens(): TokenUidHelper {
    RequestUtility.uploadTokens ??= new TokenUidHelper({
      bytes: MIN_TOKEN_BYTES,
      encoding: UidTokenEncodings.HEX,
    });

    return RequestUtility.uploadTokens;
  }

  static async parseMultipartBody<C extends { req: any } = { req: any }>(
    opts: IParseMultipartOptions<C>,
  ): Promise<IParsedMultipartBody> {
    const { storage = MultipartStorages.MEMORY, uploadDir = './uploads', context, maxFiles } = opts;

    if (storage === MultipartStorages.DISK && !fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const formData = await FormBodyUtility.readFormBody({ req: context.req });
    const files: IParsedFile[] = [];
    const fields: Record<string, string> = {};

    if (maxFiles !== undefined) {
      if (!Number.isInteger(maxFiles) || maxFiles < 0) {
        throw getError({
          message: `[parseMultipartBody] maxFiles must be a non-negative integer | received: ${maxFiles}`,
        });
      }

      let fileParts = 0;

      for (const [, value] of formData.entries()) {
        if (typeof value !== 'string') {
          fileParts += 1;
        }
      }

      if (fileParts > maxFiles) {
        throw getError({
          error: RequestBodyErrors.TOO_MANY_FILES,
          message: `[parseMultipartBody] Too many files in one request | received: ${fileParts} | max: ${maxFiles}`,
        });
      }
    }

    try {
      await RequestUtility.readParts({ formData, storage, uploadDir, files, fields });
    } catch (error) {
      // Files already written to disk belong to a request that failed; nothing else knows their names.
      RequestUtility.removeSpooled({ files });

      throw error;
    }

    return { files, fields };
  }

  private static removeSpooled(opts: { files: IParsedFile[] }): void {
    for (const file of opts.files) {
      if (!file.path) {
        continue;
      }

      try {
        fs.rmSync(file.path, { force: true });
        // eslint-disable-next-line venizia/no-silent-catch -- cleanup of a failed request: one file that will not go must not hide the original error or stop the others
      } catch {
        continue;
      }
    }
  }

  private static async readParts(opts: {
    formData: FormData;
    storage: TMultipartStorage;
    uploadDir: string;
    files: IParsedFile[];
    fields: Record<string, string>;
  }): Promise<void> {
    const { formData, storage, uploadDir, files, fields } = opts;
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
        case MultipartStorages.MEMORY: {
          parsedFile.buffer = buffer;
          break;
        }
        case MultipartStorages.DISK: {
          const timestamp = Date.now();
          const randomString = RequestUtility.getUploadTokens().nextId();
          // Sanitize filename to prevent path traversal
          const sanitizedName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
          const filename = `${timestamp}-${randomString}-${sanitizedName}`;
          const filepath = path.join(uploadDir, filename);

          try {
            fs.writeFileSync(filepath, buffer);
          } catch (error) {
            // A write that dies midway (a full disk) leaves a partial file this part never got to list.
            RequestUtility.removeSpooled({ files: [{ ...parsedFile, path: filepath }] });

            throw error;
          }

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
  }

  /** Sanitizes a filename by removing path components and dangerous characters. The result is printable ASCII. */
  static sanitizeFilename(opts: { filename: string }): string {
    const basename = path.basename(opts.filename);
    let sanitized = basename.replace(/[^\w .-]/g, '_');
    sanitized = sanitized.replace(/^\.+/, '');
    sanitized = sanitized.replace(/\.{2,}/g, '.');
    sanitized = sanitized.replace(/\.\./g, '.');

    if (!sanitized || sanitized === '.' || sanitized.includes('..')) {
      sanitized = 'download';
    }

    return sanitized;
  }

  static encodeRfc5987(opts: { filename: string }): string {
    return encodeURIComponent(opts.filename)
      .replace(/['()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
      .replace(/\*/g, '%2A');
  }

  static buildContentDispositionHeader(opts: {
    filename: string;
    type: TContentDispositionType;
  }): string {
    const { filename, type } = opts;
    const sanitized = RequestUtility.sanitizeFilename({ filename });
    const extendedName = path
      .basename(filename)
      .replace(UNENCODABLE_FILENAME_CHARACTERS, '_')
      .replace(LEADING_DOTS, '');
    const encoded = RequestUtility.encodeRfc5987({ filename: extendedName || sanitized });

    // filename= is the ASCII fallback for old browsers, filename*= the UTF-8 form for modern ones.
    return `${type}; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
  }

  /**
   * Reads a filename out of a `Content-Disposition` value.
   *
   * Three forms, in the order the RFC gives them precedence: `filename*=UTF-8''...` (percent-encoded,
   * and the one hand-rolled parsers miss), a quoted `filename="..."`, and a bare `filename=...`.
   * Splitting on `filename=` alone returns the percent-encoded bytes for any non-ASCII name, which in
   * a product with non-English filenames is most of them.
   *
   * The pair of {@link RequestUtility.buildContentDispositionHeader}: one writes the header, this one reads it.
   */
  static parseContentDisposition(opts: { header: string | null | undefined }): {
    type?: string;
    filename?: string;
  } {
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
        // eslint-disable-next-line venizia/no-silent-catch -- a malformed `filename*` falls through to the plain `filename` parameter; only the extended name is lost
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
  }
}
