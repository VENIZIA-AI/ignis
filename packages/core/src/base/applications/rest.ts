import { CoreBindings } from '@/common/bindings';
import { OpenAPIHono } from '@hono/zod-openapi';
import { RuntimeModules } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import { showRoutes as showApplicationRoutes } from 'hono/dev';
import { AbstractApplication } from './abstract';
import type { IApplicationConfigs, TBunServerInstance, TNodeServerInstance } from './types';

/** Adds the `OpenAPIHono` router surface on top of `AbstractApplication` - no listening server, so this is the layer a browser Worker or gRPC-only host can extend without pulling in `Bun.serve` / `@hono/node-server`. */
export abstract class RestApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
> extends AbstractApplication {
  protected server:
    | {
        hono: OpenAPIHono<AppEnv, AppSchema, BasePath>;
        runtime: typeof RuntimeModules.BUN;
        instance?: TBunServerInstance;
      }
    | {
        hono: OpenAPIHono<AppEnv, AppSchema, BasePath>;
        runtime: typeof RuntimeModules.NODE;
        instance?: TNodeServerInstance;
      };

  protected rootRouter: OpenAPIHono<AppEnv, AppSchema, BasePath>;

  constructor(opts: { scope: string; config: IApplicationConfigs }) {
    super(opts);

    const honoServer = new OpenAPIHono<AppEnv, AppSchema, BasePath>({
      strict: this.configs.strictPath ?? true,
    });
    this.rootRouter = new OpenAPIHono({
      strict: this.configs.strictPath ?? true,
    });

    this.server = {
      hono: honoServer,
      runtime: RuntimeModules.detect(),
    };
  }

  getRootRouter(): OpenAPIHono<AppEnv, AppSchema, BasePath> {
    return this.rootRouter;
  }

  getServer(): OpenAPIHono<AppEnv, AppSchema, BasePath> {
    return this.server.hono;
  }

  protected override registerCoreBindings() {
    super.registerCoreBindings();

    this.bind<typeof this.server>({
      key: CoreBindings.APPLICATION_SERVER,
    }).toProvider(_ => this.server);
    this.bind<typeof this.rootRouter>({
      key: CoreBindings.APPLICATION_ROOT_ROUTER,
    }).toProvider(_ => this.rootRouter);
  }

  protected inspectRoutes() {
    const t = performance.now();
    const shouldShowRoutes = this.configs?.debug?.shouldShowRoutes ?? false;

    if (!shouldShowRoutes) {
      return;
    }

    this.logger.for(this.inspectRoutes.name).info('START | Inspect all application route(s)');
    showApplicationRoutes(this.getServer());
    this.logger
      .for(this.inspectRoutes.name)
      .info('DONE | Inspect all application route(s) | Took: %s (ms)', performance.now() - t);
  }
}
