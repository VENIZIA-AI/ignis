import type { IBinding } from '../binding/common/types';
import { BaseHelper } from '@/common/base-helper';
import type { TBindingKey, TClass, TNullable } from '@/common/types';
import type { MetadataRegistry } from '../registry/registry';
import type { IContainer } from './common/types';

/**
 * Container CONTRACT as a class, typed against `IBinding`. Implementations sharing no storage
 * start here; ones that only vary resolution start at `BaseContainer`.
 */
export abstract class AbstractContainer extends BaseHelper implements IContainer {
  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? AbstractContainer.name });
  }

  abstract getMetadataRegistry(): MetadataRegistry;

  abstract bind<T>(opts: { key: TBindingKey }): IBinding<T>;
  abstract isBound(opts: { key: TBindingKey }): boolean;
  abstract getBinding<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
  }): TNullable<IBinding<T>>;
  abstract unbind(opts: { key: TBindingKey }): boolean;
  abstract set<T>(opts: { binding: IBinding<T> }): void;

  abstract get<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
    isOptional?: false;
  }): T;
  abstract get<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
    isOptional?: boolean;
  }): T | undefined;
  abstract gets<T extends unknown[]>(opts: {
    bindings: {
      [K in keyof T]: {
        key: TBindingKey | { namespace: string; key: string };
        isOptional?: boolean;
      };
    };
  }): { [K in keyof T]: T[K] | undefined };

  abstract resolve<T>(cls: TClass<T>): T;
  abstract instantiate<T>(cls: TClass<T>): T;

  abstract findByTag<T = any>(opts: {
    tag: string;
    exclude?: Array<string> | Set<string>;
  }): IBinding<T>[];
  abstract clear(): void;
  abstract reset(): void;
}
