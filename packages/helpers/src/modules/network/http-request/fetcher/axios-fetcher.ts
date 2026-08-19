import { AnyObject, HTTP, THttpMethod } from '@/common';
import { redactSecrets } from '@/common/redact';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import https from 'node:https';
import { stringify } from 'node:querystring';
import { BaseNetworkRequest } from '../base-network-request.helper';
import type { ILogger } from '@/modules/logger/common/types';
import { AbstractNetworkFetchableHelper, IRequestOptions } from './base-fetcher';

export interface IAxiosRequestOptions extends AxiosRequestConfig, IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: AnyObject;
  body?: AnyObject;
  headers?: AnyObject;
  /**
   * Declared so the opt-out is TYPED. It used to reach the agent only through the
   * `[extra: string]: any` index signature on {@link IRequestOptions}, which meant nothing told a
   * caller the option existed, and nothing stopped a typo from silently doing nothing.
   */
  rejectUnauthorized?: boolean;
}

export class AxiosFetcher extends AbstractNetworkFetchableHelper<
  'axios',
  IAxiosRequestOptions,
  // The named type, not the `axios.` NAMESPACE: the namespace form resolves only under node16
  // module resolution, and this package also emits an ESM build under `bundler` resolution.
  AxiosResponse<any, any>['data'],
  AxiosInstance
> {
  /**
   * One agent for the instance, not one per request. Built here so TLS verification is decided
   * ONCE, at construction, rather than per call - and so connections are actually reused: a fresh
   * agent per request forces a new TCP and TLS handshake every time (measured: 10 handshakes for 10
   * requests, versus 1).
   */
  private readonly httpsAgent: https.Agent;

  constructor(opts: {
    name: string;
    defaultConfigs: AxiosRequestConfig;
    logger?: ILogger;
    /**
     * Turns OFF certificate verification for this instance. Node's own default is `true` and so is
     * this one; the previous code defaulted it to `false`, which silently accepted any certificate
     * on every HTTPS request the framework made.
     */
    rejectUnauthorized?: boolean;
  }) {
    super({ name: opts.name, variant: 'axios' });
    const { defaultConfigs } = opts;
    opts?.logger?.info('Creating new network request worker instance! Name: %s', this.name);

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: opts.rejectUnauthorized ?? true,
    });

    this.worker = axios.create({ ...defaultConfigs });
  }

  override send<T = any>(opts: IAxiosRequestOptions, logger?: ILogger) {
    const { url, method = HTTP.Methods.GET, params = {}, body: data, headers, ...rest } = opts;
    const props: AxiosRequestConfig = {
      url,
      method: method.toUpperCase(),
      params,
      data,
      headers,
      paramsSerializer: { serialize: p => stringify(p) },
      ...rest,
    };

    const protocol = this.getProtocol(url);
    if (protocol === HTTP.Protocols.HTTPS) {
      // A caller's own agent WINS. The previous code assigned after the `...rest` spread, so a
      // hardened agent - custom CA, pinning, mTLS - was overwritten and the secure path was
      // unreachable through the public seam.
      props.httpsAgent =
        rest.httpsAgent ??
        (opts.rejectUnauthorized === undefined
          ? this.httpsAgent
          : new https.Agent({ keepAlive: true, rejectUnauthorized: opts.rejectUnauthorized }));
    }

    logger?.for(this.send.name).info('URL: %s | Props: %s', url, redactSecrets(props));
    return this.worker.request<T>(props);
  }
}

export interface IAxiosNetworkRequestOptions {
  name: string;
  networkOptions: Omit<AxiosRequestConfig, 'baseURL'> & {
    baseUrl?: string;
  };
}

export class AxiosNetworkRequest extends BaseNetworkRequest<'axios'> {
  constructor(opts: IAxiosNetworkRequestOptions) {
    const { name, networkOptions } = opts;
    const { headers, baseUrl, timeout, ...rest } = networkOptions;

    const mergedHeaders: AnyObject = {
      ['content-type']: 'application/json; charset=utf-8',
      ...headers,
    };

    const defaultConfigs: AxiosRequestConfig = {
      withCredentials: true,
      validateStatus: (status: number) => status < 500,
      timeout: timeout ?? 60 * 1000,
      ...rest,
      baseURL: baseUrl,
      headers: mergedHeaders,
    };

    super({
      name,
      baseUrl,
      fetcher: new AxiosFetcher({ name, defaultConfigs }),
    });
  }
}
