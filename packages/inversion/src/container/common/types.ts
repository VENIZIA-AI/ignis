import type { IBinding } from '../../binding/common/types';
import type { TBindingKey, TClass, TNullable } from '../../common/types';
import type { MetadataRegistry } from '../../registry/registry';

export interface IContainer {
  getMetadataRegistry(): MetadataRegistry;

  bind<T>(opts: { key: TBindingKey }): IBinding<T>;
  isBound(opts: { key: TBindingKey }): boolean;
  getBinding<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
  }): TNullable<IBinding<T>>;
  unbind(opts: { key: TBindingKey }): boolean;
  set<T>(opts: { binding: IBinding<T> }): void;

  get<T>(opts: { key: TBindingKey | { namespace: string; key: string }; isOptional?: false }): T;
  get<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
    isOptional?: boolean;
  }): T | undefined;
  gets<T extends unknown[]>(opts: {
    bindings: {
      [K in keyof T]: {
        key: TBindingKey | { namespace: string; key: string };
        isOptional?: boolean;
      };
    };
  }): { [K in keyof T]: T[K] | undefined };

  resolve<T>(cls: TClass<T>): T;
  instantiate<T>(cls: TClass<T>): T;

  findByTag<T = any>(opts: { tag: string; exclude?: Array<string> | Set<string> }): IBinding<T>[];
  clear(): void;
  reset(): void;
}
