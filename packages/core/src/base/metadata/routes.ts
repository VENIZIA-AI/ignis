import { RouteConfig } from '@hono/zod-openapi';
import { HTTP, IControllerMetadata, MetadataRegistry, TAuthStrategy } from '@vez/ignis-helpers';

// --------------------------------------------------------------------------------------------
export const controller = (metadata: IControllerMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setControllerMetadata({ target, metadata });
  };
};

// --------------------------------------------------------------------------------------------
export const api = <RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
  configs: RC;
}) => {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    MetadataRegistry.getInstance().addRoute({
      target,
      methodName: propertyKey,
      configs: opts.configs,
    });

    return descriptor;
  };
};

// --------------------------------------------------------------------------------------------
export const get = <RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
  configs: Omit<RC, 'method'>;
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.GET } });
};

export const post = <RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
  configs: Omit<RC, 'method'>;
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.POST } });
};

export const put = <RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
  configs: Omit<RC, 'method'>;
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.PUT } });
};

export const patch = <RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
  configs: Omit<RC, 'method'>;
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.PATCH } });
};

export const del = <RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
  configs: Omit<RC, 'method'>;
}) => {
  return api({ configs: { ...opts.configs, method: HTTP.Methods.DELETE } });
};
