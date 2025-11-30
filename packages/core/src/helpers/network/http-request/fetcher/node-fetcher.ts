import { stringify } from 'node:querystring';
import { AbstractNetworkFetchableHelper, IRequestOptions } from './base-fetcher';

export interface INodeFetchRequestOptions extends RequestInit, IRequestOptions {
  url: string;
  params?: Record<string | symbol, any>;
}

// -------------------------------------------------------------
export class NodeFetcher extends AbstractNetworkFetchableHelper<
  'node-fetch',
  INodeFetchRequestOptions,
  Awaited<ReturnType<typeof fetch>>
> {
  private defaultConfigs: RequestInit;

  constructor(opts: { name: string; defaultConfigs: RequestInit; logger?: any }) {
    super({ name: opts.name, variant: 'node-fetch' });
    const { name, defaultConfigs } = opts;
    this.name = name;
    opts?.logger?.info('Creating new network request worker instance! Name: %s', this.name);

    this.defaultConfigs = defaultConfigs;
  }

  // -------------------------------------------------------------
  // SEND REQUEST
  // -------------------------------------------------------------
  override async send(opts: INodeFetchRequestOptions, logger?: any) {
    const { url, method = 'get', params, body, headers, timeout, signal, ...rest } = opts;

    let timeoutId: NodeJS.Timeout | undefined;
    let abortController: AbortController | undefined;

    if (timeout) {
      abortController = new AbortController();
      timeoutId = setTimeout(() => {
        abortController?.abort();
      }, timeout);
    }

    const requestConfigs: RequestInit = {
      ...this.defaultConfigs,
      ...rest,
      method,
      body,
      headers,
      signal: abortController?.signal ?? signal,
    };

    let requestUrl = '';
    const urlParts = [url];
    if (params) {
      urlParts.push(stringify(params));
      requestUrl = urlParts.join('?');
    } else {
      requestUrl = urlParts.join();
    }

    logger?.info('[send] URL: %s | Props: %o | Timeout: %s', url, requestConfigs, timeout);

    try {
      return await fetch(requestUrl, requestConfigs);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
