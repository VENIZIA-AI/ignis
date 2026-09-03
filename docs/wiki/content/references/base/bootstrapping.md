---
title: Artifact Registration Reference
description: The stereotype decorators, @provide, IArtifactIndex, registerArtifacts, the registerArtifacts boot step and the ignis-artifacts generator
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
- [packages/boot/src/cli.ts](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/cli.ts)
- [packages/boot/src/generator/index.ts](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/generator/index.ts)

## Quick Reference

| Symbol | Package | What it is |
|---|---|---|
| `@injectable`, `@service`, `@component`, `@provide` | `@venizia/ignis-kernel` (re-exported by `@venizia/ignis`) | Stereotype decorators and the provider method decorator |
| `IArtifactRegistrationOptions`, `IArtifactMetadata`, `IProvideMetadata`, `ArtifactTypes` | `@venizia/ignis-kernel` | Metadata shapes and the artifact type vocabulary |
| `IArtifactIndex`, `TArtifactIndexInput`, `IApplicationConfigs.artifacts` | `@venizia/ignis-kernel` | The index shape and where the application receives it |
| `registerArtifacts()`, `registerConfiguredArtifacts()` | `RestApplication` | Registration from an index; the boot step |
| `ignis-artifacts`, `generateArtifactIndex()`, `checkArtifactIndex()` | `@venizia/ignis-boot` | The generator, as a binary and as functions |

## `ArtifactTypes`

The artifact kinds a stereotype may declare.

```typescript
class ArtifactTypes {
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

The five options every stereotype accepts. A stereotype stores them on the class; an explicit `TMixinOpts` passed to `controller()`/`service()`/... at a call site still wins.

```typescript
interface IArtifactRegistrationOptions<ApplicationType = unknown> {
  binding?: { namespace: string; key: string };
  allowOverride?: boolean;
  scope?: TBindingScope;
  order?: number;
  when?: TArtifactCondition<ApplicationType>;
}

type TArtifactCondition<ApplicationType = unknown> = (opts: {
  application: ApplicationType;
}) => ValueOrPromise<boolean>;
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `binding` | `{ namespace: string; key: string }` | `<namespace>.<Class>` | The binding key |
| `allowOverride` | `boolean` | `true` | `false` makes a same-key re-registration throw instead of overwriting |
| `scope` | `TBindingScope` | `SINGLETON` for datasource, component, controller; `TRANSIENT` for repository, service | Binding scope |
| `order` | `number` | `0` | Lower registers first within its kind; ties keep index order |
| `when` | `TArtifactCondition` | always register | Sync or async. Runs at the `registerArtifacts` step, before `preConfigure`; may read config and env, not another artifact's binding |

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

Throws at decoration time when `type` is not in `ArtifactTypes.SCHEME_SET`: `[injectable][<Class>] Invalid artifact type: '<type>' | Expected one of: component, controller, service, repository, datasource, model`.

```typescript
@injectable({ type: ArtifactTypes.SERVICE, scope: BindingScopes.SINGLETON })
export class ClockService extends BaseService {}
```

## `@service`, `@component`

```typescript
const service: <ApplicationType = unknown>(opts?: IArtifactRegistrationOptions<ApplicationType>) => ClassDecorator;
const component: <ApplicationType = unknown>(opts?: IArtifactRegistrationOptions<ApplicationType>) => ClassDecorator;
```

Options: `IArtifactRegistrationOptions`, all optional.

```typescript
@service()
export class PricingService extends BaseService {}

@component({ when: () => process.env.KAFKA_BROKERS !== undefined, order: -10 })
export class KafkaComponent extends BaseComponent {}
```

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

When `registerArtifacts` registers the component, each `@provide` key is bound `toProvider`: the provider resolves the component from the container and calls the method. Nothing runs until the first `get` of the key.

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
- Only a component registered through `registerArtifacts` (an index) gets its `@provide` keys bound. `this.component(Ctor)` by hand does not read them.
- Under bun-runs-source, a return type that is an interface must come from an `import type` - see the [guide](/guides/core-concepts/application/bootstrapping#if-bun-runs-your-source-directly).

## `IArtifactIndex`, `TArtifactIndexInput`

```typescript
interface IArtifactIndex {
  dataSources?: ReadonlyArray<TClass<IDataSource>>;
  components?: ReadonlyArray<TClass<BaseComponent>>;
  repositories?: ReadonlyArray<TClass<IRepository>>;
  services?: ReadonlyArray<TClass<IService>>;
  controllers?: ReadonlyArray<TClass<unknown>>;
}

type TArtifactIndexInput = IArtifactIndex | TArtifactIndexInput[];
```

`IApplicationConfigs.artifacts?: TArtifactIndexInput` - one index, or arrays of indexes nested to any depth. The field names are the const class `ArtifactIndexFields` (`DATA_SOURCES`, `COMPONENTS`, `REPOSITORIES`, `SERVICES`, `CONTROLLERS`, with `SCHEME_SET` and `isValid`); `registerArtifacts` reads the index through it, never through a string literal.

```typescript
artifacts: [InventoryArtifacts, GeneratedArtifacts, { components: [HealthCheckComponent] }],
```

## `registerArtifacts`

```typescript
async registerArtifacts(index: TArtifactIndexInput): Promise<void>;
```

Behavior, in order:

1. Flattens nested arrays into a list of `IArtifactIndex`.
2. For each kind in dependency order - `dataSources`, `components`, `repositories`, `services`, `controllers` - collects the classes across every index.
3. Awaits each class's `when`; a `false` skips the class and logs at debug `Skipped by condition | kind: <field> | class: <Class>`.
4. Stable-sorts the survivors by `order` (default `0`).
5. Registers each through `dataSource()` / `component()` / `repository()` / `service()` / `controller()`, which read the class's decorator defaults (`binding`, `scope`, `allowOverride`).
6. For a component, binds every `@provide` key to a lazy provider.

A class registered by hand before this call keeps its earlier position in the binding map; the later registration overwrites the binding unless `allowOverride: false` makes it throw.

## `registerConfiguredArtifacts`

```typescript
protected async registerConfiguredArtifacts(): Promise<void>;
```

The boot step. Calls `registerArtifacts(this.configs.artifacts)` when the config carries an index; does nothing otherwise.

### Position in the boot sequence

`BootSteps.REGISTER_ARTIFACTS` (`'registerArtifacts'`) sits between `staticConfigure` and `preConfigure`. The full `BaseApplication` sequence:

| # | Step | # | Step |
|---|---|---|---|
| 1 | `printStartUpInfo` | 8 | `registerDataSources` |
| 2 | `validateEnvs` | 9 | `registerComponents` |
| 3 | `registerDefaultMiddlewares` | 10 | `registerContributedDataSources` |
| 4 | `staticConfigure` | 11 | `wireSecretRotatables` |
| 5 | **`registerArtifacts`** | 12 | `registerControllers` |
| 6 | `preConfigure` | 13 | `postConfigure` |
| 7 | `hydrateSecrets` | 14 | `validateScopeFilterSupport` |

Every step logs `Boot step n/14 <name>` at debug. An application that inserts its own step targets these names through `BootSequence.insertAfter`.

## `ignis-artifacts` (CLI)

Shipped by `@venizia/ignis-boot` as a binary. Requires `typescript >= 5` (peer dependency) and runs under bun.

```
ignis-artifacts <generate|check> [--root src] [--out src/generated/artifacts.ts] [--ignore a,b] [--export GeneratedArtifacts]
```

| Flag | Default | Meaning |
|---|---|---|
| `--root` | `src` | Directory to scan, recursively |
| `--out` | `src/generated/artifacts.ts` | Path of the generated file; import paths are relative to it |
| `--ignore` | none | Comma-separated globs, added to the default ignore list |
| `--export` | `GeneratedArtifacts` | Name of the exported constant |

| Command | Effect | Exit code |
|---|---|---|
| `generate` | Writes `--out` when its content changed; prints `wrote <out> \| N artifact(s)` or `up to date <out>` | `0` |
| `check` | Renders in memory and compares with the file; prints `fresh <out>` or `stale <out> - run: ...` | `0` fresh, `1` stale |
| anything else | Prints usage | `2` |

Default ignore list: `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/generated/**`.

### Detection rules

A class is emitted when all of the following hold:

- It is a **named export** of a `.ts` file under `--root` (not `export default`, not module-private).
- It is **not `abstract`**.
- It carries a stereotype decorator - `component`, `controller`, `service`, `repository`, `datasource` - **imported from `@venizia/ignis` or `@venizia/ignis-kernel`**. Import aliases (`import { service as svc }`) are resolved. A same-named decorator from another module is ignored.
- Or it carries `@injectable({ type })` where `type` is a string literal or `ArtifactTypes.<NAME>`.

`@model` classes are recognised and never emitted. Every skip is logged with its reason.

### Output

Deterministic: imports sorted by path, class names sorted within each field, one field per kind in the order `dataSources`, `components`, `repositories`, `services`, `controllers`, empty arrays kept. A field wider than 100 columns wraps one name per line, so the file passes `prettier -l` unchanged. The header names the regenerate command.

## Programmatic API

`@venizia/ignis-boot/generator` exports the same machinery as functions.

```typescript
interface IGenerateOptions {
  root: string;
  out: string;
  ignore?: string[];
  exportName?: string; // default 'GeneratedArtifacts'
}

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
  scan(opts: { root: string; ignore?: string[] }): IScannedArtifact[];
}

class ArtifactIndexEmitter {
  static render(opts: { artifacts: IScannedArtifact[]; outFile: string; exportName: string }): string;
}
```

```typescript
import { checkArtifactIndex } from '@venizia/ignis-boot/generator';

const { isFresh } = checkArtifactIndex({ root: 'src', out: 'src/generated/artifacts.ts' });
```

## Removed

The deprecated runtime boot API is fully removed - see the
[changelog](/changelogs/2026-09-03-deprecated-boot-api-removed) for migration.

| Symbol | Status |
|---|---|
| `BaseApplication.booter()`, `registerBooters()` | Removed |
| `Bootstrapper`, `BaseArtifactBooter`, `ControllerBooter`, `ServiceBooter`, `RepositoryBooter`, `DatasourceBooter`, `BootMixin`, `discoverFiles()`, `loadClasses()`, `isClass()` | Removed from `@venizia/ignis-boot` |
| `TMixinOpts.args` | Removed; `TMixinOpts` is `{ binding?, allowOverride? }` |

## See Also

- [Registering artifacts](/guides/core-concepts/application/bootstrapping) - the how-to
- [Application reference](/references/base/application) - registration methods and the boot sequence
- [Changelog 2026-09-02](/changelogs/2026-09-02-decorator-artifact-registration)
- [Changelog 2026-09-03](/changelogs/2026-09-03-deprecated-boot-api-removed) - the deprecated boot API removed
