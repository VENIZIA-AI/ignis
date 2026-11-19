import { HTTP, type THttpMethod } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { IUrlSafetyPolicy } from '@/modules/network/utilities/url-safety/common/types';
import { UrlPolicy } from '@/modules/network/utilities/url-safety/policy';
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
import type { IFetchGuard } from './common/guard';
import type { IFetcherDefaults, IFetcherHooks } from './common/types';
import { FetchHeaders } from './common/utilities';

/** The fields of `RequestInit` a call or a fetcher cannot set because the pipeline owns them. */
type TOwnedInitFields = 'body' | 'headers' | 'method' | 'signal' | 'redirect';

/** `RequestInit` as a fetcher takes it for the settings the pipeline does not own (`credentials`, `mode`, `cache`, ...). */
export type TNativeRequestInit = Omit<RequestInit, TOwnedInitFields>;

/** Request accepted by `NativeFetcher`: `RequestInit` plus `url`; `params` are written into the url query. */
export interface INativeFetchRequestOptions extends TNativeRequestInit, IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: Record<string, unknown>;
  body?: RequestInit['body'] | Record<string, unknown> | unknown[];
}

/** The options Bun's `fetch` takes beyond the standard ones; the standard `RequestInit` does not declare `proxy`. */
interface IBunFetchInit extends RequestInit {
  proxy?: string | false;
  tls?: { serverName?: string };
}

/** What `fetch` takes as a body as it is: encoding any of these again would change the bytes sent. A constructor is looked up on `globalThis` so a runtime without one (no `FormData`) just never matches it. */
const isRawBody = (body: unknown): body is NonNullable<RequestInit['body']> => {
  if (typeof body === 'string' || ArrayBuffer.isView(body) || body instanceof ArrayBuffer) {
    return true;
  }

  return ['Blob', 'FormData', 'URLSearchParams', 'ReadableStream'].some((name) => {
    const ctor = Reflect.get(globalThis, name);

    return typeof ctor === 'function' && body instanceof ctor;
  });
};

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
  private requestInit: TNativeRequestInit;
  private queryString: IQueryStringOptions;

  constructor(opts: {
    name: string;
    /** `RequestInit` settings for every call (`credentials`, `mode`, `cache`, ...); headers and the signal belong to `defaults` and to the call. */
    defaultConfigs?: TNativeRequestInit;
    defaults?: IFetcherDefaults;
    hooks?: IFetcherHooks;
    /** The server half of the url guard (`UrlGuard`); a call that passes `guard` needs it. */
    guardEngine?: IFetchGuard;
    /** How `params` are written into the url query; unset fields behave as `node:querystring` does. */
    queryString?: IQueryStringOptions;
    logger?: TFetcherLogger;
  }) {
    super({
      name: opts.name,
      variant: 'native',
      worker: fetch,
      defaults: opts.defaults,
      hooks: opts.hooks,
      guardEngine: opts.guardEngine,
    });
    opts?.logger?.info('Creating new network request worker instance! Name: %s', this.name);

    this.requestInit = opts.defaultConfigs ?? {};
    this.queryString = opts.queryString ?? {};
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

    return isRawBody(body) ? body : JSON.stringify(body);
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
    init: IBunFetchInit;
  }): Promise<Response> {
    const { url, addresses, init } = opts;
    const isHttps = url.protocol === 'https:';
    const hasNameToVerify = isHttps && !UrlPolicy.isLiteralHost({ hostname: url.hostname });
    const headers = new Headers(init.headers);

    headers.set(HTTP.Headers.HOST, url.host);

    let lastError: unknown;

    for (const address of addresses) {
      const pinned = new URL(url);
      pinned.hostname = address.includes(':') ? `[${address}]` : address;

      try {
        const result = await fetch(pinned, {
          ...init,
          // `proxy: false` is Bun's way to ignore HTTP_PROXY / HTTPS_PROXY for this call (an empty string or undefined keeps the environment's proxy, which would resolve the name itself and undo the pin). A test pins it.
          proxy: false,
          headers,
          ...(hasNameToVerify ? { tls: { serverName: url.hostname } } : {}),
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

  /** One `fetch`: pinned to the vetted addresses when there are some and no proxy was asked for. */
  private async dispatch(opts: {
    url: URL;
    addresses: string[];
    proxy: string | undefined;
    init: IBunFetchInit;
  }): Promise<Response> {
    const { url, addresses, proxy, init } = opts;

    if (addresses.length > 0 && !proxy) {
      const pinned = await this.fetchPinned({ url, addresses, init });

      return pinned;
    }

    const plain = await fetch(url, init);

    return plain;
  }

  protected override async exchange(
    opts: IFetchExchangeRequest,
  ): Promise<IFetchExchange<Response>> {
    const { method, url, headers, body, signal, addresses, proxy, isManualRedirect, extra } = opts;
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
    const response = await this.dispatch({ url, addresses, proxy, init });

    return {
      response,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      discard: async () => {
        await response.body?.cancel();
      },
      readJson: async ({ maxBytes }) => {
        if (maxBytes === undefined) {
          const whole = await response.text();

          return JSON.parse(whole);
        }

        const text = await BodyLimit.readText({ response, maxBytes });

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
    const mergedHeaders = FetchHeaders.merge({
      layers: [
        { [HTTP.Headers.CONTENT_TYPE]: HTTP.HeaderValues.APPLICATION_JSON_UTF8 },
        headers === undefined ? undefined : new Headers(headers),
        opts.defaults?.headers,
      ],
    });

    super({
      name,
      baseUrl,
      fetcher: new NativeFetcher({
        name,
        defaultConfigs: requestInit,
        defaults: { ...opts.defaults, headers: mergedHeaders },
        hooks: opts.hooks,
        guardEngine: opts.guardEngine,
        queryString,
      }),
    });
  }
}
