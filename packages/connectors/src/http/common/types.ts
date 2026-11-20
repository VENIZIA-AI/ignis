import type { TNativeFetchSender } from '@venizia/ignis-helpers/core';

/** A credential the HTTP datasource attaches to a request: `Authorization: <type> <value>`, and `provider`, when set, as the `x-auth-provider` header. */
export interface IAuthToken {
  value: string;
  /**
   * The authorization scheme.
   *
   * @default 'Bearer'
   */
  type?: string;
  provider?: string;
}

/** What `onUnauthorized` is told besides the request: `attempt` is 1 for the first 401, 2 for the retry's own. */
export interface IHttpUnauthorizedInfo {
  attempt: number;
}

/** The request a hook is asked about, the SAME object for every hook and every send of one call (a session map may key on it): the repository `paths`, the method, and the final URL with its query. */
export interface IHttpRequestContext {
  paths: Array<string>;
  method: string;
  url: string;
  /** The call's own signal: a hook may stop waiting on it. A refresh shared by other calls should not be aborted by one. */
  signal?: AbortSignal;
}

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

/** Settings of the HTTP datasource: where to send, which headers and token to attach, and what to do on a 401. */
export interface IHttpDataSourceSettings {
  /** An absolute URL, or a path from the page origin (`/api`). A path-relative one is refused. */
  baseUrl: string;

  /** The server's `error.rootKey`: an error envelope wrapped under it is unwrapped before it is read. */
  errorRootKey?: string;

  /** Sent on every request. `x-request-count` is refused - the connector owns it. */
  headers?: THttpHeaders;

  /**
   * Headers for this request, run on every send (the 401 retry included); wins over `headers`, a call's own win over it. A throw
   * fails the request; `x-request-count` is refused, and an `authorization` stands only when no token resolves.
   */
  headersResolver?: (context: IHttpRequestContext) => THttpHeaders | undefined;

  /** Wins over `authTokenResolver`, and is sent whatever the request. */
  authToken?: IAuthToken;

  /** Run on every send, the 401 retry included. `undefined` means no token for this request. A throw fails the request with that error. */
  authTokenResolver?: (context: IHttpRequestContext) => IAuthToken | undefined;

  /** Runs on a 401: `true` retries once (re-resolving the token), `false` lets the 401 stand. `context` is the object the resolvers got for this call; `info.attempt` says which send failed. */
  onUnauthorized?: (
    context: IHttpRequestContext,
    info: IHttpUnauthorizedInfo,
  ) => Promise<boolean> | boolean;

  /** What sends a request: the platform `fetch` when unset. Name one to route through a test double, a proxy or an instrumented client. */
  fetch?: THttpFetch;
}

/** What sends a request: a URL and its init, a `Response` back. The public name of the sender type. */
export type THttpFetch = TNativeFetchSender;

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

/** Query parameters a route takes beside `filter` or `where` - a keyword, a scope. The filter and `where` win over a key of the same name. */
export type THttpExtraQuery = Record<string, unknown>;

/** What the IGNIS search route answers: the total as `found` (`isFoundExact` is false when it is an estimate) and the hits. */
export interface IHttpSearchResult<R> {
  found: number;
  isFoundExact: boolean;
  hits: Array<{ document: R; score?: number; highlight?: unknown; highlights?: Array<unknown> }>;
}
