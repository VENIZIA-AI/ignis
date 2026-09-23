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
} from '../../../mixins/common';
import type { TArtifactIndexInput } from './artifacts';

/** No `host`/`port`: a browser Worker has neither, and carrying them here made one silently configured with `localhost:3000`. `@venizia/ignis` widens this shape with both - see its `IServerApplicationConfigs`. */
export interface IApplicationConfigs {
  /**
   * `isStrict` (default `true`) makes `/users` and `/users/` different routes; `false` answers both.
   * Under `false`, declare routes without a trailing slash: a route declared as `/users/` answers
   * neither `/users` nor `/users/`.
   */
  path: { base: string; isStrict: boolean };
  requestId?: { isStrict: boolean };
  favicon?: string;

  /** `environment` is the host's ambient environment name. Set it where there is none to read - a browser Worker - so the error middleware can tell "no ambient environment" from "misconfigured". Absent on a server, which reads `process.env.NODE_ENV`. */
  error?: { rootKey?: string; environment?: string };

  /** Generated indexes to register before `preConfigure` - one, or an array composed from several packages. */
  artifacts?: TArtifactIndexInput;

  /** Registers every class a stereotype decorated, so an application lists none of its own. Off by default: an absent `artifacts` keeps meaning "register nothing", never "register everything". Both together register the union, de-duplicated - which is how an application discovers its own classes and still composes a library index. */
  discoverArtifacts?: boolean;

  /** Boot-time checks. Without `binding`, nothing is verified, and hand registration and same-key override stay allowed. */
  bootChecks?: {
    binding?: { doVerify: boolean; allowManual: boolean; allowOverride: boolean };
  };

  /** Controller transports to enable. Defaults to ['rest']. */
  transports?: TControllerTransport[];

  asyncContext?: { enable: boolean };
  debug?: { shouldShowRoutes?: boolean };

  /** How long `stop()` waits for one datasource's `close()` before it logs and moves on. Default `10_000`; `0` waits without limit. */
  dataSourceCloseTimeoutMs?: number;
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
