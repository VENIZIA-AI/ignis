import type { TFilter } from '@venizia/ignis-filter';

export interface IAuthToken {
  value: string;
  type?: string;
  provider?: string;
}

/** The request a hook is asked about: the repository `paths`, the method, and the final URL with its query. */
export interface IHttpRequestContext {
  paths: Array<string>;
  method: string;
  url: string;
  /** The call's own signal: a hook may stop waiting on it. A refresh shared by other calls should not be aborted by one. */
  signal?: AbortSignal;
}

/** `undefined` means no token for this request. A throw fails the request with that error. */
export type TAuthTokenResolver = (context: IHttpRequestContext) => IAuthToken | undefined;

/** Headers for this request. A throw fails the request with that error. */
export type THttpHeadersResolver = (context: IHttpRequestContext) => THttpHeaders | undefined;

/** Not `Record` alone: header names are case-insensitive, and an object merge appends two spellings. */
export type THttpHeaders = Headers | Array<[string, string]> | Record<string, string>;

/**
 * A request body. A plain object or array goes out as JSON; a string, `Blob`, `FormData`,
 * `URLSearchParams`, `ArrayBuffer` or typed array goes out as it is. Never a stream: the 401 retry
 * sends the same body twice.
 */
export type THttpBody = string | object;

/** The list-extras request and result types live with the server contract, in kernel. */
export type { TExtraRequest, TExtraResult } from '@venizia/ignis-kernel/repository';

/** What one call may add: its own headers (they win over the configured ones) and a signal to abort it. */
export interface IHttpCallOptions {
  headers?: THttpHeaders;
  signal?: AbortSignal;
}

export interface IHttpDataSourceSettings {
  /** An absolute URL, or a path from the page origin (`/api`). A path-relative one is refused. */
  baseUrl: string;

  /** The server's `error.rootKey`: an error envelope wrapped under it is unwrapped before it is read. */
  errorRootKey?: string;

  /** Sent on every request. `x-request-count` is refused - the connector owns it. */
  headers?: THttpHeaders;

  /**
   * Run on every send, the 401 retry included. Wins over `headers`; a call's own headers win over
   * it. `x-request-count` is refused here too; an `authorization` here stands only when no token is
   * resolved.
   */
  headersResolver?: THttpHeadersResolver;

  /** Wins over `authTokenResolver`, and is sent whatever the request. */
  authToken?: IAuthToken;

  /** Run on every send, the 401 retry included. */
  authTokenResolver?: TAuthTokenResolver;

  /** Runs on a 401: `true` retries once (re-resolving the token), `false` lets the 401 stand. */
  onUnauthorized?: (context: IHttpRequestContext) => Promise<boolean> | boolean;
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
  /** What a list answered beside its rows, when the server marked it with `x-response-extra`. */
  extra?: Record<string, unknown>;
}

/** What a write answers: the rows the server returned, and its `x-response-count`. */
export interface IHttpWriteResult<R> {
  data: R;
  count: number;
  /** What the route answered beside the rows, when the server marked it with `x-response-extra`. */
  extra?: Record<string, unknown>;
}

export type THttpQuery<E extends object> = { filter?: TFilter<E> };
