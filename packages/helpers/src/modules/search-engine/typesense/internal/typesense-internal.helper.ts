import { HTTP } from '@/common/constants';

interface IHttpLikeError {
  httpStatus?: number;
  message?: string;
}

// Typesense-specific error CLASSIFICATION only. Engine-agnostic error plumbing (describeError,
// wrapDependencyError, throwNotFoundError) lives one level up in SearchEngineInternal.
export class TypesenseInternal {
  private static asHttpLike(opts: { error: unknown }): IHttpLikeError {
    const { error } = opts;

    if (error && typeof error === 'object') {
      return error as IHttpLikeError;
    }

    return {};
  }

  private static messageOf(opts: { error: unknown }): string {
    const { error } = opts;

    const candidate = this.asHttpLike({ error });
    if (typeof candidate.message === 'string') {
      return candidate.message.toLowerCase();
    }

    if (typeof error === 'string') {
      return error.toLowerCase();
    }

    return '';
  }

  // Status-code-first and STRICT: when the error carries an httpStatus, classify solely on it — a
  // 5xx whose passed-through message happens to contain the phrase (e.g. a gateway body echoed
  // into "Server said: ... not found") must NOT be mistaken for a benign miss. The message
  // fallback only applies to status-less errors.
  static isAlreadyExistsError(opts: { error: unknown }): boolean {
    const { error } = opts;

    const status = this.asHttpLike({ error }).httpStatus;
    if (typeof status === 'number') {
      return status === HTTP.ResultCodes.RS_4.Conflict;
    }

    return this.messageOf({ error }).includes('already exists');
  }

  static isNotFoundError(opts: { error: unknown }): boolean {
    const { error } = opts;

    const status = this.asHttpLike({ error }).httpStatus;
    if (typeof status === 'number') {
      return status === HTTP.ResultCodes.RS_4.NotFound;
    }

    return this.messageOf({ error }).includes('not found');
  }
}
