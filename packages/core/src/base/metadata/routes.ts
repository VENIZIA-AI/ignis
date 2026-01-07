import { IControllerMetadata, MetadataRegistry } from '@/helpers/inversion';
import { HTTP } from '@venizia/ignis-helpers';
import { IAuthenticateRouteConfig as IAuthenticateRouteConfig } from '../controllers';

// --------------------------------------------------------------------------------------------
export const controller = (metadata: IControllerMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setControllerMetadata({ target, metadata });
  };
};

// --------------------------------------------------------------------------------------------
/**
 * Decorator for defining API routes.
 *
 * Registers the route configuration with the metadata registry.
 * Use `valid<T>('target')` for explicit typing of validated request data.
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
 *   pingPong(context: TTypedContext) {
 *     const { message } = context.req.valid<{ message: string }>('json');
 *     return context.json({ reply: message }, 200);
 *   }
 * }
 * ```
 */
export const api = <RouteConfig extends IAuthenticateRouteConfig>(opts: {
  configs: RouteConfig;
}) => {
  return function (
    target: any,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor,
  ): void {
    MetadataRegistry.getInstance().addRoute({
      target,
      methodName: propertyKey,
      configs: opts.configs,
    });
  };
};

// --------------------------------------------------------------------------------------------
/** GET route decorator. Equivalent to @api but automatically sets method to 'get'. */
export const get = <RouteConfig extends Omit<IAuthenticateRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.GET } as RouteConfig & {
      method: typeof HTTP.Methods.GET;
    },
  });
};

/** POST route decorator. Equivalent to @api but automatically sets method to 'post'. */
export const post = <RouteConfig extends Omit<IAuthenticateRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.POST } as RouteConfig & {
      method: typeof HTTP.Methods.POST;
    },
  });
};

/** PUT route decorator. Equivalent to @api but automatically sets method to 'put'. */
export const put = <RouteConfig extends Omit<IAuthenticateRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.PUT } as RouteConfig & {
      method: typeof HTTP.Methods.PUT;
    },
  });
};

/** PATCH route decorator. Equivalent to @api but automatically sets method to 'patch'. */
export const patch = <RouteConfig extends Omit<IAuthenticateRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.PATCH } as RouteConfig & {
      method: typeof HTTP.Methods.PATCH;
    },
  });
};

/** DELETE route decorator. Equivalent to @api but automatically sets method to 'delete'. */
export const del = <RouteConfig extends Omit<IAuthenticateRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.DELETE } as RouteConfig & {
      method: typeof HTTP.Methods.DELETE;
    },
  });
};
