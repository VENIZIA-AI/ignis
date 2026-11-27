import { TrueWords } from '@/common/true-words';
import { LoggerDebugGate } from '@/modules/logger/common/debug-gate';
import { getError } from '@/modules/error';
import { UidRandom } from '@/modules/uid/common/random';
import { EchoUtility } from './echo.utility';

const UID_BASE = 36;
const UID_HALF_LENGTH = 5;

/** A decimal number as text: optional sign, digits with an optional fraction (`5.`, `.5`), an optional exponent. The fraction is one optional group, so a long run of digits that ends in a letter fails in linear time. Hex, octal, separators, `Infinity` and `NaN` are not numbers here. */
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** The longest piece of a rejected value an error message echoes: a long value would flood a log line. */
const ECHO_LIMIT = 40;
const ECHO_ELLIPSIS = '...';

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

  /**
   * A rejected value for an error message: a number as `String` writes it (`NaN`, `Infinity`; JSON would write
   * `null`), a string quoted and escaped, anything else as `EchoUtility.toSafeEcho` writes it. Longer than
   * `ECHO_LIMIT` characters, it is cut and ends with an ellipsis, so a long value cannot flood a log line.
   */
  private static echoRejected(opts: { value: unknown }): string {
    const { value } = opts;

    if (typeof value === 'string') {
      let kept = '';
      let count = 0;

      for (const character of value) {
        if (count === ECHO_LIMIT) {
          return `${EchoUtility.toSafeEcho({ value: kept }).slice(0, -1)}${ECHO_ELLIPSIS}"`;
        }

        kept += character;
        count += 1;
      }

      return EchoUtility.toSafeEcho({ value: kept });
    }

    const echoed = typeof value === 'number' ? String(value) : EchoUtility.toSafeEcho({ value });

    return echoed.length > ECHO_LIMIT ? `${echoed.slice(0, ECHO_LIMIT)}${ECHO_ELLIPSIS}` : echoed;
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

    const camelized: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      camelized[ParseUtility.toCamel({ input: key })] = ParseUtility.camelizeValue({
        value: entry,
      });
    }

    return camelized;
  }

  /**
   * Ten uppercase base36 characters (`0-9A-Z`) from the platform CSPRNG, about 51 bits. Two draws of
   * five characters, because one draw covers at most `2 ** 48` and ten base36 characters need more.
   * A throwaway key for a test or a label, not a secret: use `TokenUidHelper` for a secret.
   */
  static getUID() {
    const half = Math.pow(UID_BASE, UID_HALF_LENGTH);
    let uid = '';

    for (let draw = 0; draw < 2; draw++) {
      uid += UidRandom.below({ max: half })
        .toString(UID_BASE)
        .padStart(UID_HALF_LENGTH, '0')
        .toUpperCase();
    }

    return uid;
  }

  static toCamel(opts: { input: string }) {
    return opts.input.replace(/([-_][a-z])/gi, (sub: string) => {
      return sub.toUpperCase().replace('-', '').replace('_', '');
    });
  }

  static keysToCamel(opts: { source: object }) {
    const { source } = opts;
    const n: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(source)) {
      n[ParseUtility.toCamel({ input: key })] = ParseUtility.camelizeValue({ value: entry });
    }

    return n;
  }

  static isInt(opts: { input: unknown }) {
    const { input } = opts;

    if (Number.isNaN(Number(input))) {
      return false;
    }

    return (
      Number.isInteger(input) || Math.floor(Number(input)) === input || Number(input) % 1 === 0
    );
  }

  static isFloat(opts: { input: unknown }) {
    const { input } = opts;

    if (Number.isNaN(Number(input))) {
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
   * ParseUtility.toInt({ input: AppEnvs.get(KEY, { defaultValue: '6379' }) })  // correct
   * ParseUtility.toInt({ input: AppEnvs.get(KEY) }) ?? 6379                    // always 0 when KEY is unset
   * ```
   *
   * The second form is silent: a missing port reads `0` and a missing retry budget reads `0`, which
   * through `AbstractRedisHelper.buildRetryStrategy` means "give up after the first failure".
   */
  static toInt(opts: { input: unknown }) {
    const { input } = opts;

    if (!input) {
      return 0;
    }

    const normalized = String(input).replace(/,/g, '');

    if (Number.isNaN(Number(normalized))) {
      return 0;
    }

    const parsed = Number.parseInt(normalized, 10);

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  static toFloat(opts: { input: unknown; digit?: number }) {
    const { input, digit = 2 } = opts;

    if (!input) {
      return 0;
    }

    const normalized = String(input).replace(/,/g, '');

    if (Number.isNaN(Number(normalized))) {
      return 0;
    }

    const parsed = ParseUtility.round({ value: Number.parseFloat(normalized), precision: digit });

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Reads a number from a value that should hold one, and refuses anything else: the read of an environment
   * variable, where `ParseUtility.toInt` answers `0` for garbage and `Number` answers `NaN`.
   *
   * - `undefined`, `null` and a blank string answer `undefined`: nothing was set, so a `defaultValue` applies.
   * - A decimal number as text answers its value. Surrounding whitespace is allowed (`' 12 '` is `12`), so is
   *   an exponent (`'1e3'` is `1000`), a sign (`'-5'`) and a fraction (`'.5'`, `'5.'`).
   * - Anything else throws: `'abc'`, `'12px'`, `'0x10'`, `'1,000'`, `'Infinity'`, `'NaN'`, a boolean or an object.
   *   A number that is not finite throws too; a finite number answers itself.
   *
   * @throws ApplicationError `[toNumber] <the value> is not a number`; the value is echoed escaped and cut at 40 characters.
   * @example
   * ```ts
   * AppEnvs.get(KEY, {
   *   transform: (raw) => ParseUtility.toNumber({ input: raw }),
   *   defaultValue: 6379,
   * });
   * ```
   */
  static toNumber(opts: { input: unknown }): number | undefined {
    const { input } = opts;

    if (input === undefined || input === null) {
      return undefined;
    }

    if (typeof input === 'number' && Number.isFinite(input)) {
      return input;
    }

    if (typeof input === 'string') {
      const trimmed = input.trim();

      if (trimmed === '') {
        return undefined;
      }

      if (DECIMAL_NUMBER.test(trimmed)) {
        const parsed = Number(trimmed);

        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    throw getError({
      message: `[toNumber] ${ParseUtility.echoRejected({ value: input })} is not a number`,
    });
  }

  /**
   * Reads a boolean setting with the words of `z.stringbool()`, trimmed and in any case: `true`, `1`, `yes`, `on`,
   * `y`, `enabled` are `true`; `false`, `0`, `no`, `off`, `n`, `disabled` are `false`. A boolean is itself, the numbers
   * `1` and `0` read like their text, and `null`, `undefined` and a blank string are `false`.
   *
   * @throws A 400 error for anything else, another number and `NaN` included.
   */
  static toBoolean(opts: { input: unknown }): boolean {
    const { input } = opts;

    if (typeof input === 'boolean') {
      return input;
    }

    if (input === null || input === undefined) {
      return false;
    }

    if (typeof input === 'string' || typeof input === 'number') {
      const text = String(input);

      if (LoggerDebugGate.FALSE_WORDS.test(text)) {
        return false;
      }

      if (TrueWords.PATTERN.test(text)) {
        return true;
      }
    }

    throw getError({
      message: `[toBoolean] ${ParseUtility.echoRejected({ value: input })} is not a boolean`,
    });
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

  /** Splits a delimited string into trimmed, non-empty entries - the transform for list-shaped env values (e.g. `AppEnvs.get(KEY, { transform: (input) => ParseUtility.toDelimitedArray({ input }) })`). */
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
    let result: unknown = opts.source;

    for (const key of keys) {
      if (result == null) {
        throw getError({ message: `Cannot read property '${key}' of ${result}` });
      }

      result = Reflect.get(Object(result), key);
    }

    return result as V;
  }
}
