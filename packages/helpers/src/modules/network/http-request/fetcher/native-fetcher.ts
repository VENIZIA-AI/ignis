import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { IUrlSafetyPolicy } from '@/modules/network/utilities/url-safety/common/types';
import {
  type IQueryStringOptions,
  QueryStringSeparators,
  QueryStringUtility,
} from '../../utilities/query-string';

import { BaseNetworkRequest } from '../base-network-request.helper';
import {
  AbstractNetworkFetchableHelper,
  type IFetchExchange,
  type IFetchExchangeRequest,
  type IRequestOptions,
  type TFetcherLogger,
} from './base-fetcher';
import { BodyLimit } from './common/body-limit';
import { HttpResponseReader } from './common/response-reader';
import type { IFetchGuard } from './common/guard';
import type { IFetcherDefaults, IFetcherHooks } from './common/types';
import { HttpBodies, HttpHeaders } from './common/utilities';

/** The fields of `RequestInit` a call or a fetcher cannot set because the pipeline owns them. */
type TOwnedInitFields = 'body' | 'headers' | 'method' | 'signal' | 'redirect';

/** `RequestInit` as a fetcher takes it for the settings the pipeline does not own (`credentials`, `mode`, `cache`, ...). */
export type TNativeRequestInit = Omit<RequestInit, TOwnedInitFields>;

/** Request accepted by `NativeFetcher`: `RequestInit` plus `url`; `params` are written into the url query. */
export interface INativeFetchRequestOptions extends TNativeRequestInit, IRequestOptions {
  url: string;
  params?: Record<string, unknown>;
  body?: RequestInit['body'] | Record<string, unknown> | unknown[];
}

/** What sends a request when the fetcher is given one: the part of `fetch` it uses. */
export type TNativeFetchSender = (url: string, init: RequestInit) => Promise<Response>;

/** The options Bun's `fetch` takes beyond the standard ones; the standard `RequestInit` does not declare `proxy`. */
interface IBunFetchInit extends RequestInit {
  proxy?: string | false;
  tls?: { serverName?: string };
}

/**
 * The `fetch` options a guarded call accepts, besides the ones the pipeline owns. An allowlist: Bun adds options that choose
 * the connection (`unix`, `proxy`, `tls`, ...) and a guard must not meet a new one by surprise.
 */
const GUARDED_OPTIONS = new Set([
  'credentials',
  'mode',
  'cache',
  'referrer',
  'referrerPolicy',
  'integrity',
  'keepalive',
  'priority',
]);

/** Connect-phase errors: nothing was sent, so trying the next vetted address cannot deliver a request twice. */
const CONNECT_ERROR_CODES = ['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EADDRNOTAVAIL'];

/** Fetcher over the global `fetch` (`getWorker()`): the pipeline of `AbstractNetworkFetchableHelper` with `fetch` as the client. */
export class NativeFetcher extends AbstractNetworkFetchableHelper<
  'native',
  INativeFetchRequestOptions,
  Awaited<ReturnType<typeof fetch>>,
  typeof fetch
> {
  /** What `fetch` takes as a body as it is: encoding any of these again would change the bytes sent. */
  static isRawBody(body: unknown): body is NonNullable<RequestInit['body']> {
    if (typeof body === 'string' || ArrayBuffer.isView(body) || body instanceof ArrayBuffer) {
      return true;
    }

    return HttpBodies.isAnyOf({
      body,
      names: ['Blob', 'FormData', 'URLSearchParams', 'ReadableStream'],
    });
  }

  private requestInit: TNativeRequestInit;
  private sender: TNativeFetchSender | undefined;
  private queryString: IQueryStringOptions;

  constructor(opts: {
    name: string;
    /** `RequestInit` settings for every call (`credentials`, `mode`, `cache`, ...); headers and the signal belong to `defaults` and to the call. */
    defaultConfigs?: TNativeRequestInit;
    /** Joined to a relative call url; an absolute one is sent as it is. */
    baseUrl?: string;
    defaults?: IFetcherDefaults;
    hooks?: IFetcherHooks;
    /** The server half of the url guard (`UrlGuard`); a call that passes `guard` needs it. */
    guardEngine?: IFetchGuard;
    /** What sends a request, in place of the global `fetch` (read at call time): a test double, a proxy, an instrumented client. */
    fetch?: TNativeFetchSender;
    /** How `params` are written into the url query; unset fields behave as `node:querystring` does. */
    queryString?: IQueryStringOptions;
    logger?: TFetcherLogger;
  }) {
    super({
      name: opts.name,
      variant: 'native',
      worker: fetch,
      baseUrl: opts.baseUrl,
      defaults: opts.defaults,
      hooks: opts.hooks,
      guardEngine: opts.guardEngine,
    });
    opts?.logger?.info('Creating new network request worker instance! Name: %s', this.name);

    this.requestInit = opts.defaultConfigs ?? {};
    this.sender = opts.fetch;
    this.queryString = opts.queryString ?? {};
  }

  /** A standard `FormData` is encoded afresh on every send, so it can be sent again. */
  protected override isReplayable(opts: { body: unknown }): boolean {
    return (
      (typeof FormData !== 'undefined' && opts.body instanceof FormData) || super.isReplayable(opts)
    );
  }

  /** With a guard the pipeline alone picks the connection: an option that picks one is refused, per call or in `defaultConfigs`. */
  protected override assertCallSupported(opts: {
    guard?: IUrlSafetyPolicy;
    extra: Record<string | symbol, unknown>;
  }): void {
    if (opts.guard === undefined) {
      return;
    }

    const source: Record<string, unknown> = { ...this.requestInit, ...opts.extra };
    const found = Object.keys(source).filter(
      (name) => source[name] !== undefined && !GUARDED_OPTIONS.has(name),
    );

    if (found.length > 0) {
      throw getError({
        message: `[${this.name}] A guarded call cannot set ${found.join(', ')} | only ${[...GUARDED_OPTIONS].join(', ')} are accepted with a guard: any other option could connect to an address the guard did not vet`,
      });
    }
  }

  /** A raw body passes through; a plain object or an array is JSON-encoded; no body stays no body. */
  protected serializeBody(opts: { body: unknown }): RequestInit['body'] | undefined {
    const { body } = opts;

    if (body === undefined || body === null) {
      return undefined;
    }

    return NativeFetcher.isRawBody(body) ? body : JSON.stringify(body);
  }

  protected override buildUrl(opts: { url: string; params?: Record<string, unknown> }): string {
    const { url, params } = opts;

    // `?` only when the url carries no query string of its own - a second `?` is not a separator, so the server would read the previous parameter's value as `1?extra=2`.
    const serializedParams = params
      ? QueryStringUtility.toQueryString({ params, ...this.queryString })
      : '';

    return serializedParams
      ? `${url}${url.includes(QueryStringSeparators.START) ? QueryStringSeparators.PAIR : QueryStringSeparators.START}${serializedParams}`
      : url;
  }

  protected override describeBody(opts: { body: unknown }): string | undefined {
    const serialized = this.serializeBody(opts);

    if (typeof serialized === 'string') {
      return `[body ${serialized.length} chars]`;
    }

    return serialized ? '[body]' : undefined;
  }

  /** `fetch` over one connection to `addresses`, in order; the next one is tried only when the connection itself fails. */
  private async fetchPinned(opts: {
    url: URL;
    addresses: string[];
    tlsServerName?: string;
    init: IBunFetchInit;
  }): Promise<Response> {
    const { url, addresses, tlsServerName, init } = opts;
    const headers = new Headers(init.headers);

    headers.set(HTTP.Headers.HOST, url.host);

    let lastError: unknown;

    for (const address of addresses) {
      const pinned = new URL(url);
      pinned.hostname = address.includes(':') ? `[${address}]` : address;

      try {
        const result = await this.request({
          url: pinned,
          init: {
            ...init,
            // `proxy: false` is Bun's way to ignore HTTP_PROXY / HTTPS_PROXY for this call (an empty string or undefined keeps the environment's proxy, which would resolve the name itself and undo the pin). A test pins it.
            proxy: false,
            headers,
            ...(tlsServerName === undefined ? {} : { tls: { serverName: tlsServerName } }),
          },
        });

        return result;
      } catch (error) {
        const name = error instanceof Error ? error.name : '';

        // The deadline, or the caller's own abort (whatever reason it carried), is not a reason to try another address.
        if (init.signal?.aborted || name === 'AbortError' || name === 'TimeoutError') {
          throw error;
        }

        // A request that may have reached the server (a reset after the body went out) is not repeated on another address unless it is safe to repeat: a webhook must not be delivered twice.
        const code = String(Reflect.get(Object(error), 'code') ?? '');
        const method = (init.method ?? 'GET').toUpperCase();

        if (method !== 'GET' && method !== 'HEAD' && !CONNECT_ERROR_CODES.includes(code)) {
          throw error;
        }

        lastError = error;
      }
    }

    throw lastError;
  }

  /** The sender the fetcher was given, or the global `fetch` looked up now (a test that swaps it is heard). */
  private async request(opts: { url: URL; init: IBunFetchInit }): Promise<Response> {
    const { url, init } = opts;

    // Taken off `this` first: `window.fetch` throws "Illegal invocation" when it is called as a method of another object.
    const { sender } = this;

    if (sender) {
      const answer = await sender(url.toString(), init);

      return answer;
    }

    const answer = await fetch(url.toString(), init);

    return answer;
  }

  /** One `fetch`: pinned to the vetted addresses when there are some and no proxy was asked for. */
  private async dispatch(opts: {
    url: URL;
    addresses: string[];
    tlsServerName?: string;
    proxy: string | undefined;
    init: IBunFetchInit;
  }): Promise<Response> {
    const { url, addresses, tlsServerName, proxy, init } = opts;

    if (addresses.length > 0 && !proxy) {
      const pinned = await this.fetchPinned({ url, addresses, tlsServerName, init });

      return pinned;
    }

    const plain = await this.request({ url, init });

    return plain;
  }

  protected override async exchange(
    opts: IFetchExchangeRequest,
  ): Promise<IFetchExchange<Response>> {
    const {
      method,
      url,
      headers,
      body,
      signal,
      addresses,
      tlsServerName,
      proxy,
      isManualRedirect,
      extra,
    } = opts;
    const init: IBunFetchInit = {
      ...this.requestInit,
      ...extra,
      method,
      body: this.serializeBody({ body }),
      headers,
      signal,
      redirect: isManualRedirect ? 'manual' : 'follow',
      ...(proxy ? { proxy } : {}),
    };
    const response = await this.dispatch({ url, addresses, tlsServerName, proxy, init });

    return {
      response,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      discard: async () => {
        await response.body?.cancel();
      },
      keepBody: async ({ maxBytes }) => {
        const bytes = await BodyLimit.readPrefix({ response, maxBytes });

        // A status without a body (204, 205, 304) cannot carry one in a `Response`.
        return new Response(bytes.length > 0 ? bytes : null, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      },
      readJson: async ({ maxBytes }) => {
        const text = await HttpResponseReader.readText({ response, maxBytes });

        return JSON.parse(text);
      },
      capped: ({ maxBytes }) =>
        response.body
          ? new Response(BodyLimit.capStream({ source: response.body, maxBytes }), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            })
          : response,
    };
  }
}

/** Options of `NativeFetchNetworkRequest`: `RequestInit` plus `baseUrl` and `queryString`, which sets how `params` are written into every url. */
export interface INativeFetchNetworkRequestOptions {
  name: string;
  networkOptions: RequestInit & {
    baseUrl?: string;
    /** How `params` are written into every url this request sends; see {@link IQueryStringOptions}. */
    queryString?: IQueryStringOptions;
  };
  defaults?: IFetcherDefaults;
  hooks?: IFetcherHooks;
  guardEngine?: IFetchGuard;
}

/** `BaseNetworkRequest` over a `NativeFetcher`. Request headers default to a JSON content type, and the caller's headers win. */
export class NativeFetchNetworkRequest extends BaseNetworkRequest<'native'> {
  constructor(opts: INativeFetchNetworkRequestOptions) {
    const { name, networkOptions } = opts;
    const {
      headers,
      baseUrl,
      queryString,
      signal: _signal,
      body: _body,
      method: _method,
      redirect: _redirect,
      ...requestInit
    } = networkOptions;

    // Case-insensitive, like the wire: a caller's `Content-Type` replaces the default one.
    const mergedHeaders = HttpHeaders.withJsonDefault({
      layers: [headers === undefined ? undefined : new Headers(headers), opts.defaults?.headers],
    });

    super({
      name,
      baseUrl,
      fetcher: new NativeFetcher({
        name,
        defaultConfigs: requestInit,
        baseUrl,
        defaults: { ...opts.defaults, headers: mergedHeaders },
        hooks: opts.hooks,
        guardEngine: opts.guardEngine,
        queryString,
      }),
    });
  }
}
