import { getError } from '@/modules/error';

/** Number, string and key conversions that tolerate bad input; no node import, so it ships on `/core`. */
export class ParseUtility {
  /**
   * Rounds at a decimal precision, shifting the exponent rather than multiplying: `1.005` at 2 is
   * `1.01` here, where `Math.round(1.005 * 100) / 100` gives `1`.
   *
   * Hand-written to keep lodash out of a browser bundle. One deliberate difference from `lodash/round`:
   * a result of negative zero is normalised to `0`. They compare equal, stringify the same and
   * serialise the same, so nothing downstream can tell - checked across 114 value/precision pairs, and
   * the sign of zero was the only disagreement.
   */
  private static round(opts: { value: number; precision?: number }): number {
    const { value, precision = 0 } = opts;

    if (!Number.isFinite(value) || precision === 0) {
      return Math.round(value) + 0;
    }

    const [mantissa, exponent] = `${value}e`.split('e');
    const shifted = Math.round(Number(`${mantissa}e${Number(exponent) + precision}`));
    const [shiftedMantissa, shiftedExponent] = `${shifted}e`.split('e');

    return Number(`${shiftedMantissa}e${Number(shiftedExponent) - precision}`) + 0;
  }

  /** Arrays stay arrays - mapping one through the object branch would turn it into an index-keyed object - but their object elements still need their keys camelized. Dates are opaque values. */
  private static camelizeValue(opts: { value: unknown }): unknown {
    const { value } = opts;

    if (Array.isArray(value)) {
      return value.map((element) => ParseUtility.camelizeValue({ value: element }));
    }

    if (!value || typeof value !== 'object' || value instanceof Date) {
      return value;
    }

    const camelized: any = {};
    const valueKeys = Object.keys(value);
    for (const key of valueKeys) {
      camelized[ParseUtility.toCamel({ input: key })] = ParseUtility.camelizeValue({
        value: (value as Record<string, unknown>)[key],
      });
    }

    return camelized;
  }

  static getUID() {
    return Math.random().toString(36).slice(2).toUpperCase();
  }

  static toCamel(opts: { input: string }) {
    return opts.input.replace(/([-_][a-z])/gi, (sub: string) => {
      return sub.toUpperCase().replace('-', '').replace('_', '');
    });
  }

  static keysToCamel(opts: { source: object }) {
    const { source } = opts;
    const n: any = {};
    const keys = Object.keys(source);

    for (const key of keys) {
      n[ParseUtility.toCamel({ input: key })] = ParseUtility.camelizeValue({
        value: (source as Record<string, unknown>)[key],
      });
    }

    return n;
  }

  static isInt(opts: { input: any }) {
    const { input } = opts;
    if (isNaN(input)) {
      return false;
    }

    return (
      Number.isInteger(input) || Math.floor(Number(input)) === input || Number(input) % 1 === 0
    );
  }

  static isFloat(opts: { input: any }) {
    const { input } = opts;
    if (isNaN(input)) {
      return false;
    }

    return Number(input) === input || Number(input) % 1 !== 0;
  }

  /**
   * Parses an integer, TOTAL by design: it always answers a number, and answers `0` for anything it
   * cannot parse - `undefined`, `''`, `'abc'`.
   *
   * That makes `ParseUtility.toInt({ input }) ?? fallback` dead code, because the left side is never
   * nullish. The fallback belongs INSIDE the call, and for an environment read it belongs in the read
   * itself:
   *
   * ```ts
   * ParseUtility.toInt({ input: applicationEnvironment.get(KEY, { defaultValue: '6379' }) })  // correct
   * ParseUtility.toInt({ input: applicationEnvironment.get(KEY) }) ?? 6379                    // always 0 when KEY is unset
   * ```
   *
   * The second form is silent: a missing port reads `0` and a missing retry budget reads `0`, which
   * through `AbstractRedisHelper.buildRetryStrategy` means "give up after the first failure".
   */
  static toInt(opts: { input: any }) {
    const { input } = opts;
    if (!input) {
      return 0;
    }

    const normalized = input?.toString()?.replace(/,/g, '');
    if (isNaN(normalized)) {
      return 0;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  static toFloat(opts: { input: any; digit?: number }) {
    const { input, digit = 2 } = opts;
    if (!input) {
      return 0;
    }

    const normalized = input?.toString()?.replace(/,/g, '');
    if (isNaN(normalized)) {
      return 0;
    }

    const parsed = ParseUtility.round({ value: Number.parseFloat(normalized), precision: digit });
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  static toBoolean(opts: { input: any }): boolean {
    const { input } = opts;
    return (
      input !== '' &&
      input !== 'false' &&
      input !== '0' &&
      input !== false &&
      input !== 0 &&
      input !== null &&
      input !== undefined
    );
  }

  /** Converts an array to a Map keyed by `key`. Last element wins on duplicate keys. */
  static parseArrayToMapWithKey<T extends Record<K, PropertyKey>, K extends keyof T>(opts: {
    items: T[];
    key: K;
  }): Map<T[K], T> {
    const { items, key } = opts;
    const resultMap = new Map<T[K], T>();

    if (!items.length) {
      return resultMap;
    }

    items.forEach((element) => {
      if (!(key in element)) {
        throw getError({
          message: 'Invalid keyMap',
        });
      }
      resultMap.set(element[key], element);
    });

    return resultMap;
  }

  /** Splits a delimited string into trimmed, non-empty entries - the transform for list-shaped env values (e.g. `applicationEnvironment.get(KEY, { transform: (input) => ParseUtility.toDelimitedArray({ input }) })`). */
  static toDelimitedArray(opts: { input: unknown; separator?: string }): string[] {
    const { input, separator = ',' } = opts;
    if (input == null) {
      return [];
    }

    return String(input)
      .split(separator)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  /**
   * A trimmed value, or `undefined` when the input is absent or carries nothing but whitespace.
   *
   * Written for environment reads. `KEY=` in a deployment file is a pipeline that forgot to export the
   * value, but `process.env.KEY` answers `''` for it, and `''` walks straight past `??`:
   *
   * ```ts
   * process.env.APP_ENV_LOGGER_FORMAT ?? 'text'                                           // '' when the line is blank
   * ParseUtility.blankToUndefined({ input: process.env.APP_ENV_LOGGER_FORMAT }) ?? 'text' // 'text'
   * ```
   *
   * Reach for this rather than `||`, which reads `'0'` as blank as well.
   */
  static blankToUndefined(opts: { input: string | undefined }): string | undefined {
    const trimmed = opts.input?.trim();
    return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
  }

  /** Trims a possibly-undefined env value to a clean string ('' when absent). */
  static toTrimmed(opts: { input: unknown }): string {
    const { input } = opts;
    if (input == null) {
      return '';
    }

    return String(input).trim();
  }

  /** Traverse a dotted property path on an object. */
  static getDeepProperty<T, V>(opts: { source: T; path: string }): V {
    const keys = opts.path.split('.');
    let result: any = opts.source;

    for (const key of keys) {
      if (result == null) {
        throw getError({ message: `Cannot read property '${key}' of ${result}` });
      }
      result = result[key];
    }

    return result as V;
  }
}

/** @deprecated Use ParseUtility.getUID(). Removed in 0.5. */
export const getUID = () => ParseUtility.getUID();

/** @deprecated Use ParseUtility.toCamel({ input }). Removed in 0.5. */
export const toCamel = (s: string) => ParseUtility.toCamel({ input: s });

/** @deprecated Use ParseUtility.keysToCamel({ source }). Removed in 0.5. */
export const keysToCamel = (object: object) => ParseUtility.keysToCamel({ source: object });

/** @deprecated Use ParseUtility.isInt({ input }). Removed in 0.5. */
export const isInt = (n: any) => ParseUtility.isInt({ input: n });

/** @deprecated Use ParseUtility.isFloat({ input }). Removed in 0.5. */
export const isFloat = (input: any) => ParseUtility.isFloat({ input });

/** @deprecated Use ParseUtility.toInt({ input }). Removed in 0.5. */
export const int = (input: any) => ParseUtility.toInt({ input });

/** @deprecated Use ParseUtility.toFloat({ input, digit }). Removed in 0.5. */
export const float = (input: any, digit = 2) => ParseUtility.toFloat({ input, digit });

/** @deprecated Use ParseUtility.toBoolean({ input }). Removed in 0.5. */
export const toBoolean = (input: any): boolean => ParseUtility.toBoolean({ input });

/** @deprecated Use ParseUtility.parseArrayToMapWithKey({ items, key }). Removed in 0.5. */
export const parseArrayToMapWithKey = <T extends Record<K, PropertyKey>, K extends keyof T>(
  arr: T[],
  keyMap: K,
): Map<T[K], T> => ParseUtility.parseArrayToMapWithKey({ items: arr, key: keyMap });

/** @deprecated Use ParseUtility.toDelimitedArray({ input, separator }). Removed in 0.5. */
export const toDelimitedArray = (input: unknown, separator = ','): string[] =>
  ParseUtility.toDelimitedArray({ input, separator });

/** @deprecated Use ParseUtility.blankToUndefined({ input }). Removed in 0.5. */
export const blankToUndefined = (input: string | undefined): string | undefined =>
  ParseUtility.blankToUndefined({ input });

/** @deprecated Use ParseUtility.toTrimmed({ input }). Removed in 0.5. */
export const toTrimmed = (input: unknown): string => ParseUtility.toTrimmed({ input });

/** @deprecated Use ParseUtility.getDeepProperty({ source, path }). Removed in 0.5. */
export const getDeepProperty = <T, V>(obj: T, path: string): V =>
  ParseUtility.getDeepProperty<T, V>({ source: obj, path });
