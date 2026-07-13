import { getError } from '../common/app-error';
import { BaseHelper } from '../common/base-helper';
import { TClass, TConstValue } from '../common/types';
import type { IContainer } from '../container/common/types';
import { BindingScopes, BindingValueTypes, TBindingScope } from './common/constants';
import { IBinding, isClassProvider, TBindingProvider, TBindingResolverValue } from './common/types';

export class Binding<T = any> extends BaseHelper implements IBinding<T> {
  key: string;

  private bindScope: TBindingScope = BindingScopes.TRANSIENT;
  private tags: Set<string>;
  private cached?: T;

  private resolver:
    | { type: typeof BindingValueTypes.CLASS; value: TClass<T> }
    | { type: typeof BindingValueTypes.VALUE; value: T }
    | { type: typeof BindingValueTypes.PROVIDER; value: TBindingProvider<T> };

  constructor(opts: { key: string }) {
    super({ scope: opts.key });
    this.tags = new Set([]);

    this.key = opts.key;

    const keyParts = this.key.split('.');
    if (keyParts.length > 1) {
      const [namespace] = keyParts;
      this.setTags(namespace);
    }
  }

  static override bind<T = any>(opts: { key: string }): Binding<T> {
    return new Binding<T>(opts);
  }

  toClass(value: TClass<T>): this {
    this.resolver = { type: BindingValueTypes.CLASS, value };
    return this;
  }

  toValue(value: T): this {
    this.resolver = { type: BindingValueTypes.VALUE, value };
    return this;
  }

  toProvider(value: TBindingProvider<T>): this {
    this.resolver = { type: BindingValueTypes.PROVIDER, value };
    return this;
  }

  getBindingMeta(opts: { type: TConstValue<typeof BindingValueTypes> }): TBindingResolverValue<T> {
    if (this.resolver.type !== opts.type) {
      throw getError({
        message: `[getBindingMeta] Invalid resolver type, only ${this.resolver.type} is allowd | resolverType: ${this.resolver.type} | optType: ${opts.type}`,
      });
    }

    return this.resolver.value;
  }

  setScope(scope: TBindingScope): this {
    this.bindScope = scope;
    return this;
  }

  setTags(...tags: string[]): this {
    tags.forEach(t => this.tags.add(t));
    return this;
  }

  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }

  getTags(): string[] {
    return Array.from(this.tags);
  }

  getScope(): TBindingScope {
    return this.bindScope;
  }

  getValue(container?: IContainer): T {
    if (this.bindScope === BindingScopes.SINGLETON && this.cached !== undefined) {
      return this.cached;
    }

    let instance: T;

    const { type: resolverType } = this.resolver;
    switch (resolverType) {
      case BindingValueTypes.VALUE: {
        instance = this.resolver.value;
        break;
      }
      case BindingValueTypes.PROVIDER: {
        const provider = this.resolver.value;

        if (!container) {
          throw getError({
            message: `[getValue] Invalid context/container to get provider value | type: ${resolverType} | key: ${this.key}`,
          });
        }

        if (!isClassProvider(provider)) {
          instance = provider(container);
          break;
        }

        const p = container.instantiate(provider);
        instance = p.value(container);
        break;
      }
      case BindingValueTypes.CLASS: {
        if (!container) {
          throw getError({
            message: `[getValue] Invalid context/container to instantiate class | type: ${resolverType} | key: ${this.key}`,
          });
        }

        instance = container.instantiate(this.resolver.value);
        break;
      }
      default: {
        throw getError({
          message: `[getValue] Invalid value type | valueType: ${resolverType}`,
        });
      }
    }

    if (this.bindScope === BindingScopes.SINGLETON) {
      this.cached = instance;
    }

    return instance;
  }

  clearCache() {
    if (!this.cached) {
      return;
    }

    this.cached = undefined;
  }
}
