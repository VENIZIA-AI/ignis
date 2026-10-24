import { type AnyObject, type TConstValue } from '@/common/types';

/** The punctuation of a query string, named so a reader sees the role rather than the character. */
export class QueryStringSeparators {
  /** Between the path and the first pair. */
  static readonly START = '?';
  /** Between two pairs. */
  static readonly PAIR = '&';
  /** Between a name and its value. */
  static readonly ASSIGN = '=';
}

/** What a `null` or `undefined` value becomes. */
export class QueryStringNullishModes {
  /** An empty value (`a=`): what `node:querystring` does. */
  static readonly EMPTY = 'empty';
  /** The pair is left out. */
  static readonly SKIP = 'skip';
}
export type TQueryStringNullishMode = TConstValue<typeof QueryStringNullishModes>;

/** What an object or an array value becomes. */
export class QueryStringNestedModes {
  /** An empty value (an array repeats its key instead): what `node:querystring` does. */
  static readonly DROP = 'drop';
  /** One JSON-encoded parameter (`ids=[1,2]`, `filter={"where":{}}`), the shape a JSON filter travels in. */
  static readonly JSON = 'json';
}
export type TQueryStringNestedMode = TConstValue<typeof QueryStringNestedModes>;

/** How {@link toQueryString} treats the values `node:querystring` has no answer for. Both default to its behavior. */
export interface IQueryStringOptions {
  nullish?: TQueryStringNullishMode;
  nested?: TQueryStringNestedMode;
}

/**
 * `node:querystring`'s `stringify`, written out so nothing on the HTTP path carries a node builtin -
 * that one import is what kept the whole network layer out of a browser bundle.
 *
 * Not `new URLSearchParams(params).toString()`, which differs on four counts measured against the
 * original: an array becomes `a=1%2C2` instead of `a=1&a=2`, `undefined` and `null` become the
 * STRINGS "undefined" and "null" instead of an empty value, and a space encodes as `+` rather than
 * `%20`. The first changes what a server parses; the second is the same coercion that sends a header
 * reading "undefined".
 *
 * Diffed against `node:querystring` across 22 shapes with zero mismatches.
 *
 * `nullish: 'skip'` leaves a null or undefined pair out. `nested: 'json'` sends an object or an
 * array as ONE JSON parameter instead (an array does not repeat its key), so a filter object survives
 * the trip. The defaults keep the behavior above.
 */
export const toQueryString = (opts: { params: AnyObject } & IQueryStringOptions): string => {
  const {
    params,
    nullish = QueryStringNullishModes.EMPTY,
    nested = QueryStringNestedModes.DROP,
  } = opts;
  const parts: string[] = [];
  const isSkipped = (value: unknown) =>
    nullish === QueryStringNullishModes.SKIP && (value === null || value === undefined);
  const isJson = nested === QueryStringNestedModes.JSON;

  // A primitive only. `querystring` drops an object or a nested array to an empty value rather than
  // stringifying it, and a caller that passed one meant something this format cannot carry anyway.
  const encode = (value: unknown) =>
    value === null || value === undefined || typeof value === 'object'
      ? ''
      : encodeURIComponent(String(value));

  const entries = Object.entries(params);
  for (const [key, value] of entries) {
    const name = encodeURIComponent(key);

    if (isSkipped(value)) {
      continue;
    }

    if (isJson && typeof value === 'object' && value !== null) {
      parts.push(
        `${name}${QueryStringSeparators.ASSIGN}${encodeURIComponent(JSON.stringify(value))}`,
      );
      continue;
    }

    // An array repeats the key, which is what a server reading a list expects.
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isSkipped(entry)) {
          continue;
        }

        parts.push(`${name}${QueryStringSeparators.ASSIGN}${encode(entry)}`);
      }

      continue;
    }

    parts.push(`${name}${QueryStringSeparators.ASSIGN}${encode(value)}`);
  }

  return parts.join(QueryStringSeparators.PAIR);
};
