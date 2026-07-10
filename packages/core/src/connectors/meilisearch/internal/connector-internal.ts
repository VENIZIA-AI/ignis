import { HTTP } from '@venizia/ignis-helpers';

/** Meilisearch error bodies carry `{ message, code, type, link }`; classification keys off `code`. */
export class MeilisearchInternal {
  static readonly INDEX_NOT_FOUND = 'index_not_found';
  static readonly INDEX_ALREADY_EXISTS = 'index_already_exists';
  static readonly DOCUMENT_NOT_FOUND = 'document_not_found';

  static getErrorCode(opts: { error: unknown }): string | undefined {
    const { error } = opts;

    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }

  static isNotFoundError(opts: { error: unknown }): boolean {
    const code = MeilisearchInternal.getErrorCode(opts);

    if (
      code === MeilisearchInternal.INDEX_NOT_FOUND ||
      code === MeilisearchInternal.DOCUMENT_NOT_FOUND
    ) {
      return true;
    }

    if (typeof opts.error !== 'object' || opts.error === null) {
      return false;
    }

    return (opts.error as { httpStatus?: unknown }).httpStatus === HTTP.ResultCodes.RS_4.NotFound;
  }

  static isAlreadyExistsError(opts: { error: unknown }): boolean {
    return MeilisearchInternal.getErrorCode(opts) === MeilisearchInternal.INDEX_ALREADY_EXISTS;
  }
}
