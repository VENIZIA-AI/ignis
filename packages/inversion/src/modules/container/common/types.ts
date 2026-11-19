import type { IBinding } from '../../binding/common/types';
import type { TBindingKey, TClass, TNullable } from '@/common/types';
import type { MetadataRegistry } from '../../registry/registry';

/** Binds keys, resolves them and instantiates classes with their injected dependencies. */
export interface IContainer {
  getMetadataRegistry(): MetadataRegistry;

  // The overloads without `<T>` take a key that is no single typed key (a union of typed keys, say) and answer `unknown`.
  bind<T>(opts: { key: TBindingKey<T> }): IBinding<T>;
  bind(opts: { key: TBindingKey }): IBinding;
  isBound(opts: { key: TBindingKey }): boolean;
  getBinding<T>(opts: { key: TBindingKey<T> }): TNullable<IBinding<T>>;
  getBinding(opts: { key: TBindingKey }): TNullable<IBinding>;
  unbind(opts: { key: TBindingKey }): boolean;
  set<T>(opts: { binding: IBinding<T> }): void;

  get<T>(opts: { key: TBindingKey<T>; isOptional?: false }): T;
  get<T>(opts: { key: TBindingKey<T>; isOptional?: boolean }): T | undefined;
  get(opts: { key: TBindingKey; isOptional?: boolean }): unknown;
  gets<T extends unknown[]>(opts: {
    bindings: {
      [K in keyof T]: {
        key: TBindingKey<T[K]>;
        isOptional?: boolean;
      };
    };
  }): { [K in keyof T]: T[K] | undefined };

  resolve<T>(cls: TClass<T>): T;
  instantiate<T>(cls: TClass<T>): T;

  findByTag<T = unknown>(opts: {
    tag: string;
    exclude?: Array<string> | Set<string>;
  }): IBinding<T>[];
  clear(): void;
  reset(): void;
}
