import { HTTP } from '@venizia/ignis-helpers';

interface IHttpLikeError {
  httpStatus?: number;
  message?: string;
}

// Typesense-specific error classification only; engine-agnostic plumbing lives in SearchConnectorInternal.
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

  // Status-first and strict: when httpStatus is present classify solely on it - a 5xx whose passed-through message contains the phrase must not be mistaken for a benign miss.
  private static classify(opts: { error: unknown; status: number; phrase: string }): boolean {
    const { error, status, phrase } = opts;

    const httpStatus = this.asHttpLike({ error }).httpStatus;
    if (typeof httpStatus === 'number') {
      return httpStatus === status;
    }

    return this.messageOf({ error }).includes(phrase);
  }

  static isAlreadyExistsError(opts: { error: unknown }): boolean {
    const { error } = opts;
    return this.classify({
      error,
      status: HTTP.ResultCodes.RS_4.Conflict,
      phrase: 'already exists',
    });
  }

  static isNotFoundError(opts: { error: unknown }): boolean {
    const { error } = opts;
    return this.classify({ error, status: HTTP.ResultCodes.RS_4.NotFound, phrase: 'not found' });
  }
}
