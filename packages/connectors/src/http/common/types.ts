import type { TFilter } from '@venizia/ignis-filter';

/** What a caller hands the resolver seam: the token and, optionally, which provider issued it. */
export interface IAuthToken {
  value: string;
  type?: string;
  provider?: string;
}

/**
 * Where the token comes from when the datasource was not given one outright.
 *
 * A seam, not a guard: a browser resolver reads storage, a server resolver reads a secret, and
 * neither is baked into the transport. Returning `undefined` means "no token", which is different
 * from an empty one.
 */
export type TAuthTokenResolver = () => IAuthToken | undefined;

/**
 * Every shape `Headers` accepts. Not `Record<string, string>`: header names are case-INSENSITIVE,
 * so a plain object lets two spellings of one name coexist, and merging them APPENDS rather than
 * overrides - `{ 'x-request-count': 'false', 'X-Request-Count': 'true' }` reaches the wire as
 * `x-request-count: "false, true"`, which parses as neither.
 */
export type THttpHeaders = Headers | Array<[string, string]> | Record<string, string>;
export interface IHttpDataSourceSettings {
  baseUrl: string;

  /** Sent on every request. `x-request-count` is the connector's own and always goes out `false`. */
  headers?: THttpHeaders;

  /** A fixed token. Consulted BEFORE `authTokenResolver` - an explicit value is never overridden by a lookup. */
  authToken?: IAuthToken;

  authTokenResolver?: TAuthTokenResolver;

  /**
   * Runs on a 401, and its ANSWER decides: `true` retries the request once, `false` lets the 401
   * stand. Absent means no retry at all.
   *
   * A hook rather than a boolean, because "recover from a 401" is the host's policy, not the
   * transport's: one host refreshes a token then retries, another logs the user out, a third does
   * both in an order only it knows. A boolean could only mean "ask the resolver again", which reads
   * like recovery and is not - someone would wire it expecting a refresh and get a silent loop.
   *
   * The transport's part is the seam and the single retry. Whatever the hook does to make the next
   * attempt work - refresh, re-login, nothing - happens before it answers, and the retry re-resolves
   * the token afterwards.
   */
  onUnauthorized?: () => Promise<boolean> | boolean;
}

/**
 * One response, with the total kept apart from the rows.
 *
 * `hasRange` is the whole point: a list with no `Content-Range` has NO total, which is a different
 * answer from "the total equals this page". Folding the two is how a count of 7000 reports 1 and
 * every screen reading it looks healthy.
 */
export interface IHttpReadResult<R> {
  data: R;
  hasRange: boolean;
  /** The raw header, so a present-but-unreadable one is told apart from an absent one. */
  contentRange?: string;
  total?: number;
  skip?: number;
  dataLength: number;
}

export type THttpQuery<E extends object> = { filter?: TFilter<E> };
