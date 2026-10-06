import { TBindingKey, TClass, TNullable } from '@/common/types';
import { Binding } from '../binding/binding';
import { BindingKeys } from '../binding/common/constants';
import { getError } from '../error';
import { metadataRegistry } from '../registry/registry';
import { AbstractContainer } from './abstract';

/** A dependency graph nests far less than this; deeper is all but certainly a cycle, and is checked. */
const CYCLE_CHECK_DEPTH = 64;

/** Storage half of the container, keyed by normalized binding-key strings - resolution (`instantiate`) stays abstract, it is the part an implementation swaps. */
export abstract class BaseContainer extends AbstractContainer {
  protected bindings = new Map<string, Binding>();

  /** How often each bound key has been handed out since counting started. */
  protected resolutionCounts = new Map<string, number>();

  /** Off by default: the counter sits on the hottest path in the container, and an application that never reads the report should not pay for it. */
  protected isCountingResolutions = false;

  /** Whether `startResolutionCounting` has ever run. A report read without it would name every binding, which is a wrong answer rather than an empty one. */
  protected hasStartedResolutionCounting = false;

  /** The string each BOUND symbol is stored under: `Symbol('x')` twice is two keys, and both print as "Symbol(x)". */
  protected symbolKeys = new Map<symbol, string>();

  /** How many symbols have been bound per description, so a new one gets its suffix in one step. */
  protected symbolDescriptionCounts = new Map<string, number>();

  /**
   * Nesting depth of the reads in progress. Past {@link CYCLE_CHECK_DEPTH} the keys are tracked, and
   * a key met again is a cycle: a real graph is far shallower, so the common read pays one counter.
   * Only the synchronous part is checked - a cycle through an `await` is not seen.
   */
  protected resolutionDepth = 0;
  protected resolvingKeys = new Set<string>();

  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? BaseContainer.name });
  }

  override getMetadataRegistry() {
    return metadataRegistry;
  }

  /**
   * The string a key is stored under, or `undefined` for a symbol that was never bound - a lookup
   * never records one, so reading with throwaway symbols leaves nothing behind.
   */
  protected toKeyString(opts: {
    key: TBindingKey | { namespace: string; key: string };
  }): string | undefined {
    const { key } = opts;

    switch (typeof key) {
      case 'string': {
        return key;
      }
      case 'symbol': {
        return this.symbolKeys.get(key);
      }
      case 'object': {
        return BindingKeys.build(key);
      }
      default: {
        throw getError({
          message: `[getBinding] Invalid binding key type | opts: ${String(key)} | allowed: [string, symbol, { namespace: string, key: string }]`,
        });
      }
    }
  }

  /** A bound symbol's own string: its description, suffixed (`Symbol(x)#2`) when another symbol holds it. */
  protected bindSymbolKey(opts: { key: symbol }): string {
    const { key } = opts;

    const known = this.symbolKeys.get(key);
    if (known !== undefined) {
      return known;
    }

    const description = key.toString();
    const count = (this.symbolDescriptionCounts.get(description) ?? 0) + 1;
    this.symbolDescriptionCounts.set(description, count);

    const keyStr = count === 1 ? description : `${description}#${count}`;
    this.symbolKeys.set(key, keyStr);
    return keyStr;
  }

  override bind<T>(opts: { key: TBindingKey }): Binding<T> {
    const { key } = opts;
    const keyStr = typeof key === 'symbol' ? this.bindSymbolKey({ key }) : key;
    const binding = new Binding<T>({ key: keyStr });
    this.bindings.set(keyStr, binding as Binding);
    return binding;
  }

  override isBound(opts: { key: TBindingKey }): boolean {
    const keyStr = this.toKeyString({ key: opts.key });
    return keyStr !== undefined && this.bindings.has(keyStr);
  }

  override getBinding<T>(opts: {
    key: TBindingKey | { namespace: string; key: string };
  }): TNullable<Binding<T>> {
    const keyStr = this.toKeyString({ key: opts.key });
    return keyStr === undefined ? undefined : this.bindings.get(keyStr);
  }

  override unbind(opts: { key: TBindingKey }): boolean {
    const { key } = opts;
    const keyStr = this.toKeyString({ key });

    if (typeof key === 'symbol') {
      this.symbolKeys.delete(key);
    }

    return keyStr !== undefined && this.bindings.delete(keyStr);
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

      // The hot path: a cached singleton or a value builds nothing, so it cannot be part of a cycle.
      if (binding.isSettled()) {
        return binding.getValue(this);
      }

      this.resolutionDepth++;
      const isTracked = this.resolutionDepth > CYCLE_CHECK_DEPTH;

      if (isTracked && this.resolvingKeys.has(binding.key)) {
        this.resolutionDepth--;
        throw getError({
          message: `Circular dependency | ${[...this.resolvingKeys, binding.key].join(' -> ')}`,
        });
      }

      if (isTracked) {
        this.resolvingKeys.add(binding.key);
      }

      try {
        return binding.getValue(this);
      } finally {
        this.resolutionDepth--;
        if (isTracked) {
          this.resolvingKeys.delete(binding.key);
        }
      }
    }

    if (!isOptional) {
      throw getError({
        message: `Binding key: ${typeof key === 'object' ? BindingKeys.build(key) : String(key)} is not bounded in context!`,
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
    this.symbolKeys.clear();
    this.symbolDescriptionCounts.clear();
  }
}
