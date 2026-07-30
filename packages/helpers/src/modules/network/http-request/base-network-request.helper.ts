import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import isEmpty from 'lodash/isEmpty';
import { IFetchable, IRequestOptions } from './fetcher/base-fetcher';
import { TFetcherResponse, TFetcherWorker } from './fetcher/types';
import { TFetcherVariant } from './types';

export class BaseNetworkRequest<T extends TFetcherVariant> extends BaseHelper {
  protected baseUrl: string;
  protected fetcher: IFetchable<T, IRequestOptions, TFetcherResponse<T>, TFetcherWorker<T>>;

  constructor(opts: {
    name: string;
    baseUrl?: string;
    fetcher: IFetchable<T, IRequestOptions, TFetcherResponse<T>, TFetcherWorker<T>>;
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
          path = `/${path}`;
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
      baseUrl = baseUrl.slice(0, -1);
    }

    const joined = this.getRequestPath({ paths });
    return `${baseUrl ?? this.baseUrl}${joined}`;
  }

  getNetworkService() {
    return this.fetcher;
  }

  getWorker(): TFetcherWorker<T> {
    return this.fetcher.getWorker();
  }
}
