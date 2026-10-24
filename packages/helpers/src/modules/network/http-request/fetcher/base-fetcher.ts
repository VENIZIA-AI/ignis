import { HTTP, type THttpMethod } from '@/common/constants/http';
import { type AnyObject } from '@/common/types';
// The leaf file, never the logger BARREL: that barrel reaches `node:module` and would drag this
// browser-pure fetcher contract with it.
import type { ILogger } from '@/modules/logger/common/types';
import { type TFetcherVariant } from '../common';

/** What a fetcher calls on the logger it is handed, so a host logger with only these two (a browser app's) is accepted as is. */
export type TFetcherLogger = Pick<ILogger, 'debug' | 'info'>;

export interface IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: AnyObject;
  timeout?: number;
  [extra: symbol | string]: any;
}

export interface IFetchable<
  V extends TFetcherVariant,
  RQ extends IRequestOptions,
  RS,
  W = unknown,
> {
  send(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
  get(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
  post(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
  put(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
  patch(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
  delete(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
  query(opts: RQ, logger?: TFetcherLogger): Promise<RS>;

  getVariant(): V;
  getWorker(): W;
}

/** `W` defaults to `unknown` so this stays free of `axios` - a concrete fetcher binds it to its real worker type (`AxiosInstance`, `typeof fetch`), which is then inherited on `this.worker` with no override needed. */
export abstract class AbstractNetworkFetchableHelper<
  V extends TFetcherVariant,
  RQ extends IRequestOptions,
  RS,
  W = unknown,
> implements IFetchable<V, RQ, RS, W> {
  protected name: string;
  protected variant: V;
  protected worker: W;

  constructor(opts: { name: string; variant: V; worker?: W }) {
    this.name = opts.name;
    this.variant = opts.variant;

    if (opts.worker !== undefined) {
      this.worker = opts.worker;
    }
  }

  abstract send(opts: RQ, logger?: TFetcherLogger): Promise<RS>;

  getProtocol(url: string) {
    return url.startsWith('http:') ? HTTP.Protocols.HTTP : HTTP.Protocols.HTTPS;
  }

  getVariant() {
    return this.variant;
  }

  getWorker(): W {
    return this.worker;
  }

  get(opts: RQ, logger?: TFetcherLogger) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.GET }, logger);
  }

  post(opts: RQ, logger?: TFetcherLogger) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.POST }, logger);
  }

  put(opts: RQ, logger?: TFetcherLogger) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.PUT }, logger);
  }

  patch(opts: RQ, logger?: TFetcherLogger) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.PATCH }, logger);
  }

  delete(opts: RQ, logger?: TFetcherLogger) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.DELETE }, logger);
  }

  query(opts: RQ, logger?: TFetcherLogger) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.QUERY }, logger);
  }
}
