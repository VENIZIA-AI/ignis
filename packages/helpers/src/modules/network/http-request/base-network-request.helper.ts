import { HTTP } from '@/common/constants/http';
import { ObjectUtility } from '@venizia/ignis-inversion';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { UrlBuilder } from '../utilities/url-builder';
import { type TFetcherVariant } from './common';
import { type IFetchable, type IRequestOptions } from './fetcher/base-fetcher';
import { type TFetcherResponse, type TFetcherWorker } from './fetcher/common';

/** Base of a client for one third-party HTTP API: holds the `baseUrl` and a fetcher, and builds request urls from path segments. `getRequestUrl` throws a 500 error when no base url is set. */
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

  /** The paths as one path: each with one leading slash. */
  getRequestPath(opts: { paths: Array<string> }) {
    return UrlBuilder.toText({ baseUrl: '', paths: opts?.paths ?? [] });
  }

  /**
   * The url of a request: the base and the paths, checked by `UrlBuilder.join`. A path may not be a dot segment, hide one,
   * carry a backslash, a control character or an empty segment (`a//b`); a relative base is resolved against the page.
   */
  getRequestUrl(opts: { baseUrl?: string; paths: Array<string> }) {
    const baseUrl = opts?.baseUrl ?? this.baseUrl ?? '';

    if (!baseUrl || ObjectUtility.isEmpty({ value: baseUrl })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[getRequestUrl] Invalid configuration for third party request base url!',
      });
    }

    const url = UrlBuilder.join({
      baseUrl,
      paths: opts?.paths ?? [],
      scope: this.scope,
      isDoubleSlashRefused: true,
    });

    return url.toString();
  }

  getNetworkService() {
    return this.fetcher;
  }

  getWorker(): TFetcherWorker<T> {
    return this.fetcher.getWorker();
  }
}
