import { Hook, OpenAPIHono } from '@hono/zod-openapi';
import { ValueOrPromise } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import { AbstractController } from './abstract';
import {
  IAuthenticateRouteConfig,
  IBindRouteOptions,
  IDefineRouteOptions,
  TRouteHandler,
} from './common/types';

/**
 * Base controller class with default implementations for route binding.
 *
 * Extends {@link AbstractController} with concrete implementations of
 * {@link bindRoute} and {@link defineRoute}. This is the recommended
 * base class for creating custom controllers.
 *
 * @typeParam RouteEnv - Hono environment type for context variables
 * @typeParam RouteSchema - Combined schema type for all routes
 * @typeParam BasePath - Base path prefix for the router
 * @typeParam ConfigurableOptions - Options passed during configuration
 * @typeParam Definitions - Route definitions map type for strongly-typed method overrides
 *
 * @example
 * ```typescript
 * class UserController extends BaseController {
 *   async binding() {
 *     // Define routes using defineRoute
 *     this.defineRoute({
 *       configs: {
 *         path: '/',
 *         method: 'get',
 *         authenticate: { strategies: ['jwt'] },
 *         responses: { 200: jsonResponse({ schema: UserSchema }) }
 *       },
 *       handler: async (c) => {
 *         const users = await this.userService.findAll();
 *         return c.json(users);
 *       }
 *     });
 *
 *     // Or use fluent bindRoute pattern
 *     this.bindRoute({
 *       configs: { path: '/{id}', method: 'get', ... }
 *     }).to({
 *       handler: (c) => c.json({ id: c.req.param('id') })
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  Definitions extends Record<string, IAuthenticateRouteConfig> = Record<
    string,
    IAuthenticateRouteConfig
  >,
> extends AbstractController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions, Definitions> {
  /**
   * Helper method to cast to Hono OpenAPI Handler
   */
  toHonoHandler<ResponseType = unknown>(opts: { handler: TRouteHandler<ResponseType, RouteEnv> }) {
    return opts.handler as Parameters<OpenAPIHono<RouteEnv>['openapi']>[1];
  }

  /**
   * Creates a fluent binding for registering a route.
   *
   * Returns an object with a `to()` method for attaching the handler.
   * Useful for conditional binding or when you need access to the binding object.
   *
   * @typeParam RouteConfig - The route configuration type
   * @param opts - Object containing route configuration
   * @returns Binding options with `to()` method
   *
   * @example
   * ```typescript
   * const binding = this.bindRoute({ configs: myRouteConfig });
   * binding.to({ handler: myHandler });
   * ```
   */
  bindRoute<RouteConfig extends IAuthenticateRouteConfig>(opts: {
    configs: RouteConfig;
  }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getRouteConfigs<RouteConfig>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      to: ({ handler }) => {
        return {
          configs: routeConfigs,
          route: this.router.openapi(routeConfigs, this.toHonoHandler({ handler })),
        };
      },
    };
  }

  /**
   * Defines and registers a route with its handler in a single call.
   *
   * This is the preferred method for registering routes. It automatically:
   * - Processes authentication strategies into middleware
   * - Adds OpenAPI security requirements
   * - Tags the route with the controller scope
   *
   * @typeParam RouteConfig - The route configuration type
   * @param opts - Object containing route config, handler, and optional hook
   * @returns The registered route definition
   *
   * @example
   * ```typescript
   * this.defineRoute({
   *   configs: {
   *     path: '/users',
   *     method: 'get',
   *     authenticate: { strategies: ['jwt'] },
   *     responses: { 200: jsonResponse({ schema: z.array(UserSchema) }) }
   *   },
   *   handler: async (c) => {
   *     const users = await db.select().from(usersTable);
   *     return c.json(users, 200);
   *   }
   * });
   * ```
   */
  defineRoute<RouteConfig extends IAuthenticateRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getRouteConfigs<RouteConfig>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      route: this.router.openapi(
        routeConfigs,
        this.toHonoHandler<ResponseType>({ handler: opts.handler }),
        opts.hook,
      ),
    };
  }

  /**
   * Define a JSX route that renders server-side HTML
   * Scope: [BaseController][defineJSXRoute]
   *
   * JSX routes use Hono's built-in JSX support to render components to HTML.
   * The handler must return c.html() with the JSX component.
   *
   * @example
   * ```typescript
   * this.defineJSXRoute({
   *   configs: {
   *     path: '/profile',
   *     method: 'get',
   *     description: 'User profile page',
   *   },
   *   handler: (c) => {
   *     const user = c.get('user');
   *     return c.html(<ProfilePage user={user} />);
   *   }
   * });
   * ```
   *
   * @param opts - Route configuration and handler
   * @returns Route definition
   */
  defineJSXRoute<RouteConfig extends IAuthenticateRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getJSXRouteConfigs<RouteConfig>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      // Cast handler: TTypedContext is a type overlay compatible at runtime
      route: this.router.openapi(routeConfigs, opts.handler as any, opts.hook),
    };
  }
}
