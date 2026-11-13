import type { IContainer } from '../../container/common/types';
import { type TClass, type TConstValue } from '@/common/types';
import type { BindingValueTypes, TBindingScope } from './constants';

/** A value source resolved against a container; `value` runs on each resolution of the binding it backs. */
export interface IProvider<T> {
  value(container: IContainer): T;
}

/** True for a function whose prototype has a `value` method, so a provider class is told apart from a plain provider function. */
export const isClassProvider = <T>(target: unknown): target is TClass<IProvider<T>> => {
  return (
    typeof target === 'function' && target.prototype && typeof target.prototype.value === 'function'
  );
};

/** What `toProvider` accepts: a function taking the container, or a class implementing {@link IProvider}. */
export type TBindingProvider<T> =
  | (<C extends IContainer>(container: C) => T)
  | TClass<IProvider<T>>;

/** What a binding's resolver holds - a class, a plain value, or a provider. */
export type TBindingResolverValue<T> = TClass<T> | T | TBindingProvider<T>;

/** A container entry: one key bound to a class, a value or a provider, with a scope and tags. */
export interface IBinding<T = unknown> {
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
