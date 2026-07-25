import { HTTP } from '@venizia/ignis-helpers';

/** Meilisearch error bodies carry `{ message, code, type, link }`; classification keys off `code`. */
export class MeilisearchInternal {
  static readonly INDEX_NOT_FOUND = 'index_not_found';
  static readonly INDEX_ALREADY_EXISTS = 'index_already_exists';
  static readonly DOCUMENT_NOT_FOUND = 'document_not_found';

  /** A Meilisearch failure arrives in TWO shapes and both must be read: `MeilisearchApiError` (SDK throw - body off `cause`, status off `response.status`, NO top-level `code`) and the flat `task.error` response (not an Error, `code` at top level). Missing either misclassifies a by-design 404 as a 503 engine-down. */
  static getErrorCode(opts: { error: unknown }): string | undefined {
    const { error } = opts;

    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const flatCode = (error as { code?: unknown }).code;
    if (typeof flatCode === 'string') {
      return flatCode;
    }

    const causeCode = (error as { cause?: { code?: unknown } }).cause?.code;
    return typeof causeCode === 'string' ? causeCode : undefined;
  }

  /** The HTTP status of an API error, from whichever shape carries it. */
  static getHttpStatus(opts: { error: unknown }): number | undefined {
    const { error } = opts;

    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const responseStatus = (error as { response?: { status?: unknown } }).response?.status;
    if (typeof responseStatus === 'number') {
      return responseStatus;
    }

    const httpStatus = (error as { httpStatus?: unknown }).httpStatus;
    return typeof httpStatus === 'number' ? httpStatus : undefined;
  }

  static isNotFoundError(opts: { error: unknown }): boolean {
    const code = MeilisearchInternal.getErrorCode(opts);

    if (
      code === MeilisearchInternal.INDEX_NOT_FOUND ||
      code === MeilisearchInternal.DOCUMENT_NOT_FOUND
    ) {
      return true;
    }

    return MeilisearchInternal.getHttpStatus(opts) === HTTP.ResultCodes.RS_4.NotFound;
  }

  static isAlreadyExistsError(opts: { error: unknown }): boolean {
    return MeilisearchInternal.getErrorCode(opts) === MeilisearchInternal.INDEX_ALREADY_EXISTS;
  }
}
