---
type: Architecture
title: Artifact registration
description: How a decorated class becomes a container binding - stereotype metadata, the generated index, configs.artifacts, and the registerArtifacts boot step.
resource: packages/kernel/src/base/applications/rest.ts
tags: [architecture, artifacts, registration, decorators, boot]
---

Four hops. `@service()` (or any stereotype) records `IArtifactMetadata` on the class through
`MetadataRegistry.setArtifactMetadata`. `ignis-artifacts generate` lists the class in
`src/generated/artifacts.ts` ([boot package](/packages/boot.md)). The application passes that
object as `configs.artifacts`. The `registerArtifacts` boot step - between `staticConfigure` and
`preConfigure` - calls `registerArtifacts(index)`, which calls the same `dataSource()`,
`component()`, `repository()`, `service()`, `controller()` a hand-written `preConfigure()` would.
Nothing downstream can tell which path registered a class.

## Stereotypes

`@injectable({ type, ...IArtifactRegistrationOptions })` is the root
(`packages/kernel/src/base/metadata/injectable.ts`); it refuses a `type` outside
`ArtifactTypes.SCHEME_SET` at decoration time. `@service` and `@component` are thin calls to it.
`@controller`, `@repository`, `@datasource` and `@model` call
`injectable({ type, ...pickRegistrationOptions({ metadata }) })(target)` first, then their own
setter - one metadata write for the artifact, one for the decorator's own options.

Storage is `MetadataKeys.ARTIFACT` (`Symbol.for('ignis:artifact')`), read with
`Reflect.getOwnMetadata`: a subclass does not inherit its parent's stereotype, and the generator
likewise requires the decorator on the class itself. `@provide` methods accumulate under
`MetadataKeys.PROVIDES` on the constructor.

## Three inputs to one binding

`registerArtifact` (private, behind all five registration methods) resolves each of `binding`,
`scope` and `allowOverride` in this order: explicit `TMixinOpts` at the call site, then the class's
decorator metadata, then the derived default - key `<namespace>.<Class>`, scope `SINGLETON` for
datasource, component and controller, `TRANSIENT` for repository and service, `allowOverride: true`.
A hand-written `this.controller(Ctor)` therefore already honours `@controller({ scope })`.

## What `registerArtifacts` does

1. Flattens `TArtifactIndexInput` (an index, or arrays nested to any depth) into a list.
2. Per kind, in dependency order `dataSources -> components -> repositories -> services -> controllers`,
   collects the classes across every index.
3. Awaits each class's `when({ application })`; `false` skips it and logs at debug
   `Skipped by condition | kind: <field> | class: <Class>`.
4. Stable-sorts survivors by `order` (default 0).
5. Registers each through the matching method; for a component, binds every `@provide` key.

`when` runs before `preConfigure`, so it may read `application.configs` and the environment and
never another artifact's binding. A class registered by hand earlier keeps its earlier position in
the binding map; the later registration overwrites the binding unless `allowOverride: false` makes
it throw. Registering the same index twice is therefore harmless.

## `@provide`

Each `@provide({ key, scope? })` method becomes `this.bind({ key }).toProvider(container =>
container.get(componentKey)[methodName]()).setScope(scope ?? SINGLETON)`. The component key is its
declared `binding` or `components.<Class>`. Nothing runs until the first `get` of the key, so a
provided value may read a datasource or a secret that did not exist at registration time - the
reason option bindings for `AuthenticateComponent`, `AuthorizeComponent` and `HealthCheckComponent`
can live in an application-owned component (`examples/vert/src/components/platform.component.ts`).
`bindProvidedKeys` is private and called only from `registerArtifacts`: a component registered by
hand with `this.component(Ctor)` gets no provided keys.

## Composing indexes

A library exports its own index - generated the same way, or hand-written in the `IArtifactIndex`
shape. The application lists it beside its own and hand-lists the framework components it turns on,
once: `artifacts: [InventoryArtifacts, GeneratedArtifacts, { components: [HealthCheckComponent] }]`.
There is no `imports` option and no auto-discovery of a package's components; a library that wants
IGNIS components registered says so in its index.

## Why an AST at build time, not a glob at run time

`bun build --compile` cannot glob files at run time; the generated index is plain imports the
bundler follows. The scanner never executes a module, so decoration side effects (a datasource
opening a pool at import) cannot leak into a build. The output is deterministic and committed, so a
diff review shows exactly which classes an application registers, and `check` turns a stale index
into a lint failure instead of a runtime 404.

## Position in the boot sequence

`BootSteps.REGISTER_ARTIFACTS` is step 5 of 14 in `BaseApplication.getBootSequence()`:
`printStartUpInfo`, `validateEnvs`, `registerDefaultMiddlewares`, `staticConfigure`,
**`registerArtifacts`**, `preConfigure`, `hydrateSecrets`, `registerDataSources`,
`registerComponents`, `registerContributedDataSources`, `wireSecretRotatables`,
`registerControllers`, `postConfigure`, `validateScopeFilterSupport`. `registerConfiguredArtifacts`
is the step body: it does nothing when `configs.artifacts` is absent.

## Deprecated surface

`BaseApplication.boot()` is a no-op that warns once per process
(`BaseApplication.hasWarnedBootDeprecated`) and returns `{ booters: [], phases: [], totalDurationMs: 0 }`;
15 BANA applications still `override async boot()` against it. `configs.bootOptions` type-checks and
is ignored. `booter()` and `registerBooters()` are removed; `BindingNamespaces.BOOTERS` remains with
no writer.

## The common failures

- **In the index, not bound:** `when` returned `false` (look for the debug skip line) or the index
  is stale (`check:artifacts`).
- **Decorated, not in the index:** not a named export, `abstract`, the decorator imported from a
  wrapper module instead of `@venizia/ignis`/`@venizia/ignis-kernel`, or the file under an ignored
  glob.
- **Provided key resolves to nothing:** the component was registered with `this.component(...)`
  instead of through the index.
- **`@provide` records nothing under bun:** the application's `tsconfig.json` inherits
  `experimentalDecorators` only through `extends`; bun then compiles TC39 decorators and the method
  decorator receives `(value, context)`. Declare the flag directly - see [Gotchas](/conventions/gotchas.md).

## Related

- [Application lifecycle](/architecture/application-lifecycle.md)
- [DI container](/architecture/di-container.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [boot package](/packages/boot.md)
- [Debugging](/process/debugging.md)
