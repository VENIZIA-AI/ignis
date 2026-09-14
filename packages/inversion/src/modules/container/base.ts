import { TBindingKey, TClass, TNullable } from '@/common/types';
import { Binding } from '../binding/binding';
import { BindingKeys } from '../binding/common/constants';
import { getError } from '../error';
import { metadataRegistry } from '../registry/registry';
import { AbstractContainer } from './abstract';

/** Storage half of the container, keyed by normalized binding-key strings - resolution (`instantiate`) stays abstract, it is the part an implementation swaps. */
export abstract class BaseContainer extends AbstractContainer {
  protected bindings = new Map<string, Binding>();

  /** How often each bound key has been handed out since counting started. */
  protected resolutionCounts = new Map<string, number>();

  /** Off by default: the counter sits on the hottest path in the container, and an application that never reads the report should not pay for it. */
  protected isCountingResolutions = false;

  /** Whether `startResolutionCounting` has ever run. A report read without it would name every binding, which is a wrong answer rather than an empty one. */
  protected hasStartedResolutionCounting = false;

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
      // Counted here and nowhere else: constructor injection, property injection, `application.get`
      // and `verifyBindings` all arrive through this one method. A miss below is not a resolution.
      if (this.isCountingResolutions) {
        this.resolutionCounts.set(binding.key, (this.resolutionCounts.get(binding.key) ?? 0) + 1);
      }
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

  /** Clears the counts and starts counting. Call it AFTER `initialize()`: boot resolves plenty no request ever asks for, and `bootChecks.binding.doVerify` reads every service and repository. */
  override startResolutionCounting(): void {
    this.resolutionCounts.clear();
    this.isCountingResolutions = true;
    this.hasStartedResolutionCounting = true;
  }

  /** Stops counting and keeps what was counted, so `get` returns to its uncounted cost. */
  override stopResolutionCounting(): void {
    this.isCountingResolutions = false;
  }

  /** How many times each bound key has been read since counting started. A key that was bound and never read is absent. The map is a copy. */
  override getResolutionCounts(): ReadonlyMap<string, number> {
    return new Map(this.resolutionCounts);
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
