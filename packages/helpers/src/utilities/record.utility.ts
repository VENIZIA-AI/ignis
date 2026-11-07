/** Narrowing of an `unknown` value, such as a wire payload, to an object whose string keys can be read, and a safe deep read of one; no node import, so it ships on `/core`. */
export class RecordUtility {
  /** A non-null object, arrays included: the narrowest check before reading string keys off an `unknown`. A type guard, so it keeps its positional `value`. */
  static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  /** A non-null object that is not an array: `isRecord` without the arrays. A class instance (an `Error`, a `Date`) passes; there is no prototype check; use `isPlainObject` for that. */
  static isPlainRecord(value: unknown): value is Record<string, unknown> {
    return RecordUtility.isRecord(value) && !Array.isArray(value);
  }

  /**
   * A non-null object whose prototype is exactly `Object.prototype` or `null`: an object literal, `JSON.parse` output,
   * `Object.create(null)`. Where `isRecord` and `isPlainRecord` look only at the type of the value, this one reads the
   * prototype, so an array, a class instance (an `Error`, a `Date`, a `Map`), a function and an object from another
   * realm (its `Object.prototype` is not this realm's) answer `false`. `Object.create(Object.create(null))` also
   * answers `false`: its prototype is an object, not `null`. Use it for input that must be literal-shaped (a JSON
   * body, a config). It never throws: a Proxy whose `getPrototypeOf` trap throws answers `false`.
   */
  static isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!RecordUtility.isRecord(value)) {
      return false;
    }

    try {
      const prototype = Object.getPrototypeOf(value);

      return prototype === null || prototype === Object.prototype;
      // eslint-disable-next-line venizia/no-silent-catch -- a revoked or hostile Proxy throws from the trap; `false` is the answer of a guard, and the cause is of no use to the caller
    } catch {
      return false;
    }
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
