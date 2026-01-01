import { RouteConfig } from '@hono/zod-openapi';
import { TAuthRouteConfig, TRouteContext, TRouteResponse } from '../controllers';
import { IControllerMetadata, MetadataRegistry } from '@/helpers/inversion';
import { HTTP } from '@venizia/ignis-helpers';

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
export const get = <RC extends Omit<TAuthRouteConfig<RouteConfig>, 'method'>>(opts: {
  configs: RC;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.GET } as RC & {
      method: typeof HTTP.Methods.GET;
    },
  });
};

/**
 * POST route decorator with automatic type inference
 * Equivalent to @api but automatically sets method to 'post'
 */
export const post = <RC extends Omit<TAuthRouteConfig<RouteConfig>, 'method'>>(opts: {
  configs: RC;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.POST } as RC & {
      method: typeof HTTP.Methods.POST;
    },
  });
};

/**
 * PUT route decorator with automatic type inference
 * Equivalent to @api but automatically sets method to 'put'
 */
export const put = <RC extends Omit<TAuthRouteConfig<RouteConfig>, 'method'>>(opts: {
  configs: RC;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.PUT } as RC & {
      method: typeof HTTP.Methods.PUT;
    },
  });
};

/**
 * PATCH route decorator with automatic type inference
 * Equivalent to @api but automatically sets method to 'patch'
 */
export const patch = <RC extends Omit<TAuthRouteConfig<RouteConfig>, 'method'>>(opts: {
  configs: RC;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.PATCH } as RC & {
      method: typeof HTTP.Methods.PATCH;
    },
  });
};

/**
 * DELETE route decorator with automatic type inference
 * Equivalent to @api but automatically sets method to 'delete'
 */
export const del = <RC extends Omit<TAuthRouteConfig<RouteConfig>, 'method'>>(opts: {
  configs: RC;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.DELETE } as RC & {
      method: typeof HTTP.Methods.DELETE;
    },
  });
};
