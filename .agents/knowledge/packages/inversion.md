---
type: Package
title: inversion
description: The standalone IoC container underpinning every other IGNIS package - Container, Binding, MetadataRegistry, the @inject decorator, and the framework-wide error primitives.
resource: packages/inversion
tags: [packages, inversion, di, ioc]
---

`@venizia/ignis-inversion` is the foundation layer of the framework - the start of the dependency chain (`dev-configs -> inversion -> {filter, helpers} -> {boot, kernel} -> core`). It is a small, standalone dependency injection and IoC container (on the order of a few hundred lines of core logic) with no dependency on the rest of IGNIS: only `lodash`, `reflect-metadata`, and `zod`. See [DI container](/architecture/di-container.md).

## Container tiering

`src/modules/container/` follows an Abstract -> Base -> concrete tiering: `AbstractContainer` is the contract as a class (every member abstract, typed against `IContainer`), `BaseContainer` adds storage plumbing (bind/lookup/tags/lifecycle over the shipped `Binding`, with `instantiate` still abstract), and `Container` adds the concrete two-phase decorator-metadata injection. A container that shares nothing with the shipped storage would start from `AbstractContainer`; one that only wants to vary resolution starts from `BaseContainer`.

Key `BaseContainer` members: `bind<T>({ key })`, `get<T>({ key, isOptional? })`, `gets<T>({ bindings })`, `resolve`/`instantiate`, `findByTag<T>({ tag, exclude? })`, `isBound`, `unbind`, `clear`/`reset`, `getMetadataRegistry()`. Binding keys are `string | symbol` (`TBindingKey`); a symbol is normalized to its string form at the boundary.

## Instantiation algorithm

`Container.instantiate()` runs two phases: constructor injection (read `@inject` metadata, resolve each dependency into `args[index]`), then property injection (read property metadata, resolve and assign each). **Every constructor parameter of a container-instantiated class must carry `@inject`** - mixing decorated and undecorated parameters is refused, because `@inject` stores its metadata by parameter index and an undecorated parameter leaves a hole the container has no channel to fill. The check lives in `instantiate()` rather than in the decorator itself, because parameter decorators run right-to-left: when `@inject` on parameter 1 fires, parameter 0 has not been visited yet, so nothing at decoration time can know whether it will end up decorated.

## Binding

`src/modules/binding/` provides the fluent API: `toClass(cls)`, `toValue(val)`, `toProvider(fn | cls)`, `setScope('singleton' | 'transient')`, `setTags(...tags)`, `getValue(container?)`, `clearCache()`. Bindings are auto-tagged by namespace - the key's segment before the first dot (`services.UserService` -> tag `services`). Singleton scope is cached per-Binding, not per-Container. `binding/` and `container/` talk to each other only through `IContainer`, one-way, to avoid an import cycle.

## MetadataRegistry

`src/modules/registry/` centralizes metadata storage on top of `reflect-metadata`: generic `define`/`get`/`has`/`delete`, constructor injection via `setInjectMetadata`/`getInjectMetadata`, and property injection via `setPropertyMetadata`/`getPropertiesMetadata`. A shared `metadataRegistry` singleton is exported for framework-wide access.

## Decorators

`@inject({ key, isOptional? })`, in `src/modules/metadata/injectors.ts`, marks a constructor parameter or a property for injection. There is NO `@injectable`: it was removed 2026-07-18 after being inert (its scope/tags metadata was written but never read) - scope is set on the binding, not the class. `isOptional: true` resolves to `undefined` instead of throwing when the key is unbound.

## Error system

`src/modules/error/` (`app-error.ts`, `definition.ts`, `message-code.ts`, `types.ts`) defines `ApplicationError` and `getError` - the framework-wide error primitives every IGNIS package uses instead of throwing a raw `Error`. They live in inversion rather than helpers so that a browser-only consumer gets structured errors without pulling in the server-only helpers surface.

## Folder convention

Every scope owns its folder under `src/modules/` with an `index.ts` barrel, and nests its own `common/{types,constants}.ts` behind a `common/index.ts` barrel - contracts live in `types.ts`, free of concrete classes, which is what keeps `binding/` and `container/` decoupled. Cross-cutting types shared by every scope (`TBindingKey`, `TClass`, `TConstValue`, `isClass`) sit in a package-level `src/common/`, outside `modules/`. This is the template every other IGNIS package's folder layout follows.

## Gotcha: dual build is load-bearing

Inversion ships both a CJS build (`dist/cjs/`) and an ESM build (`dist/esm/`), unlike some other internal-only packages that could get away with a single format. This is not incidental: a React frontend consumes `@venizia/ignis-inversion` directly, so dropping either build target would break that consumer even though every other IGNIS package only needs to run under Bun/Node.

## Related

- [DI container](/architecture/di-container.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [boot](/packages/boot.md)
- [helpers](/packages/helpers.md)
