import { BaseHelper } from '@/base/helpers';
import { IProvider, isClassProvider, TConstValue, type IClass } from '@/common/types';
import { ApplicationError, getError } from '@/helpers/error';
import { MetadataRegistry } from './registry';
import { BindingScopes, BindingValueTypes, TBindingScope } from './types';

// -------------------------------------------------------------------------------------
export class Binding<T = any> extends BaseHelper {
  private scope: TBindingScope = BindingScopes.TRANSIENT;

  public key: string;
  private tags: Set<string>;

  private resolver:
    | { type: 'class'; value: IClass<T> }
    | { type: 'value'; value: T }
    | { type: 'provider'; value: ((container?: Container) => T) | IClass<IProvider<T>> };

  private cachedInstance?: T;

  constructor(opts: { key: string; namespace?: string }) {
    super({ scope: opts.key.toString() });
    this.tags = new Set([]);

    this.key = opts.key;

    const keyParts = opts.key.split('.');
    if (keyParts.length > 1) {
      const [namespace] = keyParts;
      this.setTags(namespace);
    }
  }

  static override bind<T = any>(opts: { key: string }): Binding<T> {
    return new Binding<T>(opts);
  }

  toClass(value: IClass<T>): this {
    this.resolver = { type: BindingValueTypes.CLASS, value };
    return this;
  }

  toValue(value: T): this {
    this.resolver = { type: BindingValueTypes.VALUE, value };
    return this;
  }

  toProvider(value: ((container: Container) => T) | IClass<IProvider<T>>): this {
    this.resolver = { type: BindingValueTypes.PROVIDER, value };
    return this;
  }

  getBindingMeta(opts: { type: TConstValue<typeof BindingValueTypes> }) {
    if (this.resolver.type !== opts.type) {
      throw ApplicationError.getError({
        message: `[getBindingMeta] Invalid resolver type, only ${this.resolver.type} is allowd | resolverType: ${this.resolver.type} | optType: ${opts.type}`,
      });
    }

    return this.resolver.value;
  }

  setScope(scope: TBindingScope): this {
    this.scope = scope;
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
    return this.scope;
  }

  getValue(container: Container): T {
    if (this.scope === BindingScopes.SINGLETON && this.cachedInstance !== undefined) {
      return this.cachedInstance;
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
        if (!isClassProvider(provider)) {
          instance = provider(container);
          break;
        }

        const p = new provider();
        instance = p.value();
        break;
      }
      case BindingValueTypes.CLASS: {
        instance = container.instantiate(this.resolver.value);
        break;
      }
      default: {
        throw getError({
          message: `[getValue] Invalid value type | valueType: ${resolverType}`,
        });
      }
    }

    if (this.scope === BindingScopes.SINGLETON) {
      this.cachedInstance = instance;
    }

    return instance;
  }

  clearCache() {
    this.cachedInstance = undefined;
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

  getBinding<T>(opts: { key: string | symbol }): Binding<T> | undefined {
    const key = String(opts.key);
    const binding = this.bindings.get(key);
    return binding;
  }

  unbind(opts: { key: string | symbol }): boolean {
    const key = String(opts.key);
    return this.bindings.delete(key);
  }

  get<T>(opts: { key: string | symbol; isOptional?: boolean }): T | undefined {
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

  resolve<T>(cls: IClass<T>): T {
    return this.instantiate(cls);
  }

  instantiate<T>(cls: IClass<T>): T {
    // 1. Handle constructor parameter injection
    const injectMetadata = MetadataRegistry.getInjectMetadata({ target: cls });

    const args: any[] = [];
    if (injectMetadata?.length) {
      const sortedDeps = [...injectMetadata].sort((a, b) => a.index - b.index);

      for (const meta of sortedDeps) {
        const dep = this.get({ key: meta.key, isOptional: meta.isOptional ?? false });
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
    for (const [_key, binding] of this.bindings) {
      binding.clearCache();
    }
  }

  reset(): void {
    this.bindings.clear();
  }
}
