import { BaseHelper } from '@/helpers/base';
import { AnyObject } from '@/common/types';
import { getError } from '@/helpers/error';
import isEmpty from 'lodash/isEmpty';
import { AxiosRequestConfig } from 'axios';
import { IFetchable, IRequestOptions } from './fetcher';
import { AxiosFetcher } from './fetcher/axios-fetcher';
import { NodeFetcher } from './fetcher/node-fetcher';
import { TFetcherResponse, TFetcherVariant } from './types';

// -----------------------------------------------------------------------------
export interface IAxiosNetworkRequestOptions {
  name: string;
  networkOptions: Omit<AxiosRequestConfig, 'baseURL'> & {
    baseUrl?: string;
  };
}

export interface INodeFetchNetworkRequestOptions {
  name: string;
  networkOptions: RequestInit & {
    baseUrl?: string;
  };
}

// -----------------------------------------------------------------------------
export class BaseNetworkRequest<T extends TFetcherVariant> extends BaseHelper {
  protected baseUrl: string;
  protected fetcher: IFetchable<T, IRequestOptions, TFetcherResponse<T>>;

  constructor(opts: {
    name: string;
    baseUrl?: string;
    fetcher: IFetchable<T, IRequestOptions, TFetcherResponse<T>>;
  }) {
    super({ scope: opts.name, identifier: opts.name });
    this.baseUrl = opts.baseUrl ?? '';
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
  constructor(opts: IAxiosNetworkRequestOptions) {
    const { name, networkOptions } = opts;
    const { headers, baseUrl, timeout, ...rest } = networkOptions;

    // Build headers with user values taking precedence
    const mergedHeaders: AnyObject = {
      ['content-type']: 'application/json; charset=utf-8',
      ...headers,
    };

    // User options override defaults
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

// -----------------------------------------------------------------------------
export class NodeFetchNetworkRequest extends BaseNetworkRequest<'node-fetch'> {
  constructor(opts: INodeFetchNetworkRequestOptions) {
    const { name, networkOptions } = opts;
    const { headers, baseUrl, ...rest } = networkOptions;

    // Build headers with user values taking precedence
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
      fetcher: new NodeFetcher({ name, defaultConfigs }),
    });
  }
}
