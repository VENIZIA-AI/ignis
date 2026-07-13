import type { IAuthRouteConfig } from '@/base/controllers/common/types';
import type { TMixinTarget } from '@venizia/ignis-helpers';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../../common/keys';

export const RestControllerMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    getRoutes<Target extends object = object>(opts: {
      target: Target;
    }): Map<string | symbol, IAuthRouteConfig> | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.CONTROLLER_REST_ROUTE, target);
    }

    getRoute<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
    }): IAuthRouteConfig | undefined {
      const { target, methodName } = opts;
      const routes = this.getRoutes({ target });
      return routes?.get(methodName);
    }

    hasRoutes<Target extends object = object>(opts: { target: Target }): boolean {
      const routes = this.getRoutes(opts);
      return routes !== undefined && routes.size > 0;
    }

    addRoute<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
      configs: IAuthRouteConfig;
    }): void {
      const { target, methodName, configs } = opts;

      // Copy-on-write: getRoutes() walks the prototype chain, so a subclass would otherwise mutate
      // the Map its base class owns - leaking its routes onto the base and onto every sibling
      // subclass. Inherited routes stay visible (they are copied in, base first).
      const inherited = this.getRoutes({ target });
      const routes: Map<string | symbol, IAuthRouteConfig> =
        Reflect.getOwnMetadata(MetadataKeys.CONTROLLER_REST_ROUTE, target) ??
        new Map(inherited ?? []);

      routes.set(methodName, configs);

      Reflect.defineMetadata(MetadataKeys.CONTROLLER_REST_ROUTE, routes, target);
    }
  };
};
