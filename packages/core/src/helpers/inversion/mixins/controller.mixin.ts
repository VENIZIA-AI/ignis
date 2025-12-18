import { TMixinTarget } from '@venizia/ignis-helpers';
import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../common/keys';
import { IControllerMetadata, TRouteMetadata } from '../common/types';

// -----------------------------------------------------------------
// Controller Metadata
// -----------------------------------------------------------------
export const ControllerMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
  // mixinOpts: { },
) => {
  return class extends baseClass {
    setControllerMetadata<Target extends object = object>(opts: {
      target: Target;
      metadata: IControllerMetadata;
    }): void {
      const { target, metadata } = opts;
      const existing = this.getControllerMetadata({ target }) || {};
      Reflect.defineMetadata(
        MetadataKeys.CONTROLLER,
        Object.assign({}, existing, metadata),
        target,
      );
    }

    getControllerMetadata<Target extends object = object>(opts: {
      target: Target;
    }): IControllerMetadata | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.CONTROLLER, target);
    }

    /**
     * Get all routes from a controller class
     */
    getRoutes<Target extends object = object>(opts: {
      target: Target;
    }): Map<string | symbol, TRouteMetadata> | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.CONTROLLER_ROUTE, target);
    }

    /**
     * Get a specific route by method name
     */
    getRoute<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
    }): TRouteMetadata | undefined {
      const { target, methodName } = opts;
      const routes = this.getRoutes({ target });
      return routes?.get(methodName);
    }

    /**
     * Check if a class has any routes defined
     */
    hasRoutes<Target extends object = object>(opts: { target: Target }): boolean {
      const routes = this.getRoutes(opts);
      return routes !== undefined && routes.size > 0;
    }

    /**
     * Add a route to a controller class
     */
    addRoute<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
      configs: TRouteMetadata;
    }): void {
      const { target, methodName, configs } = opts;

      const routes = this.getRoutes({ target }) || new Map();
      routes.set(methodName, configs);

      Reflect.defineMetadata(MetadataKeys.CONTROLLER_ROUTE, routes, target);
    }
  };
};
