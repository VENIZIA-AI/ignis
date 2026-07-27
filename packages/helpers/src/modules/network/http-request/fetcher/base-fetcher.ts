import { AnyObject, HTTP, THttpMethod } from '@/common';
import { TFetcherResponse, TFetcherVariant, TFetcherWorker } from '../types';

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
  RS extends TFetcherResponse<V>,
> {
  send(opts: RQ, logger?: any): Promise<RS>;
  get(opts: RQ, logger?: any): Promise<RS>;
  post(opts: RQ, logger?: any): Promise<RS>;
  put(opts: RQ, logger?: any): Promise<RS>;
  patch(opts: RQ, logger?: any): Promise<RS>;
  delete(opts: RQ, logger?: any): Promise<RS>;
  query(opts: RQ, logger?: any): Promise<RS>;

  getWorker(): TFetcherWorker<V>;
}

export abstract class AbstractNetworkFetchableHelper<
  V extends TFetcherVariant,
  RQ extends IRequestOptions,
  RS extends TFetcherResponse<V>,
> implements IFetchable<V, RQ, RS> {
  protected name: string;
  protected variant: V;
  protected worker: TFetcherWorker<V>;

  constructor(opts: { name: string; variant: V }) {
    this.name = opts.name;
    this.variant = opts.variant;
  }

  abstract send(opts: RQ, logger?: any): Promise<RS>;

  getProtocol(url: string) {
    return url.startsWith('http:') ? HTTP.Protocols.HTTP : HTTP.Protocols.HTTPS;
  }

  getWorker() {
    return this.worker;
  }

  get(opts: RQ, logger?: any) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.GET }, logger);
  }

  post(opts: RQ, logger?: any) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.POST }, logger);
  }

  put(opts: RQ, logger?: any) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.PUT }, logger);
  }

  patch(opts: RQ, logger?: any) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.PATCH }, logger);
  }

  delete(opts: RQ, logger?: any) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.DELETE }, logger);
  }

  query(opts: RQ, logger?: any) {
    const { ...rest } = opts;
    return this.send({ ...rest, method: HTTP.Methods.QUERY }, logger);
  }
}
