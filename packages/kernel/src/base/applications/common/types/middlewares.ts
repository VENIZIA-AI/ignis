import type { Context } from 'hono';
import type { IPRestrictionRules as IIPRestrictionRules } from 'hono/ip-restriction';
import { type SecFetchSiteValues, type TCompressEncoding } from '../constants';

export interface IBaseMiddlewareOptions {
  /** Default `true`: only `false` switches the middleware off. */
  enable?: boolean;
  path?: string;
  [extra: string | symbol]: any;
}

export interface ICompressOptions extends IBaseMiddlewareOptions {
  encoding: TCompressEncoding;
  threshold?: number;
}

export type TOrigin =
  | string
  | string[]
  | ((
      origin: string,
      c: Context,
    ) => Promise<string | undefined | null> | string | undefined | null);
export interface ICORSOptions extends IBaseMiddlewareOptions {
  origin: TOrigin;
  allowMethods?: string[] | ((origin: string, c: Context) => Promise<string[]> | string[]);
  allowHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
  exposeHeaders?: string[];
}

export type TIsAllowedOriginHandler = (origin: string, context: Context) => boolean;
export type TSecFetchSite = (typeof SecFetchSiteValues)[number];
export type TIsAllowedSecFetchSiteHandler = (
  secFetchSite: TSecFetchSite,
  context: Context,
) => boolean;

export interface ICSRFOptions extends IBaseMiddlewareOptions {
  origin?: string | string[] | TIsAllowedOriginHandler;
  secFetchSite?: TSecFetchSite | TSecFetchSite[] | TIsAllowedSecFetchSiteHandler;
}

export interface IBodyLimitOptions extends IBaseMiddlewareOptions {
  maxSize: number;
  onError?: (c: Context) => Response | Promise<Response>;
}

export interface IRequestIdOptions extends IBaseMiddlewareOptions {}

export interface IMiddlewareConfigs {
  requestId?: IRequestIdOptions;
  /** Typed only: the framework installs no compress middleware. Wire it in `setupMiddlewares()`. */
  compress?: ICompressOptions;
  /** Installed first, before the request id and the body limit, so early framework responses carry its headers. */
  cors?: ICORSOptions;
  /** Typed only: the framework installs no csrf middleware. Wire it in `setupMiddlewares()`. */
  csrf?: ICSRFOptions;
  /** Installed right after the request id, ahead of every other middleware, so none of them reads a body over it. */
  bodyLimit?: IBodyLimitOptions;
  /** Typed only: the framework installs no ip restriction. Wire it in `setupMiddlewares()`. */
  ipRestriction?: IBaseMiddlewareOptions & IIPRestrictionRules;
  [extra: string | symbol]: any;
}
