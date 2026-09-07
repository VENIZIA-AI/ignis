---
type: Architecture
title: DI container
description: How the inversion IoC container resolves dependencies from decorator metadata, and the rules that make it refuse a class.
resource: packages/inversion/src
tags: [architecture, di, container, inversion]
---

`inversion` is IGNIS's standalone IoC container. It is deliberately small - a container, a binding,
a metadata registry, and one decorator (`@inject`, serving both constructor parameters and
properties) - and everything else in the framework is built on it. The application class itself
extends `Container`, so an IGNIS app *is* a container.

## The three container tiers

Split so that a variant implementation only re-earns what it actually varies:

- `AbstractContainer extends BaseHelper` - the contract as a class. Every member abstract, typed
  against `IBinding`, never the concrete `Binding`. A container sharing nothing with the shipped
  storage (a remote container, a read-only snapshot) starts here.
- `BaseContainer extends AbstractContainer` - the storage half: `bind`, `get`, `gets`, `isBound`,
  `unbind`, `findByTag`, `clear`, `reset`, all over a `Map<string, Binding>`. `instantiate` stays
  abstract, because resolution is the part worth swapping.
- `Container extends BaseContainer` - resolution via decorator metadata.

Public keys are `TBindingKey` (`string | symbol`), normalized to string form via `String(key)`.

## Binding: the fluent API

A binding says how a key resolves - three resolver kinds, one scope, plus tags:

```typescript
container.bind({ key: 'services.UserService' })
  .toClass(UserService)          // container instantiates with DI
  .setScope(BindingScopes.SINGLETON)
  .setTags('services');
```

`toValue(v)` returns a value directly; `toProvider(fn | ProviderClass)` runs a factory - a plain
function gets the container, an `IProvider` class is itself instantiated through the container and
then has `.value(container)` called.

`bind()` itself overwrites silently - rebinding an already-bound key just replaces it, no warning. The
artifact-registration methods (`component`/`controller`/`service`/`repository`/`dataSource`) sit on
top of `bind()` and take `TMixinOpts.allowOverride`: default `true` preserves that silent-overwrite
behavior, `false` makes a same-key re-registration throw instead, and
`configs.bootChecks.binding.allowOverride: false` makes `false` the default for the whole application
(an explicit `true` still wins). The check is `RestApplication.assertNoBindingCollision()`, a
protected method - a subclass adding a registration method of its own calls it instead of re-wording
the error, and inherits the app-wide default.

**A binding's key, scope and override rule have three inputs**, resolved in this order by the private
`registerArtifact` behind all five methods: the explicit `TMixinOpts` at the call site, then the
class's stereotype metadata (`@controller({ scope })`, `@service({ binding })`, ...), then the
derived default - `<namespace>.<Class>`, `SINGLETON` for datasource/component/controller,
`TRANSIENT` for repository/service, `allowOverride: true`. A `@provide({ key })` method on a
component registered through `configs.artifacts` is a `toProvider` binding that resolves the
component and calls the method on first `get`, `SINGLETON` unless `@provide({ scope })` says
otherwise - see [Artifact registration](/architecture/boot-lifecycle.md).

**Singleton caching lives on the Binding, not the Container.** `getValue()` caches when scope is
`SINGLETON`; `clearCache()` drops it. `TRANSIENT` (the default) builds a new instance per `get`.

**Namespace auto-tagging:** `Binding`'s constructor splits its key on `.` and, when there is more
than one part, tags the binding with the first segment - `"services.UserService"` is automatically
tagged `"services"`. This is what makes `findByTag({ tag: 'components' })` work without anyone
tagging by hand, and why the binding-key namespaces are load-bearing rather than cosmetic.

## Injection is two-phase

`Container.instantiate(cls)` does constructor injection first, then property injection: read
`@inject` metadata, resolve each entry into `args[meta.index]`, `new cls(...args)`; then read
property metadata off the instance's constructor, resolve each and assign.

`@inject({ key, isOptional })` serves both, branching on whether it was handed a `parameterIndex` or
a `propertyName`, and throwing if neither. Optional dependencies resolve to `undefined` instead of
throwing when the key is unbound.

## Hard rules that are not derivable from the code shape

**Every constructor parameter of a container-instantiated class must carry `@inject`.** `@inject`
stores metadata at the parameter's index, so an undecorated parameter leaves a hole - and there is no
channel through which the container could supply it anyway. `instantiate` refuses the shape by class
name and parameter index rather than dereferencing the hole:

```
[NoteController] Constructor parameter 0 has no @inject | Every parameter of a container-instantiated
class must be decorated - the container cannot supply an undecorated one
```

This also covers the sparse-array case: `@inject` on parameter 1 while parameter 0 is undecorated is
caught by the same guard, with parameter 0 named. The check lives in `instantiate`, not in the
decorator, because parameter decorators run right-to-left - when `@inject` on parameter 1 runs,
parameter 0 has not been visited yet and nothing there can know whether it ever will be. Do not
"fix" this by skipping holes; that silently re-admits the broken shape. Options a controller needs go
inside `super({ scope: X.name })`, never as an undecorated `opts` parameter.

**`experimentalDecorators` and `emitDecoratorMetadata` are mandatory.** Without them, parameter
metadata silently vanishes - `@inject` records nothing and the container sees a class with no
dependencies. A tsconfig whose `extends` chain the runtime cannot resolve is discarded whole, flags
included, producing exactly this failure with no error message.

## Metadata registry

`MetadataRegistry` wraps `reflect-metadata` behind options-object methods (`setInjectMetadata`,
`getInjectMetadata`, `setPropertyMetadata`, `getPropertiesMetadata`, plus the raw
`define`/`get`/`has`/`delete` passthroughs). Its keys are `Symbol.for('ignis:inject')` and friends -
globally registered, so collision-free across module instances. A process-wide `metadataRegistry`
singleton is what `@inject` writes to by default; the decorator accepts a registry override, which
is how tests stay isolated.

## Two classes per name

`AbstractContainer.getMetadataRegistry()` is the swap point. `BaseContainer` returns inversion's
process-global `metadataRegistry`; the framework's `Container`
(`packages/kernel/src/helpers/inversion/container.ts`) overrides it to return
`MetadataRegistry.getInstance()` - the mixin-composed singleton in
`packages/kernel/src/helpers/inversion/registry.ts` that also carries `modelRegistry`,
`repositoryBindings` and `datasourceModels`. `AbstractApplication` extends *that* `Container`, and
`@venizia/ignis` exports the kernel `Container` and `MetadataRegistry` under those names rather than
inversion's - so two distinct classes share each name, and reading "extends `Container`" in
`packages/inversion` finds the wrong one. Decorator metadata survives the split because storage is
`reflect-metadata` under globally registered `Symbol.for('ignis:...')` keys, not instance state.

## Related

- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [inversion package](/packages/inversion.md)
- [Gotchas](/conventions/gotchas.md)
