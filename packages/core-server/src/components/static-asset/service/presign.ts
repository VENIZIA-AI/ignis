import type {
  IDuration,
  TValueOrAsyncResolver,
  ValueOrPromise,
} from '@venizia/ignis-helpers/common';
import { ResolverUtility } from '@venizia/ignis-helpers/common';
import {
  getError,
  RequestBodyErrors,
  UuidHelper,
  type TErrorDefinition,
} from '@venizia/ignis-helpers/core';
import type { IStorageHelper } from '@venizia/ignis-helpers';
import { extname } from 'node:path';
import type { AssetCommitToken } from '../common/commit-token';
import { StaticAssetErrors } from '../common/errors';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const DEFAULT_MAX_FILES = 10;

/** One file a client announces it is about to upload. The server never trusts the name for the key, and the size is signed. */
export interface IAssetPresignFile {
  fileName: string;
  contentType: string;
  /** Bytes. Signed into the URL, so the upload must be exactly this long. */
  size: number;
}

/** What `buildPayload` is told about the file it signs a token for. */
export interface IAssetPresignPayloadInput<TContext> {
  /** The full object key. */
  key: string;
  /** The last segment of `key`: the name the server chose. */
  name: string;
  /** The folder `resolvePath` answered, `''` for the root. */
  folder: string;
  /** The extension of the announced name, with its dot, in lower case. */
  extension: string;
  file: IAssetPresignFile;
  /** Epoch milliseconds the URL was issued at. */
  issuedAt: number;
  ownerId?: string;
  context: TContext;
}

/** The definitions `AssetPresignService` throws; the `errors` option takes any subset. `messageArgs` carry `extension`, `maxBytes`, `maxMegabytes` and `max`. */
export interface IAssetPresignErrors {
  /** @default StaticAssetErrors.PRESIGN_EXTENSION_NOT_ALLOWED */
  EXTENSION_NOT_ALLOWED: TErrorDefinition;
  /** @default StaticAssetErrors.PRESIGN_FILE_SIZE_INVALID */
  FILE_SIZE_INVALID: TErrorDefinition;
  /** @default StaticAssetErrors.UPLOAD_TOO_LARGE */
  FILE_TOO_LARGE: TErrorDefinition;
  /** @default RequestBodyErrors.TOO_MANY_FILES */
  TOO_MANY_FILES: TErrorDefinition;
}

/** Everything an application decides about presigned uploads. */
export interface IAssetPresignServiceOptions<TPayload extends object, TContext> {
  /** The storage. It has to support `presignPut` (`BunS3Helper` does). */
  helper: IStorageHelper;

  /** The bucket the objects go to, read per call. */
  bucket: TValueOrAsyncResolver<string>;

  /** Signs the token each URL comes with. */
  token: AssetCommitToken<TPayload>;

  /** The extensions that may be uploaded, with their dot and in lower case. */
  allowedExtensions: readonly string[];

  /** The largest file, in bytes. */
  maxBytes: number;

  /**
   * The most files one call prepares.
   *
   * @default 10
   */
  maxFiles?: number;

  /**
   * The deepest folder nesting a key may have, as `isValidObjectKey` counts it. A tenant path is often deeper than the
   * helper's own default.
   *
   * @default the storage helper's own default
   */
  maxFolderDepth?: number;

  /**
   * The folder an object goes under, decided from the context the application passes to `presign`: a tenant, a purpose,
   * the extension. `''` is the root. Never taken from the client by this service.
   *
   * @default () => ''
   */
  resolvePath?: (opts: {
    file: IAssetPresignFile;
    extension: string;
    context: TContext;
  }) => ValueOrPromise<string>;

  /**
   * The stored name, with its extension. Answer a name the client cannot predict, or two uploads can collide.
   *
   * @default a v4 uuid plus the extension
   */
  resolveName?: (opts: { file: IAssetPresignFile; extension: string }) => string;

  /** The payload of the token of one file: what the application needs to find the object again. */
  buildPayload: (opts: IAssetPresignPayloadInput<TContext>) => TPayload;

  /** Tags written with the object. They are signed, so the client must send them back unchanged. */
  tagging?: Record<string, string>;

  /**
   * A content type that is signed instead of the one the client announced, so the holder of the URL cannot choose the
   * stored type. Absent, the announced one is signed.
   */
  signedContentType?: string;

  /** How long the URL is good. Absent, the storage helper's own default. */
  expiresIn?: IDuration;

  /** Rewrites the URL after it is signed, e.g. to send the browser through the asset proxy. */
  rewriteUrl?: (opts: { url: string }) => string;

  /** Definitions thrown in place of the defaults, by name. */
  errors?: Partial<IAssetPresignErrors>;

  /** The clock, in epoch milliseconds. A test seam. */
  now?: () => number;
}

/** What one prepared file gives its client. */
export interface IAssetPresignResult {
  /** Where the client PUTs the bytes. */
  preSignUrl: string;
  /** What the client hands back to name the file. */
  fileKeyToken: string;
  /** The object key, for the server's own use. */
  key: string;
}

/** What a presign call takes: the files, what the application knows about the caller, and the user the token is issued for. */
export interface IAssetPresignRequest<TContext> {
  files: readonly IAssetPresignFile[];
  /** Reaches `resolvePath` and `buildPayload`. */
  context: TContext;
  /** The user a token is issued for; absent for a service call, and a token with no owner cannot be claimed by anyone. */
  ownerId?: string;
}

/**
 * Prepares uploads straight to storage: it checks what the client announced, decides the key, signs a PUT URL whose
 * size, content type and tags the client cannot change, and signs a token that names the object.
 *
 * A presigned PUT has a limit a POST policy does not: the storage enforces the signed `content-length`, but nothing
 * bounds the size range, so what is announced is what is allowed. Verify the size again where the token is read.
 */
export class AssetPresignService<TPayload extends object, TContext> {
  private readonly options: IAssetPresignServiceOptions<TPayload, TContext>;
  private readonly errors: IAssetPresignErrors;
  private readonly allowed: ReadonlySet<string>;

  constructor(opts: IAssetPresignServiceOptions<TPayload, TContext>) {
    this.options = opts;
    this.errors = {
      EXTENSION_NOT_ALLOWED: StaticAssetErrors.PRESIGN_EXTENSION_NOT_ALLOWED,
      FILE_SIZE_INVALID: StaticAssetErrors.PRESIGN_FILE_SIZE_INVALID,
      FILE_TOO_LARGE: StaticAssetErrors.UPLOAD_TOO_LARGE,
      TOO_MANY_FILES: RequestBodyErrors.TOO_MANY_FILES,
      ...opts.errors,
    };
    this.allowed = new Set(opts.allowedExtensions.map((extension) => extension.toLowerCase()));
  }

  /** Builds the service of one application. */
  static build<TPayload extends object, TContext>(
    opts: IAssetPresignServiceOptions<TPayload, TContext>,
  ): AssetPresignService<TPayload, TContext> {
    return new AssetPresignService(opts);
  }

  /** One URL and one token for each file. Nothing is signed unless every file passes. */
  async presign(opts: IAssetPresignRequest<TContext>): Promise<IAssetPresignResult[]> {
    const { files, context, ownerId } = opts;
    const { helper, token, tagging, signedContentType, expiresIn, rewriteUrl, buildPayload } =
      this.options;
    const { now = Date.now, resolvePath, resolveName } = this.options;
    const maxFiles = this.options.maxFiles ?? DEFAULT_MAX_FILES;

    if (files.length === 0 || files.length > maxFiles) {
      throw getError({ error: this.errors.TOO_MANY_FILES, messageArgs: { max: maxFiles } });
    }

    const extensions = files.map((file) => this.checkFile({ file }));
    const bucketName = await ResolverUtility.resolveValueAsync({ value: this.options.bucket });
    const results: IAssetPresignResult[] = [];

    for (const [index, file] of files.entries()) {
      const extension = extensions[index] ?? '';
      const result = await resolvePath?.({ file, extension, context });
      const folder = (result ?? '').replace(/^\/+|\/+$/g, '');
      const name =
        resolveName?.({ file, extension }) ?? `${UuidHelper.getInstance().v4()}${extension}`;
      const key = folder ? `${folder}/${name}` : name;

      if (
        !name ||
        name.includes('/') ||
        !helper.isValidObjectKey({ object: { key }, maxDepth: this.options.maxFolderDepth })
      ) {
        throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
      }

      const url = await helper.presignPut({
        bucket: { name: bucketName },
        object: { key },
        expiresIn,
        tagging,
        contentLength: file.size,
        contentType: signedContentType ?? file.contentType,
      });

      results.push({
        preSignUrl: rewriteUrl ? rewriteUrl({ url }) : url,
        fileKeyToken: token.sign({
          payload: buildPayload({
            key,
            name,
            folder,
            extension,
            file,
            issuedAt: now(),
            ownerId,
            context,
          }),
        }),
        key,
      });
    }

    return results;
  }

  private checkFile(opts: { file: IAssetPresignFile }): string {
    const { file } = opts;
    const extension = extname(file.fileName).toLowerCase();

    if (!this.allowed.has(extension)) {
      throw getError({ error: this.errors.EXTENSION_NOT_ALLOWED, messageArgs: { extension } });
    }

    if (!Number.isInteger(file.size) || file.size <= 0) {
      throw getError({ error: this.errors.FILE_SIZE_INVALID });
    }

    if (file.size > this.options.maxBytes) {
      throw getError({
        error: this.errors.FILE_TOO_LARGE,
        messageArgs: {
          maxBytes: this.options.maxBytes,
          maxMegabytes: this.options.maxBytes / BYTES_PER_MEGABYTE,
        },
      });
    }

    return extension;
  }
}
