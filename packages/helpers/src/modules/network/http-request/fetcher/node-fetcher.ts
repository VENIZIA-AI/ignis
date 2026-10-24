import { redactSecrets } from '@/common/redact';
import { HTTP, type THttpMethod } from '@/common/constants/http';
import { type AnyObject } from '@/common/types';
import {
  type IQueryStringOptions,
  QueryStringSeparators,
  toQueryString,
} from '../../utilities/query-string';

import { BaseNetworkRequest } from '../base-network-request.helper';
import {
  AbstractNetworkFetchableHelper,
  type IRequestOptions,
  type TFetcherLogger,
} from './base-fetcher';

export interface INodeFetchRequestOptions extends RequestInit, IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: AnyObject;
}

/** What `fetch` takes as a body as it is: encoding any of these again would change the bytes sent. A constructor is looked up on `globalThis` so a runtime without one (no `FormData`) just never matches it. */
const isRawBody = (body: unknown): boolean => {
  if (typeof body === 'string' || ArrayBuffer.isView(body) || body instanceof ArrayBuffer) {
    return true;
  }

  return ['Blob', 'FormData', 'URLSearchParams', 'ReadableStream'].some(name => {
    const ctor = Reflect.get(globalThis, name);
    return typeof ctor === 'function' && body instanceof ctor;
  });
};

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
    /** How `params` are written into the url; the defaults are `node:querystring`'s. */
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

    // The call's headers go over the defaults name by name (case-insensitive). Spreading them into the config replaced the whole default set: the content type and a default token vanished.
    const defaultHeaders = new Headers(this.defaultConfigs.headers);
    new Headers(headers).forEach((value, name) => defaultHeaders.set(name, value));
    const mergedHeaders = Object.fromEntries(defaultHeaders);

    const requestConfigs: RequestInit = {
      ...this.defaultConfigs,
      ...rest,
      method: method.toUpperCase(),
      body: this.serializeBody({ body }),
      headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
      signal: effectiveSignal,
    };

    // `?` only when the url carries no query string of its own - a second `?` is not a separator, so the server would read the previous parameter's value as `1?extra=2`.
    const serializedParams = params ? toQueryString({ params, ...this.queryString }) : '';
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
      redactSecrets(loggableConfigs),
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

export interface INodeFetchNetworkRequestOptions {
  name: string;
  networkOptions: RequestInit & {
    baseUrl?: string;
    /** How `params` are written into every url this request sends; see {@link IQueryStringOptions}. */
    queryString?: IQueryStringOptions;
  };
}

export class NodeFetchNetworkRequest extends BaseNetworkRequest<'node-fetch'> {
  constructor(opts: INodeFetchNetworkRequestOptions) {
    const { name, networkOptions } = opts;
    const { headers, baseUrl, queryString, ...rest } = networkOptions;

    const userHeaders =
      headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
    const mergedHeaders: AnyObject = {
      ['content-type']: 'application/json; charset=utf-8',
      ...userHeaders,
    };

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
