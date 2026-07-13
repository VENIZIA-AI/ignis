import { HTTP } from '@venizia/ignis-helpers';

/** Meilisearch error bodies carry `{ message, code, type, link }`; classification keys off `code`. */
export class MeilisearchInternal {
  static readonly INDEX_NOT_FOUND = 'index_not_found';
  static readonly INDEX_ALREADY_EXISTS = 'index_already_exists';
  static readonly DOCUMENT_NOT_FOUND = 'document_not_found';

  /**
   * A Meilisearch failure arrives in TWO shapes and the classifier must read both:
   *
   * - `MeilisearchApiError` (what the SDK throws): the body hangs off `cause`
   *   (`{ message, code, type, link }`) and the status off `response.status`. It carries NO
   *   top-level `code` and NO `httpStatus` - reading those answers `false` to every question, which
   *   turns a by-design 404 into a 503: `create()` probes for an existing document, the probe 404s,
   *   and the engine gets reported as down for every brand-new document.
   *
   * - the flat `MeilisearchErrorResponse` hanging off a failed `task.error`, which is not an Error
   *   at all and DOES carry `code` at the top level.
   */
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
