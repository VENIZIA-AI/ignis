import { type TBindingKey, type TClass, type TInjectTarget, type TNullable } from '@/common/types';
import { ResolverUtility } from '@/common/utilities';
import { Binding } from '../binding/binding';
import { getError } from '../error';
import { metadataRegistry } from '../registry/registry';
import { AbstractContainer } from './abstract';

/** A dependency graph nests far less than this; deeper is all but certainly a cycle, and is checked. */
const CYCLE_CHECK_DEPTH = 64;

/** Storage half of the container, keyed by normalized binding-key strings - resolution (`instantiate`) stays abstract, it is the part an implementation swaps. */
export abstract class BaseContainer extends AbstractContainer {
  /**
   * Every binding of the container, whatever its `T`. The one deliberate `any` of the container: `Binding<T>` is invariant in `T` and this store holds every `T`, so no concrete type argument lets a lookup answer the `Binding<T>` its caller names without a cast. Everything around it is typed; a token-keyed container is the way to remove it.
   */
  protected bindings = new Map<string, Binding<any>>();

  /** How often each bound key has been handed out since counting started. */
  protected resolutionCounts = new Map<string, number>();

  /**
   * Whether resolutions are counted. The counter sits on the hottest path in the container, and an
   * application that never reads the report should not pay for it.
   *
   * @default false
   */
  protected isCountingResolutions = false;

  /** Whether `startResolutionCounting` has ever run. A report read without it would name every binding, which is a wrong answer rather than an empty one. */
  protected hasStartedResolutionCounting = false;

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

  /** A JavaScript caller can still pass a removed form (a symbol, `{ namespace, key }`): say what replaced it. */
  private static assertKey(opts: { key: unknown; caller: string }): void {
    if (typeof opts.key === 'string') {
      return;
    }

    throw getError({
      message: `[${opts.caller}] A binding key is a string made by BindingKeys.build<T>({ namespace?, key }) | got: ${typeof opts.key} | a symbol and the { namespace, key } object are no longer keys`,
    });
  }

  /**
   * The class form reads the key the REGISTRATION recorded, so a call-site override and an imperative
   * `application.service(X)` both resolve. `@inject` takes a key or a class; metadata a framework
   * writes may carry both, and then the class wins and the key is the fallback for a class nothing
   * recorded - one bound by hand with `bind({ key }).toClass(X)`. An optional class with neither
   * resolves to `undefined`, as an optional key would.
   */
  protected resolveBindingKey(opts: {
    key?: TBindingKey;
    target?: TInjectTarget;
    isOptional?: boolean;
    /** Whose declaration this is, as the messages name it: a class, or the container for a `get`. */
    owner: string;
    at: string;
  }): TBindingKey | undefined {
    const { key, target: declared, isOptional = false, owner, at } = opts;

    if (declared === undefined && key !== undefined) {
      return key;
    }

    if (declared === undefined) {
      throw getError({
        message: `[${owner}] ${at} has neither an @inject key nor a class`,
      });
    }

    const target = ResolverUtility.resolveInjectTarget({ target: declared });

    if (target === undefined) {
      throw getError({
        message: `[${owner}] ${at} names a function that did not return a class`,
      });
    }

    const recorded = this.getMetadataRegistry().getBindingKey({ target }) ?? key;

    if (recorded === undefined && isOptional) {
      return undefined;
    }

    if (recorded === undefined) {
      throw getError({
        message: `[${owner}] ${at} names '${target.name}', which is not registered as an artifact | Decorate it (@service, @repository, ...) or register it on the application before it is injected`,
        extra: { unregisteredClass: target.name },
      });
    }

    // A same-name class records the same derived key (a library's own copy of a class the application registers): resolving it would hand back the OTHER class without a word.
    const bound = this.getBinding({ key: recorded })?.boundClass();

    if (bound && bound !== target && !(bound.prototype instanceof target)) {
      throw getError({
        message: `[${owner}] ${at} names '${target.name}', but '${String(recorded)}' is bound to a different class named '${bound.name}' | Two classes share one name and so one key - rename one, re-export the registered one, or inject by key`,
      });
    }

    return recorded;
  }

  override bind<T>(opts: { key: TBindingKey<T> }): Binding<T>;
  override bind(opts: { key: TBindingKey }): Binding;
  override bind<T>(opts: { key: TBindingKey<T> }): Binding<T> {
    const { key } = opts;
    BaseContainer.assertKey({ key, caller: 'bind' });
    const binding = new Binding<T>({ key });
    this.bindings.set(key, binding);

    return binding;
  }

  override isBound(opts: { key: TBindingKey }): boolean {
    BaseContainer.assertKey({ key: opts.key, caller: 'isBound' });

    return this.bindings.has(opts.key);
  }

  override getBinding<T>(opts: { key: TBindingKey<T> }): TNullable<Binding<T>>;
  override getBinding(opts: { key: TBindingKey }): TNullable<Binding>;
  override getBinding<T>(opts: { key: TBindingKey<T> }): TNullable<Binding<T>> {
    BaseContainer.assertKey({ key: opts.key, caller: 'getBinding' });

    return this.bindings.get(opts.key);
  }

  override unbind(opts: { key: TBindingKey }): boolean {
    BaseContainer.assertKey({ key: opts.key, caller: 'unbind' });

    return this.bindings.delete(opts.key);
  }

  override set<T>(opts: { binding: Binding<T> }): void {
    const { binding } = opts;
    this.bindings.set(binding.key, binding);
  }

  override get<T>(
    opts:
      | { key: TBindingKey<T>; isOptional?: false }
      | { target: TClass<T>; key?: never; isOptional?: false },
  ): T;
  override get<T>(
    opts:
      | { key: TBindingKey<T>; isOptional?: boolean }
      | { target: TClass<T>; key?: never; isOptional?: boolean },
  ): T | undefined;
  override get(opts: { key: TBindingKey; isOptional?: boolean }): unknown;
  override get<T>(opts: {
    key?: TBindingKey<T>;
    target?: TClass<T>;
    isOptional?: boolean;
  }): T | undefined {
    const { target, isOptional = false } = opts;
    // The class form is the key `@inject({ target })` would read, resolved by the same method with the same errors.
    const key =
      target === undefined
        ? opts.key
        : this.resolveBindingKey({ target, isOptional, owner: 'Container', at: 'get({ target })' });

    if (key === undefined) {
      // An optional class nothing registered answers `undefined`; a call with neither is the JavaScript misuse `assertKey` names.
      if (target === undefined) {
        BaseContainer.assertKey({ key, caller: 'get' });
      }

      return undefined;
    }

    BaseContainer.assertKey({ key, caller: 'get' });

    const binding = this.getBinding<T>({ key });

    if (binding) {
      // Counted here and nowhere else: constructor injection, property injection, `application.get`
      // and `BindingVerifier.verify` all arrive through this one method. A miss below is not a resolution.
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
        message: `Binding key: ${key} is not bounded in context!`,
        extra: { unboundKey: key },
      });
    }

    return undefined;
  }

  override gets<T extends unknown[]>(opts: {
    bindings: {
      [K in keyof T]: {
        key: TBindingKey<T[K]>;
        isOptional?: boolean;
      };
    };
  }): { [K in keyof T]: T[K] | undefined } {
    return opts.bindings.map((opt) => this.get({ ...opt, isOptional: true })) as {
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

  override findByTag<T = unknown>(opts: {
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
