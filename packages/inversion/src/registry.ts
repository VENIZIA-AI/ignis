import { BaseHelper } from "./common/base-helper";
import { MetadataKeys } from "./common/keys";
import { Logger } from "./common/logger";
import { IInjectMetadata, IPropertyMetadata, TClass } from "./common/types";

/**
 * Central metadata registry for storing and retrieving decorator metadata
 */
export class MetadataRegistry extends BaseHelper {
  protected metadata: WeakMap<any, Map<symbol, any>>;

  constructor() {
    super({ scope: MetadataRegistry.name });
    this.metadata = new WeakMap();
  }

  // -----------------------------------------------------------------
  define<Target extends object = object, Value = any>(opts: {
    target: Target;
    key: string | symbol;
    value: Value;
  }): void {
    const { target, key, value } = opts;
    Logger.debug(
      "[define] Set metadata | target: %s | key: %s | value: %j",
      target.constructor.name,
      key.toString(),
      value,
    );
    Reflect.defineMetadata(key, value, target);
  }

  // -----------------------------------------------------------------
  get<Target extends object = object, Value = any>(opts: {
    target: Target;
    key: string | symbol;
  }): Value | undefined {
    const { target, key } = opts;
    return Reflect.getMetadata(key, target);
  }

  // -----------------------------------------------------------------
  has<Target extends object = object>(opts: {
    target: Target;
    key: string | symbol;
  }): boolean {
    const { target, key } = opts;
    return Reflect.hasMetadata(key, target);
  }

  // -----------------------------------------------------------------
  delete<Target extends object = object>(opts: {
    target: Target;
    key: string | symbol;
  }): boolean {
    const { target, key } = opts;
    return Reflect.deleteMetadata(key, target);
  }

  // -----------------------------------------------------------------
  getKeys<Target extends object = object>(opts: {
    target: Target;
  }): (string | symbol)[] {
    const { target } = opts;
    return (
      Reflect.getMetadataKeys(target)?.filter((key) => {
        return typeof key === "symbol" || typeof key === "string";
      }) ?? []
    );
  }

  // -----------------------------------------------------------------
  getMethodNames<T = any>(opts: { target: TClass<T> }): string[] {
    const { target } = opts;
    const prototype = target.prototype;
    const methods = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== "constructor" && typeof prototype[name] === "function",
    );
    return methods;
  }

  // -----------------------------------------------------------------
  clearMetadata<T extends object = object>(opts: { target: T }): void {
    const { target } = opts;
    const keys = Reflect.getMetadataKeys(target);

    for (const key of keys) {
      Reflect.deleteMetadata(key, target);
    }
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
    Reflect.defineMetadata(
      MetadataKeys.PROPERTIES,
      properties,
      target.constructor,
    );
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

  getInjectMetadata<T extends object = object>(opts: {
    target: T;
  }): IInjectMetadata[] | undefined {
    const { target } = opts;
    return Reflect.getMetadata(MetadataKeys.INJECT, target);
  }
}

export const metadataRegistry = new MetadataRegistry();
