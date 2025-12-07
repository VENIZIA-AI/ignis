import { IControllerMetadata, MetadataRegistry } from '@vez/ignis-helpers';

export const controller = (metadata: IControllerMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.setControllerMetadata({ target, metadata });
  };
};

// const routeMetadata = new WeakMap<any, Map<string | symbol, RouteConfig>>();
//
// export function api<R extends RouteConfig>(config: R) {
//   return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
//     if (!routeMetadata.has(target)) {
//       routeMetadata.set(target, new Map());
//     }
//     routeMetadata.get(target)!.set(propertyKey, config);
//     return descriptor;
//   };
// }
//
// /**
//  * Decorator shortcuts for common HTTP methods
//  */
// export function get(path: string, config: Omit<RouteConfig, 'method' | 'path'> = {}) {
//   return api({ ...config, method: 'get', path } as RouteConfig);
// }
//
// export function post(path: string, config: Omit<RouteConfig, 'method' | 'path'> = {}) {
//   return api({ ...config, method: 'post', path } as RouteConfig);
// }
//
// export function put(path: string, config: Omit<RouteConfig, 'method' | 'path'> = {}) {
//   return api({ ...config, method: 'put', path } as RouteConfig);
// }
//
// export function patch(path: string, config: Omit<RouteConfig, 'method' | 'path'> = {}) {
//   return api({ ...config, method: 'patch', path } as RouteConfig);
// }
//
// export function del(path: string, config: Omit<RouteConfig, 'method' | 'path'> = {}) {
//   return api({ ...config, method: 'delete', path } as RouteConfig);
// }
