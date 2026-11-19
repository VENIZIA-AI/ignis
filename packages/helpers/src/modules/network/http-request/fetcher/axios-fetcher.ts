import { HTTP, type THttpMethod } from '@/common';
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { stringify } from 'node:querystring';
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
import { FetchHeaders } from './common/utilities';

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
  method?: THttpMethod;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
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

  constructor(opts: {
    name: string;
    defaultConfigs?: AxiosRequestConfig;
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

    this.worker = axios.create({ ...opts.defaultConfigs });
  }

  protected override assertCallSupported(opts: {
    guard?: IUrlSafetyPolicy;
    extra: Record<string | symbol, unknown>;
  }): void {
    if (opts.guard === undefined) {
      return;
    }

    if (opts.extra.httpAgent !== undefined || opts.extra.httpsAgent !== undefined) {
      throw getError({
        message: `[${this.name}] A guarded call cannot carry its own httpAgent or httpsAgent | an agent of the caller's could connect to an address the guard did not vet`,
      });
    }
  }

  protected override buildUrl(opts: { url: string; params?: Record<string, unknown> }): string {
    const { url, params } = opts;
    const query = params ? stringify(params as Record<string, string>) : '';

    return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url;
  }

  protected override isReplayable(opts: { body: unknown }): boolean {
    return typeof opts.body === 'object' || super.isReplayable(opts);
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
      const response = await this.worker.request(props);

      return {
        response,
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(
          Object.entries(response.headers).map(([name, value]) => [name, String(value)]),
        ),
        // axios has read the body already: nothing is left to free.
        discard: async () => undefined,
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
  networkOptions: Omit<AxiosRequestConfig, 'baseURL' | 'headers' | 'timeout'> & {
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

    const defaultConfigs: AxiosRequestConfig = {
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
        defaults: {
          timeout: timeout ?? 60 * 1000,
          ...opts.defaults,
          headers: FetchHeaders.merge({
            layers: [
              { 'content-type': 'application/json; charset=utf-8' },
              headers,
              opts.defaults?.headers,
            ],
          }),
        },
        hooks: opts.hooks,
        guardEngine: opts.guardEngine,
      }),
    });
  }
}
