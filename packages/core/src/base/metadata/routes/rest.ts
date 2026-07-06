import { MetadataRegistry } from '@/helpers/inversion';
import { HTTP } from '@venizia/ignis-helpers';
import { IAuthRouteConfig } from '../../controllers';

/** Generic route decorator. Registers route config in metadata registry. */
export const api = <RestRouteConfigType extends IAuthRouteConfig>(opts: {
  configs: RestRouteConfigType;
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

/** GET route decorator. Equivalent to @api but automatically sets method to 'get'. */
export const get = <RestRouteConfigType extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RestRouteConfigType;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.GET },
  });
};

/** POST route decorator. Equivalent to @api but automatically sets method to 'post'. */
export const post = <RestRouteConfigType extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RestRouteConfigType;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.POST },
  });
};

/** PUT route decorator. Equivalent to @api but automatically sets method to 'put'. */
export const put = <RestRouteConfigType extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RestRouteConfigType;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.PUT },
  });
};

/** PATCH route decorator. Equivalent to @api but automatically sets method to 'patch'. */
export const patch = <RestRouteConfigType extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RestRouteConfigType;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.PATCH },
  });
};

/** DELETE route decorator. Equivalent to @api but automatically sets method to 'delete'. */
export const del = <RestRouteConfigType extends Omit<IAuthRouteConfig, 'method'>>(opts: {
  configs: RestRouteConfigType;
}) => {
  return api({
    configs: { ...opts.configs, method: HTTP.Methods.DELETE },
  });
};
