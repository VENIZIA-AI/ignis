import { redactSecrets } from '@/common/redact';
import { HTTP, THttpMethod } from '@/common/constants/http';
import { AnyObject } from '@/common/types';
import { stringify } from 'node:querystring';
import { BaseNetworkRequest } from '../base-network-request.helper';
import { AbstractNetworkFetchableHelper, IRequestOptions } from './base-fetcher';

export interface INodeFetchRequestOptions extends RequestInit, IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: AnyObject;
}

export class NodeFetcher extends AbstractNetworkFetchableHelper<
  'node-fetch',
  INodeFetchRequestOptions,
  Awaited<ReturnType<typeof fetch>>,
  typeof fetch
> {
  private defaultConfigs: RequestInit;

  constructor(opts: { name: string; defaultConfigs: RequestInit; logger?: any }) {
    super({ name: opts.name, variant: 'node-fetch' });
    const { name, defaultConfigs } = opts;
    this.name = name;
    opts?.logger?.info('Creating new network request worker instance! Name: %s', this.name);

    this.defaultConfigs = defaultConfigs;
  }

  override async send(opts: INodeFetchRequestOptions, logger?: any) {
    const {
      url,
      method = HTTP.Methods.GET,
      params,
      body,
      headers,
      timeout,
      signal,
      ...rest
    } = opts;

    let timeoutId: NodeJS.Timeout | undefined;
    let timeoutController: AbortController | undefined;
    let effectiveSignal = signal;

    if (timeout) {
      timeoutController = new AbortController();
      timeoutId = setTimeout(() => {
        timeoutController?.abort();
      }, timeout);

      // Composed, never substituted: a timeout must not silently swallow the caller's own signal, or the caller would believe it cancelled a request that is in fact still running. Either source - and a signal already aborted before the call - aborts the request.
      effectiveSignal = signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal;
    }

    const requestConfigs: RequestInit = {
      ...this.defaultConfigs,
      ...rest,
      method: method.toUpperCase(),
      body,
      headers,
      signal: effectiveSignal,
    };

    // `?` only when the url carries no query string of its own - a second `?` is not a separator, so the server would read the previous parameter's value as `1?extra=2`.
    const serializedParams = params ? stringify(params) : '';
    const requestUrl = serializedParams
      ? `${url}${url.includes('?') ? '&' : '?'}${serializedParams}`
      : url;

    logger
      ?.for(this.send.name)
      .info('URL: %s | Props: %s | Timeout: %s', url, redactSecrets(requestConfigs), timeout);

    try {
      const rs = await fetch(requestUrl, requestConfigs);
      return rs;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

export interface INodeFetchNetworkRequestOptions {
  name: string;
  networkOptions: RequestInit & {
    baseUrl?: string;
  };
}

export class NodeFetchNetworkRequest extends BaseNetworkRequest<'node-fetch'> {
  constructor(opts: INodeFetchNetworkRequestOptions) {
    const { name, networkOptions } = opts;
    const { headers, baseUrl, ...rest } = networkOptions;

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
