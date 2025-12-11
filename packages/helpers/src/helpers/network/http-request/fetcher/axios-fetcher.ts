import { AnyObject } from '@/common';
import axios, { AxiosRequestConfig } from 'axios';
import https from 'node:https';
import { stringify } from 'node:querystring';
import { AbstractNetworkFetchableHelper, IRequestOptions } from './base-fetcher';

export interface IAxiosRequestOptions extends AxiosRequestConfig, IRequestOptions {
  url: string;
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';
  params?: AnyObject;
  body?: AnyObject;
  headers?: AnyObject;
}

// -------------------------------------------------------------
export class AxiosFetcher extends AbstractNetworkFetchableHelper<
  'axios',
  IAxiosRequestOptions,
  axios.AxiosResponse<any, any>['data']
> {
  constructor(opts: { name: string; defaultConfigs: AxiosRequestConfig; logger?: any }) {
    super({ name: opts.name, variant: 'axios' });
    const { defaultConfigs } = opts;
    opts?.logger?.info('Creating new network request worker instance! Name: %s', this.name);

    this.worker = axios.create({ ...defaultConfigs });
  }

  // -------------------------------------------------------------
  // SEND REQUEST
  // -------------------------------------------------------------
  override send<T = any>(opts: IAxiosRequestOptions, logger?: any) {
    const { url, method = 'get', params = {}, body: data, headers, ...rest } = opts;
    const props: AxiosRequestConfig = {
      url,
      method,
      params,
      data,
      headers,
      paramsSerializer: { serialize: p => stringify(p) },
      ...rest,
    };

    const protocol = this.getProtocol(url);
    if (protocol === 'https') {
      props.httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
    }

    logger?.info('[send] URL: %s | Props: %o', url, props);
    return this.worker.request<T>(props);
  }
}
