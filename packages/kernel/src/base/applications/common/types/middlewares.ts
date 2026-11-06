import type { Context } from 'hono';
import type { IPRestrictionRules as IIPRestrictionRules } from 'hono/ip-restriction';
import { type SecFetchSiteValues, type TCompressEncoding } from '../constants';

/** Options shared by every configurable middleware. Extra keys are allowed. */
export interface IBaseMiddlewareOptions {
  /**
   * Only `false` switches the middleware off.
   *
   * @default true
   */
  enable?: boolean;
  path?: string;
  [extra: string | symbol]: any;
}

/** Options of the compress middleware. Typed only: the framework does not install it. */
export interface ICompressOptions extends IBaseMiddlewareOptions {
  encoding: TCompressEncoding;
  threshold?: number;
}

/** Allowed origin for CORS: one origin, a list of origins, or a function that returns the origin to echo (or nothing to reject). A string or a list entry may be a subdomain wildcard such as `https://*.example.com`, or a pattern with `:*` for any port such as `http://localhost:*` or `https://*.example.com:*`: the scheme is matched exactly, so is the port unless it is `*`, the apex domain is not included by a subdomain wildcard, and the bare `'*'` still means any origin. */
export type TOrigin =
  | string
  | string[]
  | ((
      origin: string,
      c: Context,
    ) => Promise<string | undefined | null> | string | undefined | null);
/** Options of the CORS middleware the framework installs first. `origin` is required. */
export interface ICORSOptions extends IBaseMiddlewareOptions {
  origin: TOrigin;
  allowMethods?: string[] | ((origin: string, c: Context) => Promise<string[]> | string[]);
  allowHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
  exposeHeaders?: string[];
}

/** Decides whether the request `Origin` is allowed for the CSRF check. */
export type TIsAllowedOriginHandler = (origin: string, context: Context) => boolean;
/** One value of the `Sec-Fetch-Site` header, taken from `SecFetchSiteValues`. */
export type TSecFetchSite = (typeof SecFetchSiteValues)[number];
/** Decides whether the request `Sec-Fetch-Site` value is allowed for the CSRF check. */
export type TIsAllowedSecFetchSiteHandler = (
  secFetchSite: TSecFetchSite,
  context: Context,
) => boolean;

/** Options of the CSRF middleware. Typed only: the framework does not install it. */
export interface ICSRFOptions extends IBaseMiddlewareOptions {
  origin?: string | string[] | TIsAllowedOriginHandler;
  secFetchSite?: TSecFetchSite | TSecFetchSite[] | TIsAllowedSecFetchSiteHandler;
}

/** Options of the body limit middleware the framework installs right after the request id. `maxSize` is in bytes. */
export interface IBodyLimitOptions extends IBaseMiddlewareOptions {
  maxSize: number;
  onError?: (c: Context) => Response | Promise<Response>;
}

/** Options of the request id middleware. Only the shared options apply. */
export interface IRequestIdOptions extends IBaseMiddlewareOptions {}

/** The `configs.middlewares` shape: which framework middleware to switch off or configure. Extra keys are allowed. */
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
