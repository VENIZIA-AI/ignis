import { HTTP, THttpMethod } from '@/common/constants/http';
import { AnyObject } from '@/common/types';
import { TFetcherVariant } from '../types';

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
  send(opts: RQ, logger?: any): Promise<RS>;
  get(opts: RQ, logger?: any): Promise<RS>;
  post(opts: RQ, logger?: any): Promise<RS>;
  put(opts: RQ, logger?: any): Promise<RS>;
  patch(opts: RQ, logger?: any): Promise<RS>;
  delete(opts: RQ, logger?: any): Promise<RS>;
  query(opts: RQ, logger?: any): Promise<RS>;

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

  constructor(opts: { name: string; variant: V }) {
    this.name = opts.name;
    this.variant = opts.variant;
  }

  abstract send(opts: RQ, logger?: any): Promise<RS>;

  getProtocol(url: string) {
    return url.startsWith('http:') ? HTTP.Protocols.HTTP : HTTP.Protocols.HTTPS;
  }

  getVariant() {
    return this.variant;
  }

  getWorker(): W {
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
