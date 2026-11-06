/** Narrowing of an `unknown` value, such as a wire payload, to an object whose string keys can be read; no node import, so it ships on `/core`. */
export class RecordUtility {
  /** A non-null object, arrays included: the narrowest check before reading string keys off an `unknown`. A type guard, so it keeps its positional `value`. */
  static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  /** A non-null object that is not an array: `isRecord` without the arrays. A class instance (an `Error`, a `Date`) passes; there is no prototype check, so this is not lodash's `isPlainObject`. */
  static isPlainRecord(value: unknown): value is Record<string, unknown> {
    return RecordUtility.isRecord(value) && !Array.isArray(value);
  }
}
