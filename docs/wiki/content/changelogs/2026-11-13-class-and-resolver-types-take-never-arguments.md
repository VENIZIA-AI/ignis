---
title: Class, constructor and resolver types take never arguments, not any
description: "TConstructor, TClass, TResolver, TAsyncResolver, TTask and the open defaults of IBindingTag, IConfigurable, the metadata registry, executeWithMeasure and TUpdateData no longer let an unread value through as any."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-helpers', '@venizia/ignis-kernel']
migration:
  - id: tclass-has-no-index-signature
    symbols: [TClass, TAbstractClass, TConstValue, TStringConstValue, TNumberConstValue]
    upgrade:
      before: |
        const readVersion = (cls: TClass<Service>): string => cls.version; // any
      after: |
        // name the static you read, on the type of the class itself
        const readVersion = (cls: typeof Service): string => cls.version;

        // or, when the parameter must stay a TClass
        const readTagged = (cls: TClass<Service> & { version: string }): string => cls.version;
    downgrade:
      steps:
        - "Read the static off a TClass value directly again; the older index signature was any. The typeof and intersection forms you added keep compiling."
  - id: constructors-take-never-arguments
    symbols: [TConstructor, TAbstractConstructor, TClass, TAbstractClass]
    upgrade:
      before: |
        const build = <T>(cls: TConstructor<T>): T => new cls('a', 1);
      after: |
        // the arguments are never[], so every constructor fits and none can be called with arguments
        const build = <T>(cls: TConstructor<T>): T => Reflect.construct(cls, ['a', 1]);

        // or type the constructor you call
        const buildKnown = <T>(cls: new (name: string, count: number) => T): T => new cls('a', 1);
    downgrade:
      steps:
        - "Call new cls(...args) on a TConstructor again; the older arguments were any[]. Reflect.construct keeps working."
  - id: class-map-typed-per-key
    symbols: [TClass, TConstructor]
    upgrade:
      before: |
        // one union entity type over per-entity classes
        const finders: Record<TTarget, TClass<IFinder<IRole | IPermission>>> = {
          roles: RoleRepository,
          permissions: PermissionRepository,
        };
      after: |
        // the class type is checked against the instance now, so name each class by its own entity
        const finders: { roles: TClass<IFinder<IRole>>; permissions: TClass<IFinder<IPermission>> } = {
          roles: RoleRepository,
          permissions: PermissionRepository,
        };
    downgrade:
      steps:
        - "Type the map with one union entity again; with any[] arguments TypeScript skipped the instance check, so the unsound assignment compiled."
  - id: resolvers-take-never-arguments
    symbols: [TResolver, TAsyncResolver, TValueOrResolver, TValueOrAsyncResolver, TTask]
    upgrade:
      before: |
        const resolver: TResolver<Service> = () => service;
        const value = resolver('key'); // any[]
      after: |
        // call it with no arguments, or type the resolver with the arguments it takes
        const keyed: (key: string) => Service = () => service;
        const value = keyed('key');
    downgrade:
      steps:
        - "Call a TResolver, TAsyncResolver or TTask with arguments again; the older arguments were any[]."
  - id: sort-configurations-keeps-one-class-type
    symbols: [ArtifactIndexHelper.sortConfigurationsTopologically]
    upgrade:
      before: |
        // classes of different kinds in one call: the parameter and result were TClass<any>
        const sorted = helper.sortConfigurationsTopologically({ classes: [ConfigA, ConfigB] });
      after: |
        // T is inferred from the classes; give one common instance type when the classes differ
        const sorted = helper.sortConfigurationsTopologically<BaseConfiguration>({ classes: [ConfigA, ConfigB] });
    downgrade:
      steps:
        - "Pass classes of any instance type again; the older parameter and result were TClass<any>."
  - id: class-results-are-tclass-unknown
    symbols: [ResolverUtility.resolveInjectTarget, isDataSourceClass, MetadataRegistry.getDataSourceModelClasses, TDataSourceDriverClass, TBootProbeTarget, MetadataRegistry.resolveModelKey]
    upgrade:
      before: |
        // a result typed TClass<any> was used as any class
        const target: TClass<MyService> | undefined = ResolverUtility.resolveInjectTarget({ target: injected });
      after: |
        // the result is TClass<unknown>: narrow it to the class you expect
        const resolved = ResolverUtility.resolveInjectTarget({ target: injected });
        const target = resolved && resolved.prototype instanceof MyService ? resolved : undefined;
    downgrade:
      steps:
        - "Use the result as a TClass of any instance type again; the older results were TClass<any>. The parameters (TDataSourceDriverClass, TBootProbeTarget, resolveModelKey) only widened and need no change."
  - id: class-guards-and-targets-widen
    symbols: [TInjectTarget, isClass, isClassProvider, MetadataRegistry.getMethodNames]
    upgrade:
      steps:
        - "Nothing to change. isClass and isClassProvider take unknown (any value fits), TInjectTarget names TClass<unknown>, and getMethodNames defaults its type argument to unknown. These accept everything they accepted."
    downgrade:
      steps:
        - "Nothing to undo."
  - id: binding-tag-values-unknown
    symbols: [IBindingTag]
    upgrade:
      before: |
        const owner: string = tags.owner; // any
      after: |
        const owner = typeof tags.owner === 'string' ? tags.owner : undefined;
    downgrade:
      steps:
        - "Read a tag value without a narrow again; the older values were any."
  - id: configurable-defaults-unknown
    symbols: [IConfigurable]
    upgrade:
      before: |
        const result: string = await configurable.configure(); // any
      after: |
        // name the result type, or narrow it
        const configurable: IConfigurable<object, string> = service;
        const result: string = await configurable.configure();
    downgrade:
      steps:
        - "Use IConfigurable without type arguments again: Options defaulted to any (it is object now) and Result to any (it is unknown now)."
  - id: registry-values-unknown
    symbols: [MetadataRegistry.get, MetadataRegistry.define]
    upgrade:
      before: |
        const value = registry.get({ target, key }); // any
      after: |
        const value = registry.get<typeof target, string>({ target, key });
    downgrade:
      steps:
        - "Drop the type argument; the older Value default was any, for get and for define."
  - id: measure-result-inferred
    symbols: [PerformanceUtility.executeWithMeasure, BaseRestController.measure]
    upgrade:
      before: |
        const rows = await PerformanceUtility.executeWithMeasure({ scope: 'load', task: loadRows, args: [id] });
        // rows: any, task: Function
      after: |
        // R is inferred from the task, task takes no arguments, args is only logged
        const rows = await PerformanceUtility.executeWithMeasure({
          scope: 'load',
          task: () => loadRows(id),
          args: { id },
        });
    downgrade:
      steps:
        - "Pass a task that takes arguments again; the older task type was Function and the result any."
  - id: measure-result-is-the-task-type
    symbols: [PerformanceUtility.executeWithMeasure, BaseRestController.measure]
    upgrade:
      before: |
        const counted: TCountResponse<TRow> = await PerformanceUtility.executeWithMeasure({
          scope: 'update',
          task: async () => this.normalizeCountData<TRow>({ context, payload }), // any hid the union
        });
      after: |
        // the result is what the task returns: the payload, or its data when the count is off
        const counted = await PerformanceUtility.executeWithMeasure({
          scope: 'update',
          task: async () => this.normalizeCountData<TRow>({ context, payload }),
        });

        // hand it on as it is, or narrow it before you treat it as the count shape
    downgrade:
      steps:
        - "Annotate the result as the count shape again; the older result was any."
  - id: update-data-unknown
    symbols: [TUpdateData]
    upgrade:
      before: |
        const rename: TUpdateData = { 'profile.name': 'a' };
        const name: string = rename['profile.name']; // any
      after: |
        const name = typeof rename['profile.name'] === 'string' ? rename['profile.name'] : undefined;
    downgrade:
      steps:
        - "Read a JSON-path key of TUpdateData without a narrow again; the older index was any and the default type argument was any."
---

# Changelog - 2026-11-13

## Class, constructor and resolver types take never arguments, not any

<Badge type="warning" text="Breaking Change" />

**In one line.** The class, constructor and resolver types no longer say `any`: a constructor or resolver fits whatever arguments it takes, and the compiler asks you to type a call that passes them.

## What changed

- **Constructors and classes.** `TConstructor` and `TAbstractConstructor` take `never[]`, so every constructor fits, and none is called with arguments through the type. `TClass` and `TAbstractClass` equal them: the index signature for statics is gone, because a class is not assignable to an index signature of `unknown`.
- **Resolvers and tasks.** `TResolver`, `TAsyncResolver`, `TValueOrResolver`, `TValueOrAsyncResolver` and `TTask` take `never[]`.
- **Open defaults.** The values of `IBindingTag`, the result of `IConfigurable`, the `Value` of `MetadataRegistry.define` and `get`, and the keys of `TUpdateData` are `unknown`. `TUpdateData` defaults to `object`.
- **`executeWithMeasure`.** It infers its result from `task`, which takes no arguments; `args` is `unknown`.
- **The container.** It builds an instance with `Reflect.construct`; resolve speed is unchanged.
- **Added.** `TMixinConstructor` and `TAbstractMixinConstructor`: TypeScript requires `any[]` of a mixin base (error TS2545), so `TMixinTarget` and `TAbstractMixinTarget` keep it through these two.

## Who is affected

- **Code that reads a static member through a `TClass` value, or calls a `TConstructor` or `TResolver` with arguments.** Type the call: see the migration below.
- **Code that assigns per-entity classes to one `TClass` of a union entity.** With `any[]` arguments TypeScript skipped the instance check; it runs now. Type the map per key.
- **Code that annotates the result of `executeWithMeasure` as a type its task does not return.** The result is the task's type now.
- **Code that reads `registry.get`, `IBindingTag`, `IConfigurable` or `TUpdateData` values, or the result of `executeWithMeasure`, without a narrow.** Narrow it or name the type.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks: behaviour is unchanged. The typecheck names each line.

**Before:**

```typescript
const readVersion = (cls: TClass<Service>): string => cls.version;
const build = <T>(cls: TConstructor<T>): T => new cls('a', 1);
```

**After:**

```typescript
const readVersion = (cls: typeof Service): string => cls.version;
const build = <T>(cls: TConstructor<T>): T => Reflect.construct(cls, ['a', 1]);
```
