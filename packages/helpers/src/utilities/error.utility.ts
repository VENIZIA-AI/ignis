import { getError } from '@/modules/error';

export class ErrorUtility {
  /** Normalize an unknown thrown value into an Error instance - an ApplicationError when it was not one. */
  static toError(opts: { error: unknown }): Error {
    const { error } = opts;
    return error instanceof Error ? error : getError({ message: String(error) });
  }
}
