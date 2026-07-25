import { TBindingKey, TClass, TNullable } from '@/common/types';
import { Binding } from '../binding/binding';
import { BindingKeys } from '../binding/common/constants';
import { getError } from '../error';
import { metadataRegistry } from '../registry/registry';
import { AbstractContainer } from './abstract';

/** Storage half of the container, keyed by normalized binding-key strings - resolution (`instantiate`) stays abstract, it is the part an implementation swaps. */
export abstract class BaseContainer extends AbstractContainer {
  protected bindings = new Map<string, Binding>();

  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? BaseContainer.name });
  }

  override getMetadataRegistry() {
    return metadataRegistry;
  }

  override bind<T>(opts: { key: TBindingKey }): Binding<T> {
    const { key } = opts;
    const keyStr = String(key);
    const binding = new Binding<T>({ key: keyStr });
    this.bindings.set(keyStr, binding as Binding);
    return binding;
  }

  override isBound(opts: { key: TBindingKey }): boolean {
    const { key } = opts;
    const keyStr = String(key);
    return this.bindings.has(keyStr);
  }

  override getBinding<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
  }): TNullable<Binding<T>> {
    let key: string | null;

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

  override unbind(opts: { key: TBindingKey }): boolean {
    const key = String(opts.key);
    return this.bindings.delete(key);
  }

  override set<T>(opts: { binding: Binding<T> }): void {
    const { binding } = opts;
    this.bindings.set(binding.key, binding);
  }

  override get<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
    isOptional?: false;
  }): T;
  override get<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
    isOptional?: boolean;
  }): T | undefined;
  override get<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
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

  override gets<T extends unknown[]>(opts: {
    bindings: {
      [K in keyof T]: {
        key: TBindingKey | { namespace: string; key: string };
        isOptional?: boolean;
      };
    };
  }): { [K in keyof T]: T[K] | undefined } {
    return opts.bindings.map(opt => this.get({ ...opt, isOptional: true })) as {
      [K in keyof T]: T[K] | undefined;
    };
  }

  override resolve<T>(cls: TClass<T>): T {
    return this.instantiate(cls);
  }

  override findByTag<T = any>(opts: {
    tag: string;
    exclude?: Array<string> | Set<string>;
  }): Binding<T>[] {
    const { tag, exclude } = opts;

    const rs: Binding<T>[] = [];

    const bindings = this.bindings.values();
    for (const binding of bindings) {
      if (!binding.hasTag(tag)) {
        continue;
      }

      if (exclude instanceof Array && exclude.length > 0 && exclude.includes(binding.key)) {
        continue;
      }

      if (exclude instanceof Set && exclude.size > 0 && exclude.has(binding.key)) {
        continue;
      }

      rs.push(binding);
    }

    return rs;
  }

  override clear(): void {
    const bindings = this.bindings.values();
    for (const binding of bindings) {
      binding.clearCache();
    }
  }

  override reset(): void {
    this.bindings.clear();
  }
}
