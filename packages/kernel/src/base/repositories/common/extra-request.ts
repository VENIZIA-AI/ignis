import { HTTP } from '@venizia/ignis-helpers/common';

/**
 * The extras a client asks for, by name: `true` asks for a plain extra, a list of keys asks for a
 * group (`facets: ['status', 'tag']`), `false` switches a default off.
 */
export type TExtraRequest = Record<string, boolean | ReadonlyArray<string>>;

/**
 * What may come back for `Extra`: a group keyed by the keys asked for. Every entry is optional - a
 * route that offers no extras, or an older server, answers none - and the route may add defaults.
 */
export type TExtraResult<Extra extends TExtraRequest> = {
  [K in keyof Extra as Extra[K] extends false ? never : K]?: Extra[K] extends ReadonlyArray<
    infer Key extends string
  >
    ? Record<Key, unknown>
    : unknown;
} & Record<string, unknown>;

/** The client half of the list-extras contract: what goes in `x-request-extra`. */
export class HttpExtraRequest {
  /**
   * The header value for what a call asks for - `name`, `-name`, `name(key,key)` - led by `-*` when
   * the call wants the rows alone, every default off. `undefined` when it asks for nothing.
   */
  static toHeader(opts: {
    extra?: TExtraRequest;
    isEveryDefaultOff?: boolean;
  }): string | undefined {
    const { extra = {}, isEveryDefaultOff = false } = opts;

    const entries = Object.entries(extra).map(([name, value]) =>
      value === true ? name : value === false ? `-${name}` : `${name}(${value.join(',')})`,
    );
    const tokens = isEveryDefaultOff ? ['-*', ...entries] : entries;

    return tokens.length > 0 ? tokens.join(',') : undefined;
  }

  /** The header name, for a client that sets headers itself. */
  static readonly HEADER = HTTP.Headers.REQUEST_EXTRA;
}
