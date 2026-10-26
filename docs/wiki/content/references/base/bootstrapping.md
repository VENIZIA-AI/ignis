---
title: Artifact Registration Reference
description: The stereotype decorators, @provide, IArtifactIndex, registerArtifacts, the registerArtifacts boot step, the ignis-artifacts generator and the build stamp
difficulty: advanced
---

# Artifact Registration Reference

Decorators mark a class as an artifact and carry its registration defaults. A generated index lists the classes. `registerArtifacts` binds them in dependency order during the `registerArtifacts` boot step. The how-to is [Registering artifacts](/guides/core-concepts/application/bootstrapping).

**Files:**
- [packages/kernel/src/base/metadata/injectable.ts](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/metadata/injectable.ts)
- [packages/kernel/src/helpers/inversion/common/types/](https://github.com/VENIZIA-AI/ignis/tree/main/packages/kernel/src/helpers/inversion/common/types)
- [packages/kernel/src/base/applications/rest.ts](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/applications/rest.ts)
- [packages/kernel/src/base/applications/common/types/](https://github.com/VENIZIA-AI/ignis/tree/main/packages/kernel/src/base/applications/common/types)
- [packages/kernel/src/base/applications/boot-sequence.ts](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/applications/boot-sequence.ts)
- [packages/boot/src/clis/artifacts.ts](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/clis/artifacts.ts)
- [packages/boot/src/generator/index.ts](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/generator/index.ts)
- [packages/boot/src/build-info/stamp.ts](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/build-info/stamp.ts)
- [packages/boot/src/build-info/resolver.ts](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/build-info/resolver.ts)

## Quick Reference

| Symbol | Package | What it is |
|---|---|---|
| `@injectable`, `@service`, `@component`, `@configuration`, `@provide` | `@venizia/ignis-kernel` (re-exported by `@venizia/ignis`) | Stereotype decorators and the provider method decorator |
| `IArtifactRegistrationOptions`, `IArtifactMetadata`, `IProvideMetadata`, `ArtifactTypes` | `@venizia/ignis-kernel` | Metadata shapes and the artifact type vocabulary |
| `IArtifactIndex`, `TArtifactIndexInput`, `IApplicationConfigs.artifacts` | `@venizia/ignis-kernel` | The index shape and where the application receives it |
| `registerArtifacts()`, `registerConfiguredArtifacts()` | `RestApplication` | Registration from an index; the boot step |
| `ignis-artifacts`, `generateArtifactIndex()`, `checkArtifactIndex()` | `@venizia/ignis-boot` | The generator, as a binary and as functions |
| `BuildInfoStamp`, `BuildInfoResolver` | `@venizia/ignis-boot/build-info` | The build stamp: baked at compile, resolved from git at start |
| `BuildInfoRegistry`, `IBuildInfo`, `TBuildInfoRecord` | `@venizia/ignis-helpers/core` | Where a host registers its stamp at the entrypoint |

## `ArtifactTypes`

The artifact kinds a stereotype may declare.

```typescript
class ArtifactTypes {
  static readonly CONFIGURATION = 'configuration';
  static readonly COMPONENT = 'component';
  static readonly CONTROLLER = 'controller';
  static readonly SERVICE = 'service';
  static readonly REPOSITORY = 'repository';
  static readonly DATASOURCE = 'datasource';
  static readonly MODEL = 'model';
  static readonly SCHEME_SET: Set<string>;
  static isValid(value: string): boolean;
}

type TArtifactType = TConstValue<typeof ArtifactTypes>;
```

## `IArtifactRegistrationOptions`

The six options every stereotype accepts. A stereotype stores them on the class; an explicit `TMixinOpts` passed to `controller()`/`service()`/... at a call site still wins.

```typescript
interface IArtifactRegistrationOptions<ApplicationType = unknown> {
  binding?: { namespace: string; key: string };
  allowOverride?: boolean;
  scope?: TBindingScope;
  order?: number;
  when?: TArtifactCondition<ApplicationType>;
  after?: ReadonlyArray<TClass<unknown>>;
}

type TArtifactCondition<ApplicationType = unknown> = (opts: {
  application: ApplicationType;
}) => ValueOrPromise<boolean>;
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `binding` | `{ namespace: string; key: string }` | `<namespace>.<Class>` | The binding key |
| `allowOverride` | `boolean` | `true`; `bootChecks.binding.allowOverride` when that group is set | `false` makes a same-key re-registration throw instead of overwriting; `true` opts one registration out of the app-wide check |
| `scope` | `TBindingScope` | `SINGLETON` for configuration, datasource, component, controller; `TRANSIENT` for repository, service | Binding scope |
| `order` | `number` | `0` | Lower registers first within its kind; ties keep index order |
| `when` | `TArtifactCondition` | always register | Sync or async. Runs at the `registerArtifacts` step, before `preConfigure`; may read config and env, not another artifact's binding |
| `after` | `ReadonlyArray<TClass<unknown>>` | none | Configurations only. This class registers after the ones listed |

`after` is the topological ordering for configurations. `sortConfigurationsTopologically` runs Kahn's algorithm over the `after` edges and breaks ties by class name, so the result is deterministic. It throws when an `after` entry is not itself a registered configuration, and throws again when the edges form a cycle. It runs after the `order` sort and replaces it, so `after` is what decides configuration order.

## `@injectable`

The root stereotype. Every other stereotype calls it.

```typescript
const injectable: <ApplicationType = unknown>(
  opts: IArtifactMetadata<ApplicationType>,
) => ClassDecorator;

interface IArtifactMetadata<ApplicationType = unknown> extends IArtifactRegistrationOptions<ApplicationType> {
  type: TArtifactType;
}
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `type` | `TArtifactType` | required | The artifact kind |
| ...`IArtifactRegistrationOptions` | | | See above |

Throws at decoration time when `type` is not in `ArtifactTypes.SCHEME_SET`: `[injectable][<Class>] Invalid artifact type: '<type>' | Expected one of: configuration, component, controller, service, repository, datasource, model`.

```typescript
@injectable({ type: ArtifactTypes.SERVICE, scope: BindingScopes.SINGLETON })
export class ClockService extends BaseService {}
```

## `@service`, `@component`, `@configuration`

```typescript
const service: <ApplicationType = unknown>(opts?: IArtifactRegistrationOptions<ApplicationType>) => ClassDecorator;
const component: <ApplicationType = unknown>(opts?: IArtifactRegistrationOptions<ApplicationType>) => ClassDecorator;
const configuration: <ApplicationType = unknown>(opts?: IArtifactRegistrationOptions<ApplicationType>) => ClassDecorator;
```

Options: `IArtifactRegistrationOptions`, all optional.

```typescript
@service()
export class PricingService extends BaseService {}

@component({ when: () => process.env.KAFKA_BROKERS !== undefined, order: -10 })
export class KafkaComponent extends BaseComponent {}

@configuration({ after: [TenantConfiguration] })
export class BillingConfiguration extends BaseConfiguration {}
```

A `@configuration` class binds into the `configurations` namespace at `SINGLETON` and is registered first, before any datasource. It is the place for setup that everything else depends on. `after` is the only ordering that applies to it.

## `@controller`, `@repository`, `@datasource`, `@model`

The four existing decorators accept `IArtifactRegistrationOptions` in addition to their own options, and record `ArtifactTypes.CONTROLLER` / `REPOSITORY` / `DATASOURCE` / `MODEL` through `@injectable`.

| Decorator | Own options | Plus |
|---|---|---|
| `@controller` | `path` | `binding`, `allowOverride`, `scope`, `order`, `when` |
| `@repository` | `model`, `dataSource` | same |
| `@datasource` | connector options | same |
| `@model` | `type` | same - metadata only; a model is never registered from an index |

```typescript
@controller({ path: '/test', when: () => process.env.NODE_ENV !== Environment.PRODUCTION })
export class TestController extends BaseRestController {}
```

## `@provide`

Marks a component method as the provider of one binding key.

```typescript
const provide: (opts: { key: string; scope?: TBindingScope }) => MethodDecorator;

interface IProvideMetadata {
  methodName: string | symbol;
  key: string;
  scope?: TBindingScope;
}
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `key` | `string` | required | The key to bind |
| `scope` | `TBindingScope` | `SINGLETON` | Scope of the provided value |

When `registerArtifacts` registers the component, each `@provide` key is bound `toProvider`: the provider resolves the component from the container and calls the method. Nothing runs until the first `get` of the key. A `@configuration` class gets the same treatment.

```typescript
@component()
export class PlatformComponent extends BaseComponent {
  @provide({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
  healthCheckOptions(): IHealthCheckOptions {
    return { restOptions: { path: '/health-check' } };
  }
}
```

Notes:
- Only a configuration or component registered through `registerArtifacts` (an index) gets its `@provide` keys bound. `this.component(Ctor)` by hand does not read them.
- Under bun-runs-source, a return type that is an interface must come from an `import type` - see the [guide](/guides/core-concepts/application/bootstrapping#if-bun-runs-your-source-directly).

## `IArtifactIndex`, `TArtifactIndexInput`

```typescript
interface IArtifactIndex {
  configurations?: ReadonlyArray<TClass<BaseConfiguration>>;
  dataSources?: ReadonlyArray<TClass<IDataSource>>;
  components?: ReadonlyArray<TClass<BaseComponent>>;
  repositories?: ReadonlyArray<TClass<IRepository>>;
  services?: ReadonlyArray<TClass<IService>>;
  controllers?: ReadonlyArray<TClass<unknown>>;
}

interface IConditionalArtifactIndex {
  when: TArtifactCondition; // ({ application }) => boolean | Promise<boolean>
  index: TArtifactIndexInput;
}

interface IArtifactGroup extends Partial<Record<keyof IArtifactIndex, never>> {
  readonly isArtifactGroup: true;
  readonly folder: string | undefined; // undefined for the application's own root
  readonly site: string | undefined; // the module that defined the group
  readonly content: IArtifactIndex | undefined; // inlined by a build
  resolve?(): Promise<IArtifactIndex>;
}

type TArtifactIndexInput =
  | IArtifactIndex
  | IConditionalArtifactIndex
  | IArtifactGroup
  | TArtifactIndexInput[];
```

`IApplicationConfigs.artifacts?: TArtifactIndexInput` - one index, a conditional entry, a group, or arrays of them nested to any depth. A group (`ArtifactGroup`, `@venizia/ignis-boot/auto`) carries its classes only once artifacts are registered: its kind fields are typed `never`, and reading one throws, so a function that walks the input must pass an entry with `isArtifactGroup: true` through untouched. A conditional entry registers its `index` only when `when` answers true; a false answer drops the whole subtree. Use it for the run-mode gate: `{ when: () => runMode === 'server', index: { controllers: GeneratedArtifacts.controllers } }` keeps a worker's routes out of the container. The field names are the const class `ArtifactIndexFields` (`CONFIGURATIONS`, `DATA_SOURCES`, `COMPONENTS`, `REPOSITORIES`, `SERVICES`, `CONTROLLERS`, with `SCHEME_SET` and `isValid`); `registerArtifacts` reads the index through it, never through a string literal. Field order is registration order.

```typescript
artifacts: [InventoryArtifacts, GeneratedArtifacts, { components: [HealthCheckComponent] }],
```

## `ArtifactGroup`

A typed slice of a shared package's artifacts, from `@venizia/ignis-kernel` (re-exported by `@venizia/ignis`). Browser-safe: no `node:*`, no `Bun.*`.

```typescript
class ArtifactGroup implements IArtifactGroup {
  static define(opts: { folder: string; content?: IArtifactIndex }): ArtifactGroup;
  static isGroup(value: unknown): value is IArtifactGroup;
  static setResolver(opts: { resolve: ((opts: { group: IArtifactGroup }) => Promise<IArtifactIndex>) | undefined }): void;
  readonly folder: string;
  readonly site: string | undefined;
  readonly content: IArtifactIndex | undefined;
}
```

| Member | Meaning |
|---|---|
| `define({ folder })` | Declares a group: every decorated class under a directory named `folder` in the defining package's `src`. Records the defining module (`site`) from the call stack |
| `content` | Written by `IgnisArtifactsPlugin` at build time; a hand-written group leaves it out |
| `isGroup(value)` | Checks the `isArtifactGroup` brand, so the CommonJS and ESM copies of the kernel agree |
| `setResolver({ resolve })` | The resolver for a group with no `content`. `@venizia/ignis-boot/auto` installs it when imported |
| `application({ ignore?, content? })` | From source it needs `@venizia/ignis-boot/auto` imported once in the process (the resolver). Every decorated class of the calling package's `src` - an application's own artifacts picked by its call site, so several applications loaded into one process each get their own. `ignore` leaves out the classes under its globs, relative to `src` (the patterns `ignis-artifacts --ignore` takes); the build plugin reads them from the call, so they must be string literals. The build plugin inlines it like `define` |
| `pick({ group, kinds })` | A slice of any group (a borrowed one or `AutoArtifacts`) carrying only `kinds`, resolved when artifacts are registered. An empty slice is not an error. For a function that splits `configs.artifacts` by run mode |
| `resolveContent({ group })` | The group's classes: inlined `content`, else its own `resolve()`, else the installed resolver |

When artifacts are registered, a group resolves to its `content`, else its own `resolve()`, else the installed resolver. No resolver: an error naming `@venizia/ignis-boot/auto`. A group that resolves to no class: an error naming the folder and the defining module. Each group logs one line with its class names.

## `@venizia/ignis-boot/auto`

The default export is the application's own index as a group (`AutoArtifactGroup`): every decorated class under the `src` beside the `package.json` of the entry module (`Bun.main`; the working directory only for `bun -e`). The list always comes from `src`; each class is loaded from the tree the entry runs from - `src` itself, or the compiled `dist/<path>.js` for an application built with tsc (CommonJS or ESM), so the registered class is the one the code uses. A class with no compiled copy is an error asking for a rebuild. Groups follow the same rule from their call site. One module serves one application per process - for a process that loads several applications, use `ArtifactGroup.application()` in each one. From source, the first registration registers the run-time plugin (`Bun.plugin`) and imports the virtual module `ignis:artifacts`; in a binary built with `IgnisArtifactsPlugin`, the module is replaced by one holding the built index. Importing it also installs the `ArtifactGroup` resolver.

## `IgnisArtifactsPlugin` (`@venizia/ignis-boot/bun`)

`create({ root?, entry?, lazyIndex? })`. `lazyIndex` decides how a build replaces `@venizia/ignis-boot/auto`: lazily (the index loads when artifacts are resolved, so a shared library may import the module at the top of a file) or eagerly (the index is a static import, which keeps a browser bundle tree-shaken). Default: lazy for a server target, eager for `target: 'browser'`.


```typescript
class IgnisArtifactsPlugin {
  static readonly VIRTUAL: 'ignis:artifacts';
  static create(opts?: { root?: string }): BunPlugin; // for Bun.build
  static registerRuntime(opts?: { root?: string }): Promise<void>; // once per process
  static defaultRoot(opts?: { from?: string }): string; // nearest package.json directory + src
  static render(opts: { root: string }): string; // the index as module source, absolute imports
}
```

In `Bun.build` the plugin serves `ignis:artifacts`, replaces `@venizia/ignis-boot/auto` with the built index, and rewrites each `ArtifactGroup.define({ folder })` in the application's workspace dependencies to carry its classes - the binary never scans. A folder with no decorated class fails the build.

## `registerArtifacts`

```typescript
async registerArtifacts(index: TArtifactIndexInput): Promise<void>;
```

Behavior, in order:

1. Flattens nested arrays into a list of `IArtifactIndex`.
2. For each kind in dependency order - `configurations`, `dataSources`, `components`, `repositories`, `services`, `controllers` - collects the classes across every index.
3. Evaluates every class's `when` concurrently; a `false` skips the class and logs at debug `Skipped by condition | kind: <field> | class: <Class>`.
4. Stable-sorts the survivors by `order` (default `0`), then re-sorts configurations topologically by `after`.
5. Registers each through `configuration()` / `dataSource()` / `component()` / `repository()` / `service()` / `controller()`, which read the class's decorator defaults (`binding`, `scope`, `allowOverride`).
6. For a configuration and for a component, binds every `@provide` key to a lazy provider.

All six registration methods share one private `registerArtifact()`. It resolves the binding in a fixed order - explicit `opts`, then the class's `@injectable` metadata, then the derived `{ namespace, key: Class.name }` - writes that key back into `MetadataRegistry` so `@inject({ target })` can read it, stores `opts.options` for the configure sweep, runs `assertNoBindingCollision`, then binds `.toClass(target).setScope(declared?.scope ?? defaultScope)`.

A class registered by hand before this call keeps its earlier position in the binding map; the later registration overwrites the binding unless `allowOverride: false`, or [`bootChecks.binding.allowOverride: false`](#bootchecks), makes it throw.

The step binds and constructs nothing. Configurations are constructed at `registerConfigurations`, datasources at `registerDataSources` and components at `registerComponents`, all after `preConfigure()`; repositories and services are constructed on their first `get` (or at `verifyBindings` when `doVerify` is on). A subclass without its own decorator inherits the repository metadata (`model`, `dataSource`, read through the prototype chain) but not the artifact metadata (`binding`, `scope`, `order`, `when`, `allowOverride`, read as own metadata), so the generator does not list it. Decorate the subclass with a bare `@repository()` - it inherits `model`, `dataSource` and `operationScope` from the nearest decorated parent and registers under its own name - or name it in the index by hand.

## `registerConfiguredArtifacts`

```typescript
protected async registerConfiguredArtifacts(): Promise<void>;
```

The boot step. Calls `registerArtifacts(this.configs.artifacts)` when the config carries an index; does nothing otherwise.

### Position in the boot sequence

`BootSteps.REGISTER_ARTIFACTS` (`'registerArtifacts'`) sits between `staticConfigure` and `preConfigure`. The full `BaseApplication` sequence:

| # | Step | # | Step |
|---|---|---|---|
| 1 | `printStartUpInfo` | 9 | `registerDataSources` |
| 2 | `validateEnvs` | 10 | `registerComponents` |
| 3 | `registerDefaultMiddlewares` | 11 | `registerContributedDataSources` |
| 4 | `staticConfigure` | 12 | `wireSecretRotatables` |
| 5 | **`registerArtifacts`** | 13 | `registerControllers` |
| 6 | `preConfigure` | 14 | `postConfigure` |
| 7 | `hydrateSecrets` | 15 | `verifyBindings` |
| 8 | `registerConfigurations` | 16 | `validateScopeFilterSupport` |

Every step logs `Boot step n/16 <name>` at debug. An application that inserts its own step targets these names through `BootSequence.insertAfter`.

The kernel owns eleven of the names in `BootSteps`; `ServerBootSteps` adds `printStartUpInfo`, `validateEnvs`, `hydrateSecrets`, `wireSecretRotatables` and `validateScopeFilterSupport` on top.

## `bootChecks`

```typescript
bootChecks?: {
  binding?: { doVerify: boolean; allowManual: boolean; allowOverride: boolean };
};
```

One group of three binding decisions on `IApplicationConfigs`. Without `binding`, nothing is verified, and hand registration and same-key override stay allowed.

| Setting | What it does | When it fails |
|---|---|---|
| `doVerify: true` | The `verifyBindings` step (`BootSteps.VERIFY_BINDINGS`, after `postConfigure`) resolves every binding in the `services` and `repositories` namespaces once | Throws once with every failing key: `[verifyBindings] 2 binding(s) cannot be resolved \| services.ReportService: Binding key: repositories.Missing is not bounded in context! \| ...` |
| `allowManual: false` | While `configs.artifacts` is set, a `configuration` / `service` / `repository` / `controller` / `component` / `dataSource` call inside `preConfigure()` or `postConfigure()` is refused | Throws at that call: `[service] 'PricingService' is registered by hand inside preConfigure() while 'configs.artifacts' is set and 'bootChecks.binding.allowManual' is false ...` |
| `allowOverride: false` | Every artifact registration behaves as if it said `allowOverride: false`: a key that is already bound is refused. A registration that says `allowOverride: true`, on the decorator or at the call site, still overrides | Throws at that registration: `[service] Binding key already registered: 'services.RunModeService' \| 'bootChecks.binding.allowOverride' is false ...` |

Resolving at boot builds the singletons then, so a constructor with a side effect runs during `verifyBindings`; turn `doVerify` on in development and UAT. Registrations made by the index step and by the framework's own steps are never counted as manual. The override setting covers the six registration methods only: `bind()`, `set()` and a `@provide` key never pass through it, so a key can still be rebound at runtime.

### Listing none of your own

Set `discoverArtifacts: true` and every decorated class registers itself:

```ts
// index.ts - side effects only; importing the file is what makes the classes exist
import './generated/artifacts';

export const beConfigs: IApplicationConfigs = {
  path: { base: '/', isStrict: true },
  discoverArtifacts: true,
};
```

| `discoverArtifacts` | `artifacts` | What registers |
|---|---|---|
| unset | unset | nothing |
| unset | set | exactly what it lists |
| `true` | unset | every decorated class in the import graph |
| `true` | set | the union, de-duplicated |

**An absent `artifacts` registers nothing, and always will.** Reading it as "register everything"
would change what an existing application boots with, silently - a config builder that omits the key
on purpose would swallow the whole import graph.

Discovery happens at **import** time, not at boot. `injectable` - the function every stereotype calls
- records the class as it decorates it. A boot-time filesystem scan cannot work: a compiled
single-file binary has no source tree, and a class exists at run time only because something imported
it. The generated index already imports every decorated class, so importing it for its side effects
is the whole wiring.

A `@model` is recorded and then skipped: it has a binding namespace but no index field, because its
repository registers it.

> [!WARNING]
> The discovered list is process-wide. **A class with no `when` registers in every application of the
> process.** Several applications in one process tell themselves apart with `when`, which already
> receives the application:
>
> ```ts
> @controller({ when: ({ application }) => application instanceof SearchApplication })
> ```

No class inside IGNIS carries a stereotype, so discovery never turns on a framework component by
itself. Choosing which features an application runs stays explicit:

```ts
preConfigure() {
  this.component(HealthCheckComponent);
  this.component(StaticAssetComponent);
}
```

### Finding a binding nobody resolves

`doVerify` catches one direction: a dependency injected but never registered. The other direction -
a class registered that nothing injects - is silent, so a hand-written artifact list can only grow.

The container counts every key it hands out, and the application filters those counts by namespace:

```ts
await application.initialize();
application.startResolutionCounting();   // counting is off until you ask

// ... run the traffic that exercises the application ...

application.getUnresolvedBindings();   // ['repositories.OrphanRepository', ...]
```

| Member | Answers |
|---|---|
| `getResolutionCounts()` | a copy of key to read count; a key bound and never read is absent |
| `startResolutionCounting()` | clears the counts and starts counting - OFF by default |
| `stopResolutionCounting()` | stops counting, keeps what was counted |
| `getUnresolvedBindings({ tags })` | bound keys with no count, defaulting to the `services` and `repositories` namespaces |

**The reset is not a formality.** With `doVerify: true` the boot reads every service and repository,
so a report taken without a reset is empty for the wrong reason.

A count of zero is evidence, not a verdict. An unread binding may be an allow-list entry or a
technical floor that only one deployment exercises, and the framework cannot tell those from dead
code - read the list, do not automate a deletion from it.

## `ignis-artifacts` (CLI)

Shipped by `@venizia/ignis-boot` as a binary. Requires `typescript` 5 or 6 (peer `^5.0.0 || ^6.0.0`; TypeScript 7 no longer exports the JS API the scanner calls) and runs under bun.

```
ignis-artifacts <generate|check> [--root src] [--out src/generated/artifacts.ts] [--ignore a,b] [--export GeneratedArtifacts] [--source-module <specifier>]...
```

| Flag | Default | Meaning |
|---|---|---|
| `--root` | `src` | Directory to scan, recursively |
| `--out` | `src/generated/artifacts.ts` | Path of the generated file; import paths are relative to it |
| `--ignore` | `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/generated/**` | Comma-separated globs, merged with the default ignore list - never replaces it. A decorated class hidden by one of YOUR globs is named in a `warning:` line on stderr; the defaults stay silent |
| `--export` | `GeneratedArtifacts` | Name of the exported constant |
| `--source-module` | none | A module that re-exports the stereotype decorators, matched exactly - for example a frontend framework built on the kernel. Repeat the flag for each module. Adds to `@venizia/ignis` and `@venizia/ignis-kernel`, never replaces them. The header records every one, so `check` must be given the same set |

| Command | Effect | Exit code |
|---|---|---|
| `generate` | Writes `--out` when its content changed; prints `wrote <out> \| N artifact(s)` or `up to date <out>` | `0` |
| `check` | Renders in memory and compares with the file; prints `fresh <out>`, or `stale <out> - run: <the full generate command>` with every flag that was passed | `0` fresh, `1` stale |
| anything else | Prints usage | `2` |

Default ignore list: `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/generated/**`.

### Detection rules

A class is emitted when all of the following hold:

- It is a **named export** of a `.ts` file under `--root` (not `export default`, not module-private).
- It is **not `abstract`**.
- It carries a stereotype decorator - `configuration`, `component`, `controller`, `service`, `repository`, `datasource` - **imported from `@venizia/ignis`, `@venizia/ignis-kernel` (or one of their sub-paths), or a `--source-module`**. The programmatic `followReexports: true` (what auto artifacts use) also accepts any module whose exports lead there through `export *` and renaming re-exports; only identifiers a class wears as a decorator are followed. Import aliases (`import { service as svc }`) are resolved. A same-named decorator from any other module is ignored.
- Or it carries `@injectable({ type })` where `type` is a string literal or `ArtifactTypes.<NAME>`.

`@model` classes are recognised and never emitted. Every skip is logged with its reason.

### Output

Deterministic: imports sorted by path, class names sorted within each field, one field per kind in the order `configurations`, `dataSources`, `components`, `repositories`, `services`, `controllers`, empty arrays kept. The order mirrors `registerArtifacts`; the kernel re-sorts configurations among themselves by their `after` declarations at boot, so their order inside the field does not matter. A field wider than 100 columns wraps one name per line, so the file passes `bun fmt --check` unchanged. The header names the regenerate command.

## Programmatic API

`@venizia/ignis-boot/generator` exports the same machinery as functions.

```typescript
interface IGenerateOptions {
  root: string;
  out: string;
  ignore?: string[];
  exportName?: string; // default 'GeneratedArtifacts'
  sourceModules?: string[]; // the --source-module flags
}

// scanWithReport({ root, ignore?, sourceModules?, followReexports? }) also returns
// skipped: Array<{ className; filePath; reason: 'abstract' | 'not-exported' | 'ignored' }> (ScanSkipReasons)

const generateArtifactIndex: (opts: IGenerateOptions) => {
  content: string;
  artifacts: IScannedArtifact[];
  written: boolean;
};

const checkArtifactIndex: (opts: IGenerateOptions) => {
  isFresh: boolean;
  expected: string;
  actual: string | undefined;
};

interface IScannedArtifact {
  type: TArtifactType;
  className: string;
  filePath: string;
}

class ArtifactScanner {
  static getInstance(): ArtifactScanner;
  scan(opts: { root: string; ignore?: string[]; sourceModules?: string[] }): IScannedArtifact[];
}

class ArtifactIndexEmitter {
  static render(opts: { artifacts: IScannedArtifact[]; outFile: string; exportName: string }): string;
  /** The `ignis-artifacts generate ...` command for these options - the header and the stale hint print it. */
  static renderCommand(opts: IGenerateOptions): string;
}
```

```typescript
import { checkArtifactIndex } from '@venizia/ignis-boot/generator';

const { isFresh } = checkArtifactIndex({ root: 'src', out: 'src/generated/artifacts.ts' });
```

## Build stamp

`@venizia/ignis-boot/build-info` holds the stamp - `service`, `version`, `commit`, `branch`, `builtAt`.
A compile bakes it into the binary; a run from source resolves it from git when the application
starts. The module imports no TypeScript, so a running application can import it. The how-to is
[Stamping a build](/guides/core-concepts/application/build-info).

```typescript
class BuildInfoStamp {
  /** The identifier `define()` replaces in the bundle and `register()` reads: 'IGNIS_BUILD_INFO'. */
  static readonly GLOBAL_NAME: 'IGNIS_BUILD_INFO';
  /** For a compile script: resolves the stamp now, returns { IGNIS_BUILD_INFO: <JSON> }. */
  static define(opts?: { root?: string }): Promise<Record<string, string>>;
  /** For the entrypoint: the baked stamp if the compile defined it, else the resolver; then BuildInfoRegistry.set. */
  static register(): Promise<void>;
}
```

`register()` sets `commit`, `branch` and `builtAt` and leaves `service` and `version` to the
application's `getAppInfo()`. The health reporter prefers a registered value, so setting them here
would hide the application's own.

```typescript
// compile script
import { BunCompiler } from '@venizia/dev-configs/compilers';
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await BunCompiler.compile({ entrypoint: './src/index.ts', define: await BuildInfoStamp.define() });
```

```typescript
// entrypoint
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await BuildInfoStamp.register();
```

```typescript
class BuildInfoResolver { static getInstance(): BuildInfoResolver; resolve(opts?: { root?: string }): Promise<TBuildInfoRecord>; }
class BuildInfoEnvironmentKeys { static VERSION; static COMMIT; static BRANCH; static BUILT_AT; }
```

`IBuildInfo`, `TBuildInfoRecord` and `BuildInfoRegistry` come from `@venizia/ignis-helpers/core`.
`BunCompiler.compile` takes `define?: Record<string, string>` and passes it to `Bun.build`.

Each field reads the environment first, then its fallback:

| Field | Environment, first non-blank wins | Then | Else |
|---|---|---|---|
| `version` | `APP_ENV_BUILD_VERSION`, `APP_BUILD_VERSION`, `CI_COMMIT_TAG`, `GITHUB_REF_NAME` | `package.json#version` | `unspecified` |
| `commit` | `APP_ENV_BUILD_COMMIT_TAG`, `APP_BUILD_COMMIT`, `CI_COMMIT_SHA`, `GITHUB_SHA`, `COMMIT_SHA` (cut to 12) | `git rev-parse --short=12 HEAD` | `unspecified` |
| `branch` | `APP_BUILD_BRANCH`, `CI_COMMIT_REF_NAME`, `GITHUB_REF_NAME`, `BRANCH_NAME` | `git rev-parse --abbrev-ref HEAD` | `unspecified` |
| `builtAt` | `APP_ENV_BUILD_DATE`, `APP_BUILD_DATE` | the moment the stamp was resolved | - |
| `service` | - | `package.json#name` | `unspecified` |

`git` is asked from `root` (default the current directory) and its exit code is honoured: a
repository with no commit prints the literal `HEAD` on stdout while exiting 128, and that never
becomes a branch name. A `git` that is absent, or a manifest that is unreadable or wrong-typed,
degrades one field and is logged at debug - a start never dies over a stamp.

The registered stamp is reported by [`GET /health/stats`](/extensions/components/health-check).

## Removed

The deprecated runtime boot API is fully removed - see the
[changelog](/changelogs/2026-09-03-deprecated-boot-api-removed) for migration.

| Symbol | Status |
|---|---|
| `BaseApplication.booter()`, `registerBooters()` | Removed |
| `Bootstrapper`, `BaseArtifactBooter`, `ControllerBooter`, `ServiceBooter`, `RepositoryBooter`, `DatasourceBooter`, `BootMixin`, `discoverFiles()`, `loadClasses()`, `isClass()` | Removed from `@venizia/ignis-boot` |
| `TMixinOpts.args` | Removed; `TMixinOpts` is `{ binding?, allowOverride?, options? }` |

## See Also

- [Registering artifacts](/guides/core-concepts/application/bootstrapping) - the how-to
- [Stamping a build](/guides/core-concepts/application/build-info) - the build stamp how-to, with the CI wiring
- [Application reference](/references/base/application) - registration methods and the boot sequence
- [Changelog 2026-09-02](/changelogs/2026-09-02-decorator-artifact-registration)
- [Changelog 2026-09-03](/changelogs/2026-09-03-deprecated-boot-api-removed) - the deprecated boot API removed
