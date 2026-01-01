import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import { createRoute, Hook, OpenAPIHono } from '@hono/zod-openapi';
import { IConfigurable, TAuthStrategy, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';

export type TLazyRouteHandler<RC extends RouteConfig, RouteEnv extends Env = Env> = RC extends RC
  ? RouteHandler<RC, RouteEnv>
  : never;

export type TRouteDefinition<
  RC extends RouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> = {
  configs: ReturnType<typeof createRoute<string, RC>>;
  route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
};

export type TRouteBindingOptions<
  RC extends RouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> = {
  configs: RC;
  to: (opts: {
    handler: TLazyRouteHandler<RC, RouteEnv>;
  }) => TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath>;
};

export type TAuthRouteConfig<RC extends RouteConfig> = RC & {
  authStrategies?: readonly TAuthStrategy[];
};

/**
 * Extract the context type from a route config for use in decorated handler methods
 *
 * @example
 * ```typescript
 * const config = {
 *   path: '/test',
 *   method: 'post',
 *   request: { body: jsonContent({ schema: z.object({ name: z.string() }) }) },
 *   responses: { 200: jsonContent({ schema: z.object({ id: z.string() }) }) }
 * } as const;
 *
 * class MyController extends BaseController {
 *   @post({ configs: config })
 *   myMethod(context: TRouteContext<typeof config>): TRouteResponse<typeof config> {
 *     const body = context.req.valid('json'); // typed as { name: string }
 *     return context.json({ id: '123' }, 200); // validated against response schema
 *   }
 * }
 * ```
 */
export type TRouteContext<
  RC extends TAuthRouteConfig<RouteConfig>,
  RouteEnv extends Env = Env,
> = Parameters<TLazyRouteHandler<RC, RouteEnv>>[0];

/**
 * Extract the return type from a route config for use in decorated handler methods.
 *
 * **Note:** This type is optional for decorated methods, as TypeScript can automatically
 * infer and validate the return type from the route configuration. It can be useful for
 * explicit clarity or in complex scenarios.
 *
 * @example
 * ```typescript
 * const config = {
 *   path: '/test',
 *   method: 'get',
 *   responses: { 200: jsonContent({ schema: z.object({ message: z.string() }) }) }
 * } as const;
 *
 * class MyController extends BaseController {
 *   @get({ configs: config })
 *   myMethod(context: TRouteContext<typeof config>) { // TRouteResponse is optional here
 *     // Return type is validated - must return Response or TypedResponse matching the schema
 *     return context.json({ message: 'hello' }, 200);
 *   }
 * }
 * ```
 */
export type TRouteResponse<
  RC extends TAuthRouteConfig<RouteConfig>,
  RouteEnv extends Env = Env,
> = ReturnType<TLazyRouteHandler<RC, RouteEnv>>;

// ----------------------------------------------------------------------------------------------------------------------------------------
// Controller Interface
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions, OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  bindRoute<RC extends TAuthRouteConfig<RouteConfig>>(opts: {
    configs: RC;
  }): TRouteBindingOptions<RC, RouteEnv, RouteSchema, BasePath>;

  defineRoute<RC extends TAuthRouteConfig<RouteConfig>>(opts: {
    configs: RC;
    handler: TLazyRouteHandler<RC, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath>;
}

// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IControllerOptions {
  scope: string;
  /**
   * Controller base path. If not provided, will be read from @controller decorator.
   * At least one of decorator path or constructor path must be provided.
   */
  path?: string;
  isStrict?: boolean;
}
