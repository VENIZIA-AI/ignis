import { BaseHelper } from '@/common/base-helper';
import { Logger } from '@/common/logger';
import { TBindingKey, TClass } from '@/common/types';
import { MetadataKeys } from '../metadata/common/constants';
import { IBindingKeyRecord, IInjectMetadata, IPropertyMetadata } from './common/types';

/** Central metadata registry for storing and retrieving decorator metadata. */
export class MetadataRegistry extends BaseHelper {
  constructor() {
    super({ scope: MetadataRegistry.name });
  }

  define<Target extends object = object, Value = any>(opts: {
    target: Target;
    key: TBindingKey;
    value: Value;
  }): void {
    const { target, key, value } = opts;

    Logger.debug(
      '[define] Set metadata | target: %s | key: %s | value: %j',
      target.constructor.name,
      key.toString(),
      value,
    );

    Reflect.defineMetadata(key, value, target);
  }

  get<Target extends object = object, Value = any>(opts: {
    target: Target;
    key: TBindingKey;
  }): Value | undefined {
    const { target, key } = opts;
    return Reflect.getMetadata(key, target);
  }

  has<Target extends object = object>(opts: { target: Target; key: TBindingKey }): boolean {
    const { target, key } = opts;
    return Reflect.hasMetadata(key, target);
  }

  delete<Target extends object = object>(opts: { target: Target; key: TBindingKey }): boolean {
    const { target, key } = opts;
    return Reflect.deleteMetadata(key, target);
  }

  getKeys<Target extends object = object>(opts: { target: Target }): TBindingKey[] {
    const { target } = opts;
    return (
      Reflect.getMetadataKeys(target)?.filter(key => {
        return typeof key === 'symbol' || typeof key === 'string';
      }) ?? []
    );
  }

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

  setPropertyMetadata<T extends object = object>(opts: {
    target: T;
    propertyName: string | symbol;
    metadata: IPropertyMetadata;
  }): void {
    const { target, propertyName, metadata } = opts;

    let properties = this.getPropertiesMetadata({ target });
    properties ??= new Map<string | symbol, IPropertyMetadata>();

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

  setInjectMetadata<T extends object = object>(opts: {
    target: T;
    index: number;
    metadata: IInjectMetadata;
  }): void {
    const { target, index, metadata } = opts;
    const injects = Reflect.getMetadata(MetadataKeys.INJECT, target) ?? [];
    injects[index] = metadata;
    Reflect.defineMetadata(MetadataKeys.INJECT, injects, target);
  }

  getInjectMetadata<T extends object = object>(opts: { target: T }): IInjectMetadata[] | undefined {
    const { target } = opts;
    return Reflect.getMetadata(MetadataKeys.INJECT, target);
  }

  /** `isProvisional` marks a DERIVED key; a registration replaces it silently, having seen the call-site override. */
  setBindingKey<T extends object = object>(opts: {
    target: T;
    key: TBindingKey;
    isProvisional?: boolean;
  }): void {
    const { target, key, isProvisional = false } = opts;
    const current: IBindingKeyRecord | undefined = Reflect.getOwnMetadata(
      MetadataKeys.BINDING_KEY,
      target,
    );

    // Two apps in one process, one class, two keys: the last registration would decide for both.
    if (current !== undefined && current.key !== key && !current.isProvisional && !isProvisional) {
      Logger.warn(
        '[setBindingKey] Rebound under a different key | target: %s | was: %s | now: %s',
        (target as { name?: string }).name,
        current.key.toString(),
        key.toString(),
      );
    }

    Reflect.defineMetadata(MetadataKeys.BINDING_KEY, { key, isProvisional }, target);
  }

  /** Own metadata only: a subclass is not registered, and the parent key would resolve the wrong binding. */
  getBindingKey<T extends object = object>(opts: { target: T }): TBindingKey | undefined {
    const { target } = opts;
    const record: IBindingKeyRecord | undefined = Reflect.getOwnMetadata(
      MetadataKeys.BINDING_KEY,
      target,
    );
    return record?.key;
  }
}

export const metadataRegistry = new MetadataRegistry();
