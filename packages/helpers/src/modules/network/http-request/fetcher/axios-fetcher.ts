import { HTTP } from '@/common';
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { QueryStringUtility } from '../../utilities/query-string';
import { getError } from '@/modules/error';
import type { IUrlSafetyPolicy } from '@/modules/network/utilities/url-safety/common/types';
import { BaseNetworkRequest } from '../base-network-request.helper';
import type { ILogger } from '@/modules/logger/common/types';
import {
  AbstractNetworkFetchableHelper,
  type IFetchExchange,
  type IFetchExchangeRequest,
  type IRequestOptions,
} from './base-fetcher';
import type { IFetchGuard } from './common/guard';
import type { IFetcherDefaults, IFetcherHooks } from './common/types';
import { BodyLimit } from './common/body-limit';
import { HttpHeaders } from './common/utilities';

/**
 * The request options a guarded call accepts, besides the ones the pipeline owns. An allowlist, not a denylist: axios keeps
 * adding transport knobs (`httpVersion`, `http2Options`, ...) that connect on their own and ignore the pinned agent, so
 * anything not listed here is refused, per call and in `defaultConfigs`. Plain data only: a function runs with the axios
 * config as `this` (`transformRequest` can rewrite `url` or `socketPath`), `auth` is re-applied after the cross-origin
 * header strip, and `baseURL` makes axios combine urls, so none of them is listed. A caller sets `Authorization` through
 * `headers`, transforms the body before the call and the answer after it.
 */
const GUARDED_OPTIONS = new Set([
  'withCredentials',
  'responseType',
  'responseEncoding',
  'xsrfCookieName',
  'xsrfHeaderName',
  'withXSRFToken',
  'maxContentLength',
  'maxBodyLength',
  'maxRate',
  'decompress',
  'transitional',
  'rejectUnauthorized',
]);

/** The fields of an axios config the pipeline owns. */
type TOwnedAxiosFields =
  | 'url'
  | 'method'
  | 'params'
  | 'data'
  | 'headers'
  | 'signal'
  | 'timeout'
  | 'maxRedirects'
  | 'validateStatus';

/** Request accepted by `AxiosFetcher`: an axios config where `body` is sent as the axios `data`. `rejectUnauthorized` set here overrides the instance setting for this call. */
export interface IAxiosRequestOptions
  extends Omit<AxiosRequestConfig, TOwnedAxiosFields>, IRequestOptions {
  url: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  /** Not accepted: the body is sent from `body`, so an axios `data` would be dropped. Pass `body`. */
  data?: never;
  /** Whether this call rejects an HTTPS server whose certificate fails verification; `false` turns verification off for this call. */
  rejectUnauthorized?: boolean;
}

/** A `lookup` for `net`/`tls` that answers the vetted addresses and nothing else: the client never resolves the name. */
const pinnedLookup = (addresses: string[]) => {
  const answers = addresses.map((address) => ({ address, family: isIP(address) === 6 ? 6 : 4 }));

  return (
    _hostname: string,
    options: unknown,
    callback: (
      error: Error | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ) => {
    const wantsAll =
      typeof options === 'object' && options !== null && Reflect.get(options, 'all') === true;

    if (wantsAll) {
      callback(null, answers);

      return;
    }

    const [first] = answers;
    callback(null, first.address, first.family);
  };
};

/** Fetcher over an axios instance (`getWorker()`): the pipeline of `AbstractNetworkFetchableHelper` with axios as the client. HTTPS calls share one keep-alive agent that verifies certificates unless `rejectUnauthorized` is `false`; an `httpsAgent` passed in the request wins - and is refused together with a `guard`, because an agent of the caller's could connect elsewhere than the vetted address. */
export class AxiosFetcher extends AbstractNetworkFetchableHelper<
  'axios',
  IAxiosRequestOptions,
  // The named type, not the `axios.` NAMESPACE: the namespace form resolves only under node16
  // module resolution, and this package also emits an ESM build under `bundler` resolution.
  AxiosResponse<unknown>,
  AxiosInstance
> {
  /**
   * One agent for the instance, not one per request. Built here so TLS verification is decided
   * ONCE, at construction, rather than per call - and so connections are actually reused: a fresh
   * agent per request forces a new TCP and TLS handshake every time (measured: 10 handshakes for 10
   * requests, versus 1). A guarded call never uses it: it gets an agent of its own that answers one vetted address and is dropped with the call, so no pin outlives it.
   */
  private readonly httpsAgent: https.Agent;
  private readonly isRejectingUnauthorized: boolean;
  /** What the caller put in `defaultConfigs`: a guarded call checks it like its own options. */
  private readonly configured: Record<string, unknown>;

  constructor(opts: {
    name: string;
    defaultConfigs?: Omit<AxiosRequestConfig, 'data'>;
    /** Joined to a relative call url; an absolute one is sent as it is. */
    baseUrl?: string;
    defaults?: IFetcherDefaults;
    hooks?: IFetcherHooks;
    /** The server half of the url guard (`UrlGuard`); a call that passes `guard` needs it. */
    guardEngine?: IFetchGuard;
    logger?: ILogger;
    /**
     * Whether this instance rejects an HTTPS server whose certificate fails verification.
     * `false` turns verification off.
     * @default true
     */
    rejectUnauthorized?: boolean;
  }) {
    super({
      name: opts.name,
      variant: 'axios',
      baseUrl: opts.baseUrl,
      defaults: opts.defaults,
      hooks: opts.hooks,
      guardEngine: opts.guardEngine,
    });
    opts?.logger?.info('Creating new network request worker instance! Name: %s', this.name);

    this.isRejectingUnauthorized = opts.rejectUnauthorized ?? true;
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: this.isRejectingUnauthorized,
    });

    this.configured = { ...opts.defaultConfigs };
    this.worker = axios.create({ ...opts.defaultConfigs });
  }

  protected override assertCallSupported(opts: {
    guard?: IUrlSafetyPolicy;
    extra: Record<string | symbol, unknown>;
  }): void {
    const { guard, extra } = opts;

    if (guard === undefined) {
      return;
    }

    if (guard.proxy !== undefined) {
      throw getError({
        message: `[${this.name}] A guarded call cannot use guard.proxy with axios | the request would go direct and unpinned; use a NativeFetcher for a proxied call`,
      });
    }

    const source: Record<string, unknown> = { ...this.configured, ...extra };
    const found = Object.keys(source).filter(
      (name) =>
        source[name] !== undefined &&
        (!GUARDED_OPTIONS.has(name) || typeof source[name] === 'function'),
    );

    if (found.includes('baseURL') || found.includes('allowAbsoluteUrls')) {
      throw getError({
        message: `[${this.name}] A guarded call needs one absolute url | use an AxiosFetcher without baseUrl, or a NativeFetcher (found: ${found.join(', ')})`,
      });
    }

    if (found.length > 0) {
      throw getError({
        message: `[${this.name}] A guarded call cannot set ${found.join(', ')} | only ${[...GUARDED_OPTIONS].join(', ')} are accepted with a guard: any other option could connect to an address the guard did not vet`,
      });
    }

    if (source.rejectUnauthorized === false || !this.isRejectingUnauthorized) {
      throw getError({
        message: `[${this.name}] A guarded call cannot turn TLS verification off | rejectUnauthorized: false has no use on an untrusted url`,
      });
    }

    if (source.responseType === 'stream') {
      throw getError({
        message: `[${this.name}] A guarded call cannot ask for a stream with axios | the pinned agent is gone when the call returns and a stream is not capped; use a NativeFetcher to stream`,
      });
    }
  }

  protected override buildUrl(opts: { url: string; params?: Record<string, unknown> }): string {
    const { url, params } = opts;
    const query = params ? QueryStringUtility.toQueryString({ params }) : '';

    return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url;
  }

  /** An axios body-size overflow is the cap's refusal (permanent), not a transport error the retry would repeat. */
  private refineError(opts: { error: unknown; url: string }): unknown {
    const { error, url } = opts;

    if (axios.isAxiosError(error) && /maxContentLength/.test(error.message)) {
      return BodyLimit.refuse({ detail: `${error.message} | url: ${url}` });
    }

    return error;
  }

  protected override async exchange(
    opts: IFetchExchangeRequest,
  ): Promise<IFetchExchange<AxiosResponse<unknown>>> {
    const {
      method,
      url,
      headers,
      body,
      signal,
      addresses,
      proxy,
      isManualRedirect,
      maxBytes,
      extra,
    } = opts;
    const { rejectUnauthorized, httpAgent, httpsAgent, ...axiosExtra } = extra;
    const props: AxiosRequestConfig = {
      ...axiosExtra,
      url: url.toString(),
      method,
      data: body,
      headers: Object.fromEntries(headers),
      signal,
      // The pipeline owns the status check, the redirects and the deadline; axios only carries the bytes.
      validateStatus: () => true,
      ...(isManualRedirect ? { maxRedirects: 0 } : {}),
      ...(maxBytes === undefined ? {} : { maxContentLength: maxBytes }),
    };
    const isPinned = addresses.length > 0 && !proxy;
    const protocol = this.getProtocol(url.toString());
    const isUnauthorizedAllowed = rejectUnauthorized === false;

    if (isPinned) {
      // The agent of THIS exchange: it answers the vetted addresses, keeps nothing alive, and is destroyed with the answer.
      const lookup = pinnedLookup(addresses);

      props.proxy = false;
      props.httpAgent = new http.Agent({ keepAlive: false, lookup });
      props.httpsAgent = new https.Agent({
        keepAlive: false,
        lookup,
        rejectUnauthorized: !isUnauthorizedAllowed && this.isRejectingUnauthorized,
      });
    } else if (protocol === HTTP.Protocols.HTTPS) {
      // A caller's own agent WINS. The previous code assigned after the `...rest` spread, so a hardened agent - custom CA, pinning, mTLS - was overwritten and the secure path was unreachable through the public seam.
      props.httpsAgent =
        httpsAgent instanceof https.Agent
          ? httpsAgent
          : rejectUnauthorized === undefined
            ? this.httpsAgent
            : new https.Agent({
                keepAlive: true,
                rejectUnauthorized: rejectUnauthorized !== false,
              });
    } else if (httpAgent instanceof http.Agent) {
      props.httpAgent = httpAgent;
    }

    try {
      let response: AxiosResponse<unknown>;

      try {
        const result = await this.worker.request(props);
        response = result;
      } catch (error) {
        throw this.refineError({ error, url: url.toString() });
      }

      return {
        response,
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(
          Object.entries(response.headers).map(([name, value]) => [name, String(value)]),
        ),
        // axios has read the body already: nothing is left to free.
        discard: async () => undefined,
        // axios has read the body already: the answer is as it came.
        keepBody: async () => response,
        readJson: async () => response.data,
        // `maxContentLength` stopped an oversized body while it was read; the answer is as it came.
        capped: () => response,
      };
    } finally {
      if (isPinned) {
        props.httpAgent?.destroy();
        props.httpsAgent?.destroy();
      }
    }
  }
}

/** Options of `AxiosNetworkRequest`: an axios config with `baseUrl` in place of `baseURL`. */
export interface IAxiosNetworkRequestOptions {
  name: string;
  networkOptions: Omit<AxiosRequestConfig, 'baseURL' | 'headers' | 'timeout' | 'data'> & {
    baseUrl?: string;
    headers?: Record<string, string>;
    /** Per attempt, in milliseconds. @default 60000 */
    timeout?: number;
  };
  defaults?: IFetcherDefaults;
  hooks?: IFetcherHooks;
  guardEngine?: IFetchGuard;
}

/** `BaseNetworkRequest` over an `AxiosFetcher`. Defaults: JSON content type and a 60000 ms `timeout`; a status outside 2xx throws a `UrlFetchError`. */
export class AxiosNetworkRequest extends BaseNetworkRequest<'axios'> {
  constructor(opts: IAxiosNetworkRequestOptions) {
    const { name, networkOptions } = opts;
    const { headers, baseUrl, timeout, ...rest } = networkOptions;

    const defaultConfigs: Omit<AxiosRequestConfig, 'data'> = {
      withCredentials: true,
      ...rest,
      baseURL: baseUrl,
    };

    super({
      name,
      baseUrl,
      fetcher: new AxiosFetcher({
        name,
        defaultConfigs,
        baseUrl,
        defaults: {
          timeout: timeout ?? 60 * 1000,
          ...opts.defaults,
          headers: HttpHeaders.withJsonDefault({ layers: [headers, opts.defaults?.headers] }),
        },
        hooks: opts.hooks,
        guardEngine: opts.guardEngine,
      }),
    });
  }
}
