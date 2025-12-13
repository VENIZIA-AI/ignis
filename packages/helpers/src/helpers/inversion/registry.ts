import type {
  IControllerMetadata,
  IDataSourceMetadata,
  IModelMetadata,
  IRepositoryMetadata,
  TRouteMetadata,
} from './common';
import { MetadataKeys } from './common';
import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';

/**
 * Central metadata registry for storing and retrieving decorator metadata
 */
export class MetadataRegistry extends _MetadataRegistry {
  private static instance: MetadataRegistry;

  private constructor() {
    super();
  }

  static getInstance(): MetadataRegistry {
    if (!MetadataRegistry.instance) {
      MetadataRegistry.instance = new MetadataRegistry();
    }
    return MetadataRegistry.instance;
  }

  // -----------------------------------------------------------------
  // Controller Metadata
  // -----------------------------------------------------------------
  setControllerMetadata<Target extends object = object>(opts: {
    target: Target;
    metadata: IControllerMetadata;
  }): void {
    const { target, metadata } = opts;

    const existing = this.getControllerMetadata({ target }) || {};
    const merged = { ...existing, ...metadata };
    Reflect.defineMetadata(MetadataKeys.CONTROLLER, merged, target);
  }

  getControllerMetadata<Target extends object = object>(opts: {
    target: Target;
  }): IControllerMetadata | undefined {
    const { target } = opts;
    return Reflect.getMetadata(MetadataKeys.CONTROLLER, target);
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

  // -----------------------------------------------------------------
  // Model Metadata
  // -----------------------------------------------------------------
  setModelMetadata<T extends object = object>(opts: { target: T; metadata: IModelMetadata }): void {
    const { target, metadata } = opts;
    Reflect.defineMetadata(MetadataKeys.MODEL, metadata, target);
  }

  getModelMetadata<T extends object = object>(opts: { target: T }): IModelMetadata | undefined {
    const { target } = opts;
    return Reflect.getMetadata(MetadataKeys.MODEL, target);
  }

  // -----------------------------------------------------------------
  // DataSource Metadata
  // -----------------------------------------------------------------
  setDataSourceMetadata<T extends object = object>(opts: {
    target: T;
    metadata: IDataSourceMetadata;
  }): void {
    const { target, metadata } = opts;
    Reflect.defineMetadata(MetadataKeys.DATASOURCE, metadata, target);
  }

  getDataSourceMetadata<T extends object = object>(opts: {
    target: T;
  }): IDataSourceMetadata | undefined {
    const { target } = opts;
    return Reflect.getMetadata(MetadataKeys.DATASOURCE, target);
  }

  // -----------------------------------------------------------------
  // Repository Metadata
  // -----------------------------------------------------------------
  setRepositoryMetadata<T extends object = object>(opts: {
    target: T;
    metadata: IRepositoryMetadata;
  }): void {
    const { target, metadata } = opts;
    Reflect.defineMetadata(MetadataKeys.REPOSITORY, metadata, target);
  }

  getRepositoryMetadata<T extends object = object>(opts: {
    target: T;
  }): IRepositoryMetadata | undefined {
    const { target } = opts;
    return Reflect.getMetadata(MetadataKeys.REPOSITORY, target);
  }
}
