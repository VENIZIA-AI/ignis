import type { TFilter } from '@venizia/ignis-filter';

export interface IAuthToken {
  value: string;
  type?: string;
  provider?: string;
}

/** `undefined` means no token. */
export type TAuthTokenResolver = () => IAuthToken | undefined;

/** Not `Record` alone: header names are case-insensitive, and an object merge appends two spellings. */
export type THttpHeaders = Headers | Array<[string, string]> | Record<string, string>;

/**
 * A request body. A plain object or array goes out as JSON; a string, `Blob`, `FormData`,
 * `URLSearchParams`, `ArrayBuffer` or typed array goes out as it is. Never a stream: the 401 retry
 * sends the same body twice.
 */
export type THttpBody = string | object;

export interface IHttpDataSourceSettings {
  baseUrl: string;

  /** Sent on every request. `x-request-count` is refused - the connector owns it. */
  headers?: THttpHeaders;

  /** Wins over `authTokenResolver`. */
  authToken?: IAuthToken;

  authTokenResolver?: TAuthTokenResolver;

  /** Runs on a 401: `true` retries once (re-resolving the token), `false` lets the 401 stand. */
  onUnauthorized?: () => Promise<boolean> | boolean;
}

/** A list with no `Content-Range` has no total - `hasRange` says so rather than using the page size. */
export interface IHttpReadResult<R> {
  data: R;
  hasRange: boolean;
  /** Raw header: tells a present-but-unreadable one from an absent one. */
  contentRange?: string;
  total?: number;
  skip?: number;
  dataLength: number;
}

/** What a write answers: the rows the server returned, and its `x-response-count`. */
export interface IHttpWriteResult<R> {
  data: R;
  count: number;
}

export type THttpQuery<E extends object> = { filter?: TFilter<E> };
