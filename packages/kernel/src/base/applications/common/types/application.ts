import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import type { TControllerTransport } from '../../../controllers/common/constants';
import type {
  IComponentMixin,
  IControllerMixin,
  IRepositoryMixin,
  IServiceMixin,
  IStaticServeMixin,
} from '../../../mixins/types';
import type { IApplicationBootOptions, TArtifactIndexInput } from './artifacts';

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
