/** Narrowing of an `unknown` value to a stream. */
export class StreamUtility {
  /** A non-null object with `Symbol.asyncIterator`. A type guard, so it keeps its positional `value`. */
  static isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
    return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
  }
}
