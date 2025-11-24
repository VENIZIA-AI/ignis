import { BaseHelper } from '@/base/helpers';
import { AnyObject } from '@/common/types';
import { getError } from '@/helpers/error';
import isEmpty from 'lodash/isEmpty';
import { IFetchable, IRequestOptions } from './fetcher';
import { AxiosFetcher, IAxiosRequestOptions } from './fetcher/axios-fetcher';
import { NodeFetcher } from './fetcher/node-fetcher';
import { TFetcherResponse, TFetcherVariant } from './types';

// -----------------------------------------------------------------------------
export interface IFetcherRequestOptions<T extends TFetcherVariant> {
  name: string;
  variant: TFetcherVariant;
  networkOptions: {
    baseUrl?: string;
    headers?: AnyObject;
    timeout?: number;
    [extra: symbol | string]: any;
  };
  fetcher: IFetchable<T, IRequestOptions, TFetcherResponse<T>>;
}

export interface IAxiosNetworkOptions extends IFetcherRequestOptions<'axios'> {
  variant: 'axios';
}

export interface INodeFetchNetworkOptions extends IFetcherRequestOptions<'node-fetch'> {
  variant: 'node-fetch';
}

// -----------------------------------------------------------------------------
export class BaseNetworkRequest<T extends TFetcherVariant> extends BaseHelper {
  protected baseUrl: string;
  protected fetcher: IFetchable<T, IRequestOptions, TFetcherResponse<T>>;

  constructor(opts: IFetcherRequestOptions<T>) {
    super({ scope: opts.name, identifier: opts.name });

    const { networkOptions } = opts;
    const { baseUrl = '' } = networkOptions;

    this.baseUrl = baseUrl;
    this.fetcher = opts.fetcher;
  }

  getRequestPath(opts: { paths: Array<string> }) {
    const paths = opts?.paths ?? [];

    const rs = paths
      .map((path: string) => {
        if (!path.startsWith('/')) {
          path = `/${path}`; // Add / to the start of url path
        }

        return path;
      })
      .join('');

    return rs;
  }

  getRequestUrl(opts: { baseUrl?: string; paths: Array<string> }) {
    let baseUrl = opts?.baseUrl ?? this.baseUrl ?? '';
    const paths = opts?.paths ?? [];

    if (!baseUrl || isEmpty(baseUrl)) {
      throw getError({
        statusCode: 500,
        message: '[getRequestUrl] Invalid configuration for third party request base url!',
      });
    }

    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1); // Remove / at the end
    }

    const joined = this.getRequestPath({ paths });
    return `${baseUrl ?? this.baseUrl}${joined}`;
  }

  getNetworkService() {
    return this.fetcher;
  }

  getWorker() {
    return this.fetcher.getWorker();
  }
}

// -----------------------------------------------------------------------------
export class AxiosNetworkRequest extends BaseNetworkRequest<'axios'> {
  constructor(opts: Omit<IAxiosNetworkOptions, 'fetcher' | 'variant'>) {
    const { name, networkOptions } = opts;
    const { headers = {}, baseUrl, timeout = 60 * 1000, ...rest } = networkOptions;

    const defaultConfigs: Partial<IAxiosRequestOptions> = {
      ...rest,
      baseURL: baseUrl,
      withCredentials: true,
      headers: Object.assign({}, headers, {
        ['content-type']: headers['content-type'] ?? 'application/json; charset=utf-8',
      }),
      validateStatus: (status: number) => status < 500,
      timeout,
    };

    super({
      ...opts,
      variant: 'axios',
      fetcher: new AxiosFetcher({ name, defaultConfigs }),
    });
  }
}

// -----------------------------------------------------------------------------
export class NodeFetchNetworkRequest extends BaseNetworkRequest<'node-fetch'> {
  constructor(opts: Omit<INodeFetchNetworkOptions, 'fetcher' | 'variant'>) {
    const { name, networkOptions } = opts;
    const { headers = {}, ...rest } = networkOptions;

    const defaultConfigs: Partial<RequestInit> = {
      ...rest,
      headers: Object.assign({}, headers, {
        ['content-type']: headers['content-type'] ?? 'application/json; charset=utf-8',
      }),
    };

    super({
      ...opts,
      variant: 'node-fetch',
      fetcher: new NodeFetcher({ name, defaultConfigs }),
    });
  }
}
