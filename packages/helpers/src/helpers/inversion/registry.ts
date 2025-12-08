import type { TClass } from '@/common/types';
import { BaseHelper } from '../base';
import type {
  IControllerMetadata,
  IDataSourceMetadata,
  IInjectMetadata,
  IInjectableMetadata,
  IModelMetadata,
  IPropertyMetadata,
  IRepositoryMetadata,
  TRouteMetadata,
} from './common';
import { MetadataKeys } from './common';

/**
 * Central metadata registry for storing and retrieving decorator metadata
 */
export class MetadataRegistry extends BaseHelper {
  private static instance: MetadataRegistry;
  protected metadata: WeakMap<any, Map<symbol, any>>;

  private constructor() {
    super({ scope: MetadataRegistry.name });
    this.metadata = new WeakMap();
  }

  static getInstance(): MetadataRegistry {
    if (!MetadataRegistry.instance) {
      MetadataRegistry.instance = new MetadataRegistry();
    }
    return MetadataRegistry.instance;
  }

  // -----------------------------------------------------------------
  // Generic Metadata Methods
  // -----------------------------------------------------------------
  define<Target extends object = object, Value = any>(opts: {
    target: Target;
    key: string | symbol;
    value: Value;
  }): void {
    const { target, key, value } = opts;
    this.logger.debug(
      '[define] Set metadata | target: %s | key: %s | value: %j',
      target.constructor.name,
      key.toString(),
      value,
    );
    Reflect.defineMetadata(key, value, target);
  }

  get<Target extends object = object, Value = any>(opts: {
    target: Target;
    key: string | symbol;
  }): Value | undefined {
    const { target, key } = opts;
    return Reflect.getMetadata(key, target);
  }

  has<Target extends object = object>(opts: { target: Target; key: string | symbol }): boolean {
    const { target, key } = opts;
    return Reflect.hasMetadata(key, target);
  }

  delete<Target extends object = object>(opts: { target: Target; key: string | symbol }): boolean {
    const { target, key } = opts;
    return Reflect.deleteMetadata(key, target);
  }

  getKeys<Target extends object = object>(opts: { target: Target }): (string | symbol)[] {
    const { target } = opts;
    return (
      Reflect.getMetadataKeys(target)?.filter(key => {
        return typeof key === 'symbol' || typeof key === 'string';
      }) ?? []
    );
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
  // Property Metadata
  // -----------------------------------------------------------------
  setPropertyMetadata<T extends object = object>(opts: {
    target: T;
    propertyName: string | symbol;
    metadata: IPropertyMetadata;
  }): void {
    const { target, propertyName, metadata } = opts;

    let properties = this.getPropertiesMetadata({ target });
    if (!properties) {
      properties = new Map<string | symbol, IPropertyMetadata>();
    }

    properties.set(propertyName, metadata);
    Reflect.defineMetadata(MetadataKeys.PROPERTIES, properties, target.constructor);
  }

  getPropertiesMetadata<T extends object = object>(opts: {
    target: T;
  }): Map<string | symbol, IPropertyMetadata> | undefined {
    const { target } = opts;
    return Reflect.getMetadata(MetadataKeys.PROPERTIES, target.constructor);
  }

  getPropertyMetadata<T extends object = object>(opts: {
    target: T;
    propertyName: string | symbol;
  }): IPropertyMetadata | undefined {
    const { target, propertyName } = opts;
    const properties = this.getPropertiesMetadata({ target });
    return properties?.get(propertyName);
  }

  // -----------------------------------------------------------------
  // Injection Metadata
  // -----------------------------------------------------------------
  setInjectMetadata<T extends object = object>(opts: {
    target: T;
    index: number;
    metadata: IInjectMetadata;
  }): void {
    const { target, index, metadata } = opts;
    const injects = Reflect.getMetadata(MetadataKeys.INJECT, target) || [];
    injects[index] = metadata;
    Reflect.defineMetadata(MetadataKeys.INJECT, injects, target);
  }

  getInjectMetadata<T extends object = object>(opts: { target: T }): IInjectMetadata[] | undefined {
    const { target } = opts;
    return Reflect.getMetadata(MetadataKeys.INJECT, target);
  }

  // -----------------------------------------------------------------
  setInjectableMetadata<T extends object = object>(opts: {
    target: T;
    metadata: IInjectableMetadata;
  }): void {
    const { target, metadata } = opts;
    Reflect.defineMetadata(MetadataKeys.INJECTABLE, metadata, target);
  }

  getInjectableMetadata<T extends object = object>(opts: {
    target: T;
  }): IInjectableMetadata | undefined {
    const { target } = opts;
    return Reflect.getMetadata(MetadataKeys.INJECTABLE, target);
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

  // -----------------------------------------------------------------
  getMethodNames<T = any>(opts: { target: TClass<T> }): string[] {
    const { target } = opts;
    const prototype = target.prototype;
    const methods = Object.getOwnPropertyNames(prototype).filter(
      name => name !== 'constructor' && typeof prototype[name] === 'function',
    );
    return methods;
  }

  clearMetadata<T extends object = object>(opts: { target: T }): void {
    const { target } = opts;
    const keys = Reflect.getMetadataKeys(target);

    for (const key of keys) {
      Reflect.deleteMetadata(key, target);
    }
  }
}
