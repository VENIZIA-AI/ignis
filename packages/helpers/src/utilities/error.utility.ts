import { getError } from '@/modules/error';

export class ErrorUtility {
  /** Normalize an unknown thrown value into an Error instance - an ApplicationError when it was not one. */
  static toError(opts: { error: unknown }): Error {
    const { error } = opts;
    return error instanceof Error ? error : getError({ message: String(error) });
  }
}

/** @deprecated Use ErrorUtility.toError({ error }). Removed in 0.5. */
export const toError = (error: unknown): Error => ErrorUtility.toError({ error });
