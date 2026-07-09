import type { OpenAPIHono } from '@hono/zod-openapi';
import type { IBootOptions } from '@venizia/ignis-boot';
import type { ValueOrPromise } from '@venizia/ignis-helpers';
import type { Context, Env, Schema } from 'hono';
import type { IPRestrictionRules as IIPRestrictionRules } from 'hono/ip-restriction';
import type { TControllerTransport } from '../controllers/common/constants';
import type {
  IComponentMixin,
  IControllerMixin,
  IRepositoryMixin,
  IServiceMixin,
  IStaticServeMixin,
} from '../mixins/types';

export interface IBaseMiddlewareOptions {
  enable: boolean;
  path?: string;
  [extra: string | symbol]: any;
}

export interface ICompressOptions extends IBaseMiddlewareOptions {
  encoding: 'gzip' | 'deflate';
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

export interface IBodyLimitOptions extends IBaseMiddlewareOptions {
  maxSize: number;
  onError?: (c: Context) => Response | Promise<Response>;
}

export interface IRequestIdOptions extends IBaseMiddlewareOptions {}

export type TBunServerInstance = ReturnType<typeof Bun.serve>;
export type TNodeServerInstance = any; // Will be set at runtime from @hono/node-server

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
  requestId?: { isStrict: boolean };
  favicon?: string;
  error?: { rootKey: string };
  asyncContext?: { enable: boolean };
  bootOptions?: IBootOptions;
  debug?: { shouldShowRoutes?: boolean };
  /** Controller transports to enable. Defaults to ['rest']. */
  transports?: TControllerTransport[];
  [key: string]: any;
}

export interface IApplicationInfo {
  name: string;
  version: string;
  description: string;
  author?: { name: string; email: string; url?: string };
  [extra: string | symbol]: any;
}

export interface IApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = Schema,
  BasePath extends string = '/',
> {
  getProjectRoot(): string;
  getProjectConfigs(): IApplicationConfigs;
  getServerHost(): string;
  getServerPort(): number;
  getServerAddress(): string;
  getServer(): OpenAPIHono<AppEnv, AppSchema, BasePath>;
  getRootRouter(): OpenAPIHono<AppEnv, AppSchema, BasePath>;

  setupMiddlewares(): ValueOrPromise<void>;

  initialize(): ValueOrPromise<void>;
  start(): ValueOrPromise<void>;
  stop(): ValueOrPromise<void>;
}

export interface IRestApplication
  extends
    IApplication,
    IComponentMixin,
    IControllerMixin,
    IRepositoryMixin,
    IServiceMixin,
    IStaticServeMixin {}
