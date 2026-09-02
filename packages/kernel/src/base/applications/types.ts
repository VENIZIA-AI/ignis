import type { OpenAPIHono } from '@hono/zod-openapi';
import type { TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Context, Env, Schema } from 'hono';
import type { IPRestrictionRules as IIPRestrictionRules } from 'hono/ip-restriction';
import type { BaseComponent } from '../components';
import type { TControllerTransport } from '../controllers/common/constants';
import type { IDataSource } from '../datasources';
import type {
  IComponentMixin,
  IControllerMixin,
  IRepositoryMixin,
  IServiceMixin,
  IStaticServeMixin,
} from '../mixins/types';
import type { IRepository } from '../repositories';
import type { IService } from '../services';

/** The shape `@venizia/ignis-boot`'s generator emits and `registerArtifacts()` consumes. Kinds are registered in this field order. */
export interface IArtifactIndex {
  dataSources?: ReadonlyArray<TClass<IDataSource>>;
  components?: ReadonlyArray<TClass<BaseComponent>>;
  repositories?: ReadonlyArray<TClass<IRepository>>;
  services?: ReadonlyArray<TClass<IService>>;
  controllers?: ReadonlyArray<TClass<unknown>>;
}

/** One index, or any nesting of arrays of indexes - a library exports one, an application composes several. */
export type TArtifactIndexInput = IArtifactIndex | TArtifactIndexInput[];

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

export interface IMiddlewareConfigs {
  requestId?: IRequestIdOptions;
  compress?: ICompressOptions;
  cors?: ICORSOptions;
  csrf?: ICSRFOptions;
  bodyLimit?: IBodyLimitOptions;
  ipRestriction?: IBaseMiddlewareOptions & IIPRestrictionRules;
  [extra: string | symbol]: any;
}

/**
 * Structural mirror of `@venizia/ignis-boot`'s `IBootOptions` - kernel does not depend on boot
 * (boot sits beside kernel in the Makefile chain, `{boot, kernel} -> core`; importing boot's type
 * here would invert that). Both shapes are the same artifact-glob bag keyed by artifact type, so a
 * real `IBootOptions` value is structurally assignable to this without a cast.
 */
export interface IApplicationArtifactOptions {
  dirs?: string[];
  extensions?: string[];
  isNested?: boolean;
  glob?: string;
}

export interface IApplicationBootOptions {
  [artifactType: string]: IApplicationArtifactOptions | undefined;
}

/** No `host`/`port`: a browser Worker has neither, and carrying them here made one silently configured with `localhost:3000`. `@venizia/ignis` widens this shape with both - see its `IServerApplicationConfigs`. */
export interface IApplicationConfigs {
  path: { base: string; isStrict: boolean };
  requestId?: { isStrict: boolean };
  favicon?: string;
  /** `environment` is the host's ambient environment name. Set it where there is none to read - a browser Worker - so the error middleware can tell "no ambient environment" from "misconfigured". Absent on a server, which reads `process.env.NODE_ENV`. */
  error?: { rootKey?: string; environment?: string };
  asyncContext?: { enable: boolean };
  /** Generated indexes to register before `preConfigure` - one, or an array composed from several packages. */
  artifacts?: TArtifactIndexInput;
  /** @deprecated Runtime file-glob boot is gone. Kept only so an existing config still type-checks; ignored. */
  bootOptions?: IApplicationBootOptions;
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

/** Exactly what EVERY host implements. `getServerHost`/`getServerPort`/`getServerAddress`/`start`/`stop` are not here on purpose - a browser Worker can implement none of them; they live on `@venizia/ignis`'s `IServerApplication`. */
export interface IApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = Schema,
  BasePath extends string = '/',
> {
  getProjectRoot(): string;
  getProjectConfigs(): IApplicationConfigs;
  getServer(): OpenAPIHono<AppEnv, AppSchema, BasePath>;
  getRootRouter(): OpenAPIHono<AppEnv, AppSchema, BasePath>;

  setupMiddlewares(): ValueOrPromise<void>;

  initialize(): ValueOrPromise<void>;
}

export interface IRestApplication
  extends
    IApplication,
    IComponentMixin,
    IControllerMixin,
    IRepositoryMixin,
    IServiceMixin,
    IStaticServeMixin {}
