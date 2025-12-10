import { RouteConfig } from "@hono/zod-openapi";
import { HTTP, IControllerMetadata, MetadataRegistry } from "@venizia/ignis-helpers";
import { TAuthRouteConfig, TRouteContext, TRouteResponse } from "../controllers";

// --------------------------------------------------------------------------------------------
export const controller = (metadata: IControllerMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setControllerMetadata({ target, metadata });
  };
};

// --------------------------------------------------------------------------------------------
/**
 * Decorator for defining API routes with automatic type inference
 * The decorated method will be type-checked against the route config:
 * - Parameter must be TRouteContext<RC>
 * - Return type must be TRouteResponse<RC>
 *
 * @example
 * ```typescript
 * const config = {
 *   path: '/ping',
 *   method: 'post',
 *   request: { body: jsonContent({ schema: z.object({ message: z.string() }) }) },
 *   responses: { 200: jsonContent({ schema: z.object({ reply: z.string() }) }) }
 * } as const;
 *
 * class MyController extends BaseController {
 *   @api({ configs: config })
 *   pingPong(context) { // context is automatically typed as TRouteContext<typeof config>
 *     const { message } = context.req.valid('json'); // typed as { message: string }
 *     return context.json({ reply: message }, 200); // return type is validated
 *   }
 * }
 * ```
 */
export const api = <RC extends TAuthRouteConfig<RouteConfig>>(opts: { configs: RC }) => {
  return function <T extends (context: TRouteContext<RC>) => TRouteResponse<RC>>(
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> | void {
    MetadataRegistry.getInstance().addRoute({
      target,
      methodName: propertyKey,
      configs: opts.configs,
    });

    return descriptor;
  };
};

// --------------------------------------------------------------------------------------------
/**
 * GET route decorator with automatic type inference
 * Equivalent to @api but automatically sets method to 'get'
 */
export const get = <
  RC extends TAuthRouteConfig<RouteConfig>,
  Configs extends Omit<RC, "method"> = Omit<RC, "method">,
>(opts: {
  configs: Configs & { method: typeof HTTP.Methods.GET };
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.GET } });
};

/**
 * POST route decorator with automatic type inference
 * Equivalent to @api but automatically sets method to 'post'
 */
export const post = <
  RC extends TAuthRouteConfig<RouteConfig>,
  Configs extends Omit<RC, "method"> = Omit<RC, "method">,
>(opts: {
  configs: Configs & { method: typeof HTTP.Methods.POST };
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.POST } });
};

/**
 * PUT route decorator with automatic type inference
 * Equivalent to @api but automatically sets method to 'put'
 */
export const put = <
  RC extends TAuthRouteConfig<RouteConfig>,
  Configs extends Omit<RC, "method"> = Omit<RC, "method">,
>(opts: {
  configs: Configs & { method: typeof HTTP.Methods.PUT };
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.PUT } });
};

/**
 * PATCH route decorator with automatic type inference
 * Equivalent to @api but automatically sets method to 'patch'
 */
export const patch = <
  RC extends TAuthRouteConfig<RouteConfig>,
  Configs extends Omit<RC, "method"> = Omit<RC, "method">,
>(opts: {
  configs: Configs & { method: typeof HTTP.Methods.PATCH };
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.PATCH } });
};

/**
 * DELETE route decorator with automatic type inference
 * Equivalent to @api but automatically sets method to 'delete'
 */
export const del = <
  RC extends TAuthRouteConfig<RouteConfig>,
  Configs extends Omit<RC, "method"> = Omit<RC, "method">,
>(opts: {
  configs: Configs & { method: typeof HTTP.Methods.DELETE };
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.DELETE } });
};
