import { BaseHelper } from '@/helpers/base';
import { IProvider, isClassProvider, TConstValue, TNullable, type TClass } from '@/common/types';
import { ApplicationError, getError } from '@/helpers/error';
import { BindingKeys, BindingScopes, BindingValueTypes, TBindingScope } from './common';
import { MetadataRegistry } from './registry';

// -------------------------------------------------------------------------------------
export class Binding<T = any> extends BaseHelper {
  key: string;

  private bindScope: TBindingScope = BindingScopes.TRANSIENT;
  private tags: Set<string>;
  private cached?: T;

  private resolver:
    | { type: typeof BindingValueTypes.CLASS; value: TClass<T> }
    | { type: typeof BindingValueTypes.VALUE; value: T }
    | {
        type: typeof BindingValueTypes.PROVIDER;
        value: ((container: Container) => T) | TClass<IProvider<T>>;
      };

  // ------------------------------------------------------------------------------
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

  // ------------------------------------------------------------------------------
  toClass(value: TClass<T>): this {
    this.resolver = { type: BindingValueTypes.CLASS, value };
    return this;
  }

  toValue(value: T): this {
    this.resolver = { type: BindingValueTypes.VALUE, value };
    return this;
  }

  toProvider(value: ((container: Container) => T) | TClass<IProvider<T>>): this {
    this.resolver = { type: BindingValueTypes.PROVIDER, value };
    return this;
  }

  // ------------------------------------------------------------------------------
  getBindingMeta(opts: { type: TConstValue<typeof BindingValueTypes> }) {
    if (this.resolver.type !== opts.type) {
      throw ApplicationError.getError({
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

  getValue(container?: Container): T {
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

        const p = new provider();
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

// -------------------------------------------------------------------------------------
export class Container extends BaseHelper {
  protected bindings = new Map<string | symbol, Binding>();

  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
  }

  bind<T>(opts: { key: string | symbol }): Binding<T> {
    const { key } = opts;
    const keyStr = String(key);
    const binding = new Binding<T>({ key: keyStr });
    this.bindings.set(keyStr, binding as Binding);
    return binding;
  }

  isBound(opts: { key: string | symbol }): boolean {
    const { key } = opts;
    const keyStr = String(key);
    return this.bindings.has(keyStr);
  }

  getBinding<T>(opts: {
    key: string | symbol | { namespace: string; key: string };
  }): TNullable<Binding<T>> {
    let key: string | symbol | null = null;
    switch (typeof opts.key) {
      case 'string': {
        key = opts.key;
        break;
      }
      case 'symbol': {
        key = opts.key.toString();
        break;
      }
      case 'object': {
        key = BindingKeys.build(opts.key);
        break;
      }
      default: {
        throw getError({
          message: `[getBinding] Invalid binding key type | opts: ${opts.key} | allowed: [string, symbol, { namespace: string, key: string }]`,
        });
      }
    }

    const binding = this.bindings.get(key);
    return binding;
  }

  unbind(opts: { key: string | symbol }): boolean {
    const key = String(opts.key);
    return this.bindings.delete(key);
  }

  set<T>(opts: { binding: Binding<T> }): void {
    const { binding } = opts;
    this.bindings.set(binding.key, binding);
  }

  get<T>(opts: {
    key: string | symbol | { namespace: string; key: string };
    isOptional?: false;
  }): T;
  get<T>(opts: {
    key: string | symbol | { namespace: string; key: string };
    isOptional?: boolean;
  }): T | undefined;
  get<T>(opts: {
    key: string | symbol | { namespace: string; key: string };
    isOptional?: boolean;
  }): T | undefined {
    const { key, isOptional = false } = opts;

    const binding = this.getBinding<T>({ key });
    if (binding) {
      return binding.getValue(this);
    }

    if (!isOptional) {
      throw getError({
        message: `Binding key: ${opts.key.toString()} is not bounded in context!`,
      });
    }

    return undefined;
  }

  resolve<T>(cls: TClass<T>): T {
    return this.instantiate(cls);
  }

  instantiate<T>(cls: TClass<T>): T {
    // 1. Handle constructor parameter injection
    const injectMetadata = MetadataRegistry.getInjectMetadata({ target: cls });

    const args: any[] = [];
    if (injectMetadata?.length) {
      const sortedDeps = [...injectMetadata].sort((a, b) => a.index - b.index);

      for (const meta of sortedDeps) {
        const isOptional = meta.isOptional ?? false;
        const dep = this.get({ key: meta.key, isOptional });
        args[meta.index] = dep;
      }
    }

    // Create instance
    const instance = new cls(...args);

    // 2. Handle property injection
    const propertyMetadata = MetadataRegistry.getPropertiesMetadata({ target: instance as object });
    if (!propertyMetadata?.size) {
      return instance;
    }

    for (const [propertyKey, metadata] of propertyMetadata.entries()) {
      const dep = this.get({ key: metadata.bindingKey, isOptional: metadata.optional ?? false });
      (instance as any)[propertyKey] = dep;
    }

    return instance;
  }

  findByTag<T = any>(opts: { tag: string }): Binding<T>[] {
    const rs: Binding<T>[] = [];
    for (const [_k, binding] of this.bindings) {
      if (!binding.hasTag(opts.tag)) {
        continue;
      }

      rs.push(binding);
    }

    return rs;
  }

  clear(): void {
    for (const [_, binding] of this.bindings) {
      binding.clearCache();
    }
  }

  reset(): void {
    this.bindings.clear();
  }
}
