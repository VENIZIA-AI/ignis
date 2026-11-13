import { RedactUtility } from '@/common/redact';
import { HTTP, type THttpMethod } from '@/common/constants/http';
import {
  type IQueryStringOptions,
  QueryStringSeparators,
  QueryStringUtility,
} from '../../utilities/query-string';

import { BaseNetworkRequest } from '../base-network-request.helper';
import {
  AbstractNetworkFetchableHelper,
  type IRequestOptions,
  type TFetcherLogger,
} from './base-fetcher';

/** Request accepted by `NodeFetcher`: `RequestInit` plus `url`; `params` are written into the url query. */
export interface INodeFetchRequestOptions extends RequestInit, IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: Record<string, unknown>;
}

/** What `fetch` takes as a body as it is: encoding any of these again would change the bytes sent. A constructor is looked up on `globalThis` so a runtime without one (no `FormData`) just never matches it. */
const isRawBody = (body: unknown): boolean => {
  if (typeof body === 'string' || ArrayBuffer.isView(body) || body instanceof ArrayBuffer) {
    return true;
  }

  return ['Blob', 'FormData', 'URLSearchParams', 'ReadableStream'].some((name) => {
    const ctor = Reflect.get(globalThis, name);

    return typeof ctor === 'function' && body instanceof ctor;
  });
};

/** Fetcher over the global `fetch` (`getWorker()`). `timeout` (milliseconds) aborts the request and is combined with a `signal` the caller passes. */
export class NodeFetcher extends AbstractNetworkFetchableHelper<
  'node-fetch',
  INodeFetchRequestOptions,
  Awaited<ReturnType<typeof fetch>>,
  typeof fetch
> {
  private defaultConfigs: RequestInit;
  private queryString: IQueryStringOptions;

  constructor(opts: {
    name: string;
    defaultConfigs: RequestInit;
    /** How `params` are written into the url; unset fields behave as `node:querystring` does. */
    queryString?: IQueryStringOptions;
    logger?: TFetcherLogger;
  }) {
    super({ name: opts.name, variant: 'node-fetch', worker: fetch });
    const { name, defaultConfigs } = opts;
    this.name = name;
    opts?.logger?.info('Creating new network request worker instance! Name: %s', this.name);

    this.defaultConfigs = defaultConfigs;
    this.queryString = opts.queryString ?? {};
  }

  /** A raw body passes through; a plain object or an array is JSON-encoded; no body stays no body. */
  protected serializeBody(opts: { body: unknown }): RequestInit['body'] | undefined {
    const { body } = opts;

    if (body === undefined || body === null) {
      return undefined;
    }

    return isRawBody(body) ? (body as RequestInit['body']) : JSON.stringify(body);
  }

  override async send(opts: INodeFetchRequestOptions, logger?: TFetcherLogger) {
    const {
      url,
      method = HTTP.Methods.GET,
      params,
      body,
      headers,
      timeout,
      signal,
      ...rest
    } = opts;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timeoutController: AbortController | undefined;
    let effectiveSignal = signal;

    if (timeout) {
      timeoutController = new AbortController();
      timeoutId = setTimeout(() => {
        timeoutController?.abort();
      }, timeout);

      // Composed, never substituted: a timeout must not silently swallow the caller's own signal, or the caller would believe it cancelled a request that is in fact still running. Either source - and a signal already aborted before the call - aborts the request.
      effectiveSignal = signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal;
    }

    const requestConfigs: RequestInit = {
      ...this.defaultConfigs,
      ...rest,
      method: method.toUpperCase(),
      body: this.serializeBody({ body }),
      // The call's headers REPLACE the defaults (a caller that sends a multipart body leaves the content type out so `fetch` can write the boundary); a call with none keeps them. Spreading an absent `headers` over the config used to erase the defaults.
      headers: headers ?? this.defaultConfigs.headers,
      signal: effectiveSignal,
    };

    // `?` only when the url carries no query string of its own - a second `?` is not a separator, so the server would read the previous parameter's value as `1?extra=2`.
    const serializedParams = params
      ? QueryStringUtility.toQueryString({ params, ...this.queryString })
      : '';
    const requestUrl = serializedParams
      ? `${url}${url.includes(QueryStringSeparators.START) ? QueryStringSeparators.PAIR : QueryStringSeparators.START}${serializedParams}`
      : url;

    // The body is NEVER logged, only its size. `fetch` bodies are strings, and `redactSecrets` walks
    // object keys - so a JSON credential payload passed straight through as a string was printed in
    // full, with no key for the redactor to match on. Headers are normalised through `Headers` first
    // because the `string[][]` form is a list of tuples, which key matching cannot see either.
    const loggableConfigs = {
      ...requestConfigs,
      body:
        typeof requestConfigs.body === 'string'
          ? `[body ${requestConfigs.body.length} chars]`
          : requestConfigs.body
            ? '[body]'
            : undefined,
      headers: requestConfigs.headers,
    };

    // Straight on the logger it was handed, never `logger.for(...)`: a host logger may carry only `debug` and `info`. With none handed, nothing is logged - no default logger is built, so a browser never reaches the node-only provider.
    logger?.debug(
      '[%s] URL: %s | Props: %s | Timeout: %s',
      this.send.name,
      url,
      RedactUtility.redactSecrets({ value: loggableConfigs }),
      timeout,
    );

    try {
      const rs = await fetch(requestUrl, requestConfigs);

      return rs;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/** Options of `NodeFetchNetworkRequest`: `RequestInit` plus `baseUrl` and `queryString`, which sets how `params` are written into every url. */
export interface INodeFetchNetworkRequestOptions {
  name: string;
  networkOptions: RequestInit & {
    baseUrl?: string;
    /** How `params` are written into every url this request sends; see {@link IQueryStringOptions}. */
    queryString?: IQueryStringOptions;
  };
}

/** `BaseNetworkRequest` over a `NodeFetcher`. Request headers default to a JSON content type, and the caller's headers win. */
export class NodeFetchNetworkRequest extends BaseNetworkRequest<'node-fetch'> {
  constructor(opts: INodeFetchNetworkRequestOptions) {
    const { name, networkOptions } = opts;
    const { headers, baseUrl, queryString, ...rest } = networkOptions;

    // Case-insensitive, like the wire: a caller's `Content-Type` replaces the default one.
    const mergedHeaders = new Headers({ 'content-type': 'application/json; charset=utf-8' });

    new Headers(headers).forEach((value, key) => mergedHeaders.set(key, value));

    const defaultConfigs: Partial<RequestInit> = {
      ...rest,
      headers: mergedHeaders,
    };

    super({
      name,
      baseUrl,
      fetcher: new NodeFetcher({ name, defaultConfigs, queryString }),
    });
  }
}
