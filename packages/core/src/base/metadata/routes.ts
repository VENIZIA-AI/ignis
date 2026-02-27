import { IControllerMetadata, MetadataRegistry } from '@/helpers/inversion';
import { HTTP } from '@venizia/ignis-helpers';
import { IAuthRouteConfig as IAuthRouteConfig } from '../controllers';

export const controller = (metadata: IControllerMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setControllerMetadata({ target, metadata });
  };
};

/** Generic route decorator. Registers route config in metadata registry. */
export const api = <RouteConfig extends IAuthRouteConfig>(opts: { configs: RouteConfig }) => {
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

/** GET route decorator. Equivalent to @api but automatically sets method to 'get'. */
export const get = <RouteConfig extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.GET } as RouteConfig & {
      method: typeof HTTP.Methods.GET;
    },
  });
};

/** POST route decorator. Equivalent to @api but automatically sets method to 'post'. */
export const post = <RouteConfig extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.POST } as RouteConfig & {
      method: typeof HTTP.Methods.POST;
    },
  });
};

/** PUT route decorator. Equivalent to @api but automatically sets method to 'put'. */
export const put = <RouteConfig extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.PUT } as RouteConfig & {
      method: typeof HTTP.Methods.PUT;
    },
  });
};

/** PATCH route decorator. Equivalent to @api but automatically sets method to 'patch'. */
export const patch = <RouteConfig extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.PATCH } as RouteConfig & {
      method: typeof HTTP.Methods.PATCH;
    },
  });
};

/** DELETE route decorator. Equivalent to @api but automatically sets method to 'delete'. */
export const del = <RouteConfig extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RouteConfig;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.DELETE } as RouteConfig & {
      method: typeof HTTP.Methods.DELETE;
    },
  });
};
