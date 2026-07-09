import type { IAuthRouteConfig } from '@/base/controllers/common/types';
import type { TMixinTarget } from '@venizia/ignis-helpers';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../../common/keys';

export const RestControllerMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    /** Get all routes from a controller class. */
    getRoutes<Target extends object = object>(opts: {
      target: Target;
    }): Map<string | symbol, IAuthRouteConfig> | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.CONTROLLER_REST_ROUTE, target);
    }

    /** Get a specific route by method name. */
    getRoute<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
    }): IAuthRouteConfig | undefined {
      const { target, methodName } = opts;
      const routes = this.getRoutes({ target });
      return routes?.get(methodName);
    }

    /** Check if a class has any routes defined. */
    hasRoutes<Target extends object = object>(opts: { target: Target }): boolean {
      const routes = this.getRoutes(opts);
      return routes !== undefined && routes.size > 0;
    }

    /** Add a route to a controller class. */
    addRoute<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
      configs: IAuthRouteConfig;
    }): void {
      const { target, methodName, configs } = opts;

      const routes = this.getRoutes({ target }) || new Map();
      routes.set(methodName, configs);

      Reflect.defineMetadata(MetadataKeys.CONTROLLER_REST_ROUTE, routes, target);
    }
  };
};
