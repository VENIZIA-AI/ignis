import type { IContainer } from '../../container/common/types';
import { TClass, TConstValue } from '@/common/types';
import type { BindingValueTypes, TBindingScope } from './constants';

export interface IProvider<T> {
  value(container: IContainer): T;
}

export const isClassProvider = <T>(target: any): target is TClass<IProvider<T>> => {
  return (
    typeof target === 'function' && target.prototype && typeof target.prototype.value === 'function'
  );
};

export type TBindingProvider<T> =
  (<C extends IContainer>(container: C) => T) | TClass<IProvider<T>>;

/** What a binding's resolver holds - a class, a plain value, or a provider. */
export type TBindingResolverValue<T> = TClass<T> | T | TBindingProvider<T>;

export interface IBinding<T = any> {
  /** Normalized at construction - a symbol key arrives here as its string form. */
  key: string;

  toClass(value: TClass<T>): this;
  toValue(value: T): this;
  toProvider(value: TBindingProvider<T>): this;
  getBindingMeta(opts: { type: TConstValue<typeof BindingValueTypes> }): TBindingResolverValue<T>;

  setScope(scope: TBindingScope): this;
  getScope(): TBindingScope;
  setTags(...tags: string[]): this;
  hasTag(tag: string): boolean;
  getTags(): string[];

  getValue(container?: IContainer): T;
  clearCache(): void;
}
