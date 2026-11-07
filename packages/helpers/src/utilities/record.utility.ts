/** Narrowing of an `unknown` value, such as a wire payload, to an object whose string keys can be read, and a safe deep read of one; no node import, so it ships on `/core`. */
export class RecordUtility {
  /** A non-null object, arrays included: the narrowest check before reading string keys off an `unknown`. A type guard, so it keeps its positional `value`. */
  static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  /** A non-null object that is not an array: `isRecord` without the arrays. A class instance (an `Error`, a `Date`) passes; there is no prototype check, so this is not lodash's `isPlainObject`. */
  static isPlainRecord(value: unknown): value is Record<string, unknown> {
    return RecordUtility.isRecord(value) && !Array.isArray(value);
  }

  /**
   * Reads `value` along `path` (an array of keys; a number reads an array index) and answers `undefined` when any step
   * is missing, null or not an object, where `ParseUtility.getDeepProperty` throws. Only own properties are read: a
   * name such as `__proto__`, `constructor` or `toString` is never found through the prototype, so a path taken from
   * input cannot reach the prototype chain. An empty `path` answers `value` itself. The answer is `unknown`: narrow it.
   */
  static read(opts: { value: unknown; path: ReadonlyArray<string | number> }): unknown {
    let current: unknown = opts.value;

    for (const key of opts.path) {
      if (!RecordUtility.isRecord(current) || !Object.hasOwn(current, key)) {
        return undefined;
      }

      current = current[key];
    }

    return current;
  }
}
