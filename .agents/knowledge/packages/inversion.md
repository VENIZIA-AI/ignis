---
type: Package
title: inversion
description: The standalone IoC container underpinning every other IGNIS package - Container, Binding, MetadataRegistry, the @inject decorator, and the framework-wide error primitives.
resource: packages/inversion
tags: [packages, inversion, di, ioc]
---

`@venizia/ignis-inversion` is the foundation layer of the framework - the start of the dependency chain (`dev-configs -> inversion -> {filter, helpers} -> kernel -> core`). It is a small, standalone dependency injection and IoC container (on the order of a few hundred lines of core logic) with no dependency on the rest of IGNIS: only `reflect-metadata` and `zod`. `lodash` is gone from every IGNIS package - 31 call sites for five functions, 24 KB in a browser bundle. `isEmpty` and `omit` live here in `common/utilities.ts` and are re-exported from `@venizia/ignis-helpers/common`; both were diffed against lodash across 40 values before any call site moved. `isEmpty` is NOT `!value`: `!{}` is `false` while an empty object IS empty, and two of the twenty call sites pass an object. See [DI container](/architecture/di-container.md).

## Container tiering

`src/modules/container/` follows an Abstract -> Base -> concrete tiering: `AbstractContainer` is the contract as a class (every member abstract, typed against `IContainer`), `BaseContainer` adds storage plumbing (bind/lookup/tags/lifecycle over the shipped `Binding`, with `instantiate` still abstract), and `Container` adds the concrete two-phase decorator-metadata injection. A container that shares nothing with the shipped storage would start from `AbstractContainer`; one that only wants to vary resolution starts from `BaseContainer`.

Key `BaseContainer` members: `bind<T>({ key })`, `get<T>({ key, isOptional? })`, `gets<T>({ bindings })`, `resolve`/`instantiate`, `findByTag<T>({ tag, exclude? })`, `isBound`, `unbind`, `clear`/`reset`, `getMetadataRegistry()`. Binding keys are `string | symbol` (`TBindingKey`); a bound symbol gets its own string, suffixed (`Symbol(x)#2`) by a per-description counter when another symbol holds the description; only `bind` records a symbol, `unbind` forgets it, and a lookup with an unbound symbol records nothing. `get` names a synchronous cycle (`Circular dependency | a -> b -> a`): a settled binding (cached singleton or `toValue`) skips the check, any other read counts depth and tracks keys only past 64 levels. Tracking every read cost ~6x on the singleton path when first tried; the depth gate measured within noise of before.

## Instantiation algorithm

`Container.instantiate()` runs two phases: constructor injection (read `@inject` metadata, resolve each dependency into `args[index]`), then property injection (read property metadata, resolve and assign each). **Every constructor parameter of a container-instantiated class must carry `@inject`** - mixing decorated and undecorated parameters is refused, because `@inject` stores its metadata by parameter index and an undecorated parameter leaves a hole the container has no channel to fill. The check lives in `instantiate()` rather than in the decorator itself, because parameter decorators run right-to-left: when `@inject` on parameter 1 fires, parameter 0 has not been visited yet, so nothing at decoration time can know whether it will end up decorated.

## Binding

`src/modules/binding/` provides the fluent API: `toClass(cls)`, `toValue(val)`, `toProvider(fn | cls)`, `setScope('singleton' | 'transient')`, `setTags(...tags)`, `getValue(container?)`, `clearCache()`. Bindings are auto-tagged by namespace - the key's segment before the first dot (`services.UserService` -> tag `services`). Singleton scope is cached per-Binding, not per-Container, boxed (`{ value }`) - a cached `null`/`undefined` is a value, and `clearCache()` always clears. A rejected singleton promise stays cached on purpose: watching it would mark it handled and silence an unawaited rejection (boot `doVerify` reads without awaiting). `binding/` and `container/` talk to each other only through `IContainer`, one-way, to avoid an import cycle.

## MetadataRegistry

`src/modules/registry/` centralizes metadata storage on top of `reflect-metadata`: generic `define`/`get`/`has`/`delete`, constructor injection via `setInjectMetadata`/`getInjectMetadata`, and property injection via `setPropertyMetadata`/`getPropertiesMetadata`. A shared `metadataRegistry` singleton is exported for framework-wide access.

## Decorators

`@inject({ key, isOptional? })`, in `src/modules/metadata/injectors.ts`, marks a constructor parameter or a property for injection. There is NO `@injectable`: it was removed 2026-07-18 after being inert (its scope/tags metadata was written but never read) - scope is set on the binding, not the class. `isOptional: true` resolves to `undefined` instead of throwing when the key is unbound, or, on the `{ target }` form, when the class was never registered. Metadata may carry BOTH `target` and `key` (never from `@inject`, which is one-or-the-other; the kernel writes it for `@repository`): the class's recorded key wins, the key is the fallback for a class nothing recorded. An older inversion reads such metadata key-first - i.e. the pre-change behaviour, not a failure. Property metadata is copy-on-write per class, like constructor metadata: a subclass's property `@inject` never lands in its parent's map.

## Error system

`src/modules/error/` (`app-error.ts`, `definition.ts`, `message-code.ts`, `common/types.ts`) defines `ApplicationError` and `getError` - the framework-wide error primitives every IGNIS package uses instead of throwing a raw `Error`. They live in inversion rather than helpers so that a browser-only consumer gets structured errors without pulling in the server-only helpers surface.

`message-code.ts` never imports `app-error.ts` - that import was the cycle `module-cycles` flagged. `MessageCode.build()` throws through a private `errorFactory` field, and `src/index.ts` sets the real one: `MessageCode.useErrorFactory({ factory: getError })`. `package.json` `exports` lists only `"."` and `"./package.json"`, so no sub-path export can bypass this registration. That call has to live in `src/index.ts` - the package's one exports entry, and the only module `sideEffects` names. A bundler can drop a module-level side effect from any other file the moment nothing imports its exports.

## Folder convention

Every scope owns its folder under `src/modules/` with an `index.ts` barrel, and nests its own `common/{types,constants}.ts` behind a `common/index.ts` barrel - contracts live in `types.ts`, free of concrete classes, which is what keeps `binding/` and `container/` decoupled. Cross-cutting types shared by every scope (`TBindingKey`, `TClass`, `TConstValue`) and the `isClass` guard (`src/common/utilities.ts`) sit in a package-level `src/common/`, outside `modules/`. This is the template every other IGNIS package's folder layout follows.

## Gotcha: dual build is load-bearing

Inversion ships both a CJS build (`dist/cjs/`) and an ESM build (`dist/esm/`), unlike some other internal-only packages that could get away with a single format. This is not incidental: a React frontend consumes `@venizia/ignis-inversion` directly, so dropping either build target would break that consumer even though every other IGNIS package only needs to run under Bun/Node.

## Related

- [DI container](/architecture/di-container.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [boot](/packages/boot.md)
- [helpers](/packages/helpers.md)
