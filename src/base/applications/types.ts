import { ValueOrPromise } from '@/common/types';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Env, Schema } from 'hono';
import { IPRestrictionRules as IIPRestrictionRules } from 'hono/ip-restriction';
import {
  IComponentMixin,
  IControllerMixin,
  IRepositoryMixin,
  IServiceMixin,
  IStaticServeMixin,
} from '../mixins/types';

// ------------------------------------------------------------------------------
// Common Middleware Options
// ------------------------------------------------------------------------------
export interface IBaseMiddlewareOptions {
  enable: boolean;
  path?: string;
  [extra: string | symbol]: any;
}

// ------------------------------------------------------------------------------
// Compress Middleware Options
// ------------------------------------------------------------------------------
export interface ICompressOptions extends IBaseMiddlewareOptions {
  encoding: 'gzip' | 'deflate';
  threshold?: number;
}

// ------------------------------------------------------------------------------
// CORS Middleware Options
// ------------------------------------------------------------------------------
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

// ------------------------------------------------------------------------------
// CSRF Middleware Options
// ------------------------------------------------------------------------------
export type TIsAllowedOriginHandler = (origin: string, context: Context) => boolean;
export const SecFetchSiteValues = ['same-origin', 'same-site', 'none', 'cross-site'] as const;
export type TSecFetchSite = (typeof SecFetchSiteValues)[number];
export type TIsAllowedSecFetchSiteHandler = (
  secFetchSite: TSecFetchSite,
  context: Context,
) => boolean;

export interface ICSRFOptions extends IBaseMiddlewareOptions {
  origin?: string | string[] | TIsAllowedOriginHandler;
  secFetchSite?: TSecFetchSite | TSecFetchSite[] | TIsAllowedSecFetchSiteHandler;
}

// ------------------------------------------------------------------------------
// Body Limit Middleware Options
// ------------------------------------------------------------------------------
export interface IBodyLimitOptions extends IBaseMiddlewareOptions {
  maxSize: number;
  onError?: (c: Context) => Response | Promise<Response>;
}

// ------------------------------------------------------------------------------
// RequestId Middleware Options
// ------------------------------------------------------------------------------
export interface IRequestIdOptions extends IBaseMiddlewareOptions {}

// ------------------------------------------------------------------------------
// Application
// ------------------------------------------------------------------------------
export type TBunServerInstance = ReturnType<typeof Bun.serve>;
export type TNodeServerInstance = any; // Will be set at runtime from @hono/node-server

// ------------------------------------------------------------------------------
export interface IMiddlewareConfigs {
  requestId?: IRequestIdOptions;
  compress?: ICompressOptions;
  cors?: ICORSOptions;
  csrf?: ICSRFOptions;
  bodyLimit?: IBodyLimitOptions;
  ipRestriction?: IBaseMiddlewareOptions & IIPRestrictionRules;
  [extra: string | symbol]: any;
}

export interface IApplicationConfigs {
  host?: string;
  port?: number;
  path: { base: string; isStrict: boolean };

  // middlewares: IMiddlewareConfigs;

  autoLoad?: {
    dirs: {
      [key: string | symbol]: { path: string };
    };
  };

  debug?: {
    showRoutes?: boolean;
  };

  [key: string]: any;
}

export interface IApplicationInfo {
  name: string;
  version: string;
  description: string;
  author?: { name: string; email: string; url?: string };
  [extra: string | symbol]: any;
}

// ------------------------------------------------------------------------------
export interface IApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = Schema,
  BasePath extends string = '/',
> {
  initialize(): ValueOrPromise<void>;

  setupMiddlewares(): ValueOrPromise<void>;

  getProjectConfigs(): IApplicationConfigs;
  getProjectRoot(): string;
  getRootRouter(): OpenAPIHono;

  getServer(): OpenAPIHono<AppEnv, AppSchema, BasePath>;
  getServerHost(): string;
  getServerPort(): number;
  getServerAddress(): string;

  start(): ValueOrPromise<void>;
  stop(): ValueOrPromise<void>;
}

// ------------------------------------------------------------------------------
export interface IRestApplication
  extends IApplication,
    IComponentMixin,
    IControllerMixin,
    IRepositoryMixin,
    IServiceMixin,
    IStaticServeMixin {}
