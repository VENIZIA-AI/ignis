---
title: "@venizia/ignis-kernel/metadata"
description: "Every export of @venizia/ignis-kernel/metadata, from the built declarations (generated)."
---

# `@venizia/ignis-kernel/metadata`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

21 exports, 21 with TSDoc. 2 more are re-exported from other entries (listed at the end).

## `ArtifactBindingKeys`

*class*

The one place a binding key is derived for an artifact class - shared by the decorators, the
registration path and any framework that registers artifacts itself, so no copy drifts.

```ts
export declare class ArtifactBindingKeys {
    /**
     * The key a class registers under: the `binding` it pins, or `<namespace>.<ClassName>`. Only the
     * second is `isDerived` - it follows the class name, which a minified build renames.
     */
    static resolve(opts: {
        target: Function;
        namespace: string;
        binding?: {
            namespace: string;
            key: string;
        };
    }): {
        key: string;
        isDerived: boolean;
    };
    /**
     * The keys two DIFFERENT classes derive alike in one registration. A minified build gives classes
     * in different chunks the same short name; a module evaluated twice (hot reload) does too. A pinned
     * `binding` is a deliberate choice and is never counted, nor is a subclass registered after its
     * parent under the parent's name - the override pattern, where the subclass is meant to win.
     */
    static findDerivedCollisions(opts: {
        entries: Array<{
            target: Function;
            namespace: string;
            binding?: {
                namespace: string;
                key: string;
            };
        }>;
    }): Array<string>;
    /** Throws on the first derived collision - the second binding would silently replace the first. */
    static assertNoDerivedCollision(opts: {
        entries: Array<{
            target: Function;
            namespace: string;
            binding?: {
                namespace: string;
                key: string;
            };
        }>;
        caller: string;
    }): void;
    static describeCollision(opts: {
        key: string;
        caller: string;
    }): string;
}
```

Source: `packages/kernel/src/base/metadata/artifact-keys.ts`

## `ArtifactGroup`

*class*

A typed slice of a shared package's artifacts - every decorated class under a directory named `folder` in the package that defined it. A package declares one per domain, once; an application borrows it in `configs.artifacts`. The content is filled by `@venizia/ignis-boot`: inlined when the application is built, or resolved from source when artifacts are registered.

```ts
export declare class ArtifactGroup implements IArtifactGroup {
    /** A string brand, so the group protocol is structural: `@venizia/ignis-boot/auto` builds one without depending on the kernel. */
    static readonly BRAND_KEY = "isArtifactGroup";
    /** The realm slot `@venizia/ignis-boot` fills with the resolver for groups defined without content. */
    static readonly SINGLETON_REALM_KEY = "artifact-group-resolver";
    readonly isArtifactGroup: true;
    readonly resolve: (() => Promise<IArtifactIndex>) | undefined;
    readonly kinds: ReadonlyArray<keyof IArtifactIndex> | undefined;
    private constructor();
    readonly folder: string | undefined;
    readonly site: string | undefined;
    readonly content: IArtifactIndex | undefined;
    readonly ignore: ReadonlyArray<string> | undefined;
    /** `content` is written by the build plugin; a hand-written group passes only `folder`. */
    static define(opts: {
        folder: string;
        content?: IArtifactIndex;
    }): ArtifactGroup;
    /** Every decorated class of the calling package - an application's own artifacts, picked by its call site, so several applications in one process each get their own. `ignore` takes the globs `ignis-artifacts --ignore` takes, relative to the package `src`. `content` is written by the build plugin. */
    static application(opts?: {
        ignore?: ReadonlyArray<string>;
        content?: IArtifactIndex;
    }): ArtifactGroup;
    /** A group carrying only `kinds` - for a slicer that splits `configs.artifacts` by run mode. The source group is resolved when artifacts are registered, never here. */
    static pick(opts: {
        group: IArtifactGroup;
        kinds: ReadonlyArray<keyof IArtifactIndex>;
    }): ArtifactGroup;
    /** A group's classes: inlined by a build, else its own `resolve()`, else the resolver `@venizia/ignis-boot/auto` installs. */
    static resolveContent(opts: {
        group: IArtifactGroup;
    }): Promise<IArtifactIndex>;
    /** Positional on purpose: a type predicate narrows its own parameter, and an options object would narrow the wrapper instead of `value`. */
    static isGroup(value: unknown): value is IArtifactGroup;
    static setResolver(opts: {
        resolve: TGroupResolver | undefined;
    }): void;
    static getResolver(): TGroupResolver | undefined;
    /** The error a walker over `configs.artifacts` gets for reading a kind off a group - loud, never an empty list. */
    static unreadKindError(opts: {
        folder: string | undefined;
    }): Error;
    get configurations(): never;
    get dataSources(): never;
    get components(): never;
    get repositories(): never;
    get services(): never;
    get controllers(): never;
    private static holder;
    /** The module that declared the group, read from the call stack. */
    private static callSite;
    /** The first frame outside the kernel's own `artifact-group` file: POSIX and Windows paths, `file://` URLs (decoded, drive kept), parentheses inside a path. */
    static siteFromStack(opts: {
        stack: string;
    }): string | undefined;
}

type TGroupResolver = (opts: {
    group: IArtifactGroup;
}) => Promise<IArtifactIndex>;
```

Source: `packages/kernel/src/base/applications/artifact-group.ts`

## `ArtifactNamespaces`

*class*

Artifact kind -> namespace. `registerArtifact` gets its namespace from the call site; `@injectable` has only the class.

```ts
export declare class ArtifactNamespaces {
    private static readonly BY_TYPE;
    static resolve(opts: {
        type: string;
    }): TBindingNamespace;
}
```

Source: `packages/kernel/src/common/bindings.ts`

## `ArtifactTypes`

*class*

What a decorated class is to the application - the one fact the artifact generator and the registration methods both read.

```ts
export declare class ArtifactTypes {
    static readonly CONFIGURATION = "configuration";
    static readonly COMPONENT = "component";
    static readonly CONTROLLER = "controller";
    static readonly SERVICE = "service";
    static readonly REPOSITORY = "repository";
    static readonly DATASOURCE = "datasource";
    static readonly MODEL = "model";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/helpers/inversion/common/constants.ts`

## `BindingNamespaces`

*class*

Static binding namespaces for dependency injection.

```ts
export declare class BindingNamespaces {
    private static readonly NAME_PATTERN;
    static readonly COMPONENT: string;
    static readonly DATASOURCE: string;
    static readonly REPOSITORY: string;
    static readonly MODEL: string;
    static readonly SERVICE: string;
    static readonly MIDDLEWARE: string;
    static readonly PROVIDER: string;
    static readonly CONTROLLER: string;
    static readonly CONFIGURATION: string;
    /**
     * A namespace is the leading segment of a binding key, and a binding is tagged with that segment
     * alone - a name carrying '.' or whitespace yields a key no boot step can drain by tag.
     */
    static isValid(opts: {
        name: string;
    }): boolean;
    static createNamespace(opts: {
        name: string;
    }): string;
    /** A namespace-less key is untagged: no boot step drains it and `doVerify` never sees it. */
    static assertArtifactNamespace(opts: {
        namespace: string;
        artifact: string;
        caller: string;
    }): string;
}
```

Source: `packages/kernel/src/common/bindings.ts`

## `component`

*const*

Class decorator that registers the class as a component artifact; accepts the same registration options as `injectable`.

**Example**
```typescript
import { BaseComponent, component } from '@venizia/ignis';

export @component()
class AuditComponent extends BaseComponent {
  constructor() {
    super({ scope: AuditComponent.name });
  }

  override binding(): void {}
}
```

```ts
export declare const component: <ApplicationType = unknown>(opts?: IArtifactRegistrationOptions<ApplicationType>) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/injectable.ts`

## `configuration`

*const*

Class decorator that registers the class as a configuration artifact; `after` orders it behind other configuration classes.

**Example**
```typescript
import { BaseConfiguration, configuration } from '@venizia/ignis';

export @configuration()
class SeedConfiguration extends BaseConfiguration {}

export @configuration({ after: [SeedConfiguration] })
class IndexConfiguration extends BaseConfiguration {}
```

```ts
export declare const configuration: <ApplicationType = unknown>(opts?: IArtifactRegistrationOptions<ApplicationType>) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/injectable.ts`

## `datasource`

*const*

Registers a datasource with driver and auto-discovery settings.

**Example**
```typescript
import { datasource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis-connectors/postgres';
import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';
import { Pool } from 'pg';

export @datasource({ driver: NodePostgresDriver })
class AppDataSource extends BasePostgresDataSource<{ connectionString: string }> {
  constructor() { super({ name: AppDataSource.name, config: { connectionString: 'postgres://localhost/app' } }); }
  override configure(): void { this.client = new Pool(this.settings); }
  override getConnectionString(): string { return this.settings.connectionString; }
}
```

```ts
export declare const datasource: (metadata?: IDataSourceMetadata) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/persistents.ts`

## `IArtifactGroup`

*interface*

A slice of artifacts whose classes are known only when they are registered: a shared package's `ArtifactGroup`, or `@venizia/ignis-boot/auto`. `content` is inlined by a build; otherwise `resolve` (or the resolver `@venizia/ignis-boot` installs) supplies it. The kind fields are typed never so a walker that destructures kinds still compiles - reading one throws.

```ts
export interface IArtifactGroup extends Partial<Record<keyof IArtifactIndex, never>> {
    readonly isArtifactGroup: true;
    /** The directory name the group covers; undefined for the application's own root. */
    readonly folder: string | undefined;
    /** The module that defined the group, for the resolver and the error messages. */
    readonly site: string | undefined;
    readonly content: IArtifactIndex | undefined;
    /** Globs relative to the package `src` whose classes the group leaves out (`ArtifactGroup.application`). */
    readonly ignore?: ReadonlyArray<string>;
    resolve?(): Promise<IArtifactIndex>;
    /** Set on a slice (`ArtifactGroup.pick`): only these kinds are registered, and an empty slice is not an error. */
    readonly kinds?: ReadonlyArray<keyof IArtifactIndex>;
}
```

Source: `packages/kernel/src/base/applications/common/types/artifacts.ts`

## `IArtifactIndex`

*interface*

The shape `@venizia/ignis-boot`'s generator emits and `registerArtifacts()` consumes. Kinds are registered in this field order.

```ts
export interface IArtifactIndex {
    configurations?: ReadonlyArray<TClass<BaseConfiguration>>;
    dataSources?: ReadonlyArray<TClass<IDataSource>>;
    components?: ReadonlyArray<TClass<BaseComponent>>;
    repositories?: ReadonlyArray<TClass<IRepository>>;
    services?: ReadonlyArray<TClass<IService>>;
    controllers?: ReadonlyArray<TClass<unknown>>;
}
```

Source: `packages/kernel/src/base/applications/common/types/artifacts.ts`

## `IArtifactMetadata`

*interface*

Registration options of an artifact plus its `type`.

```ts
export interface IArtifactMetadata<ApplicationType = unknown> extends IArtifactRegistrationOptions<ApplicationType> {
    type: TArtifactType;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `IArtifactRegistrationOptions`

*interface*

Registration defaults a class carries for itself; an explicit `TMixinOpts` at the call site still wins.

```ts
export interface IArtifactRegistrationOptions<ApplicationType = unknown> {
    binding?: {
        namespace: string;
        key: string;
    };
    allowOverride?: boolean;
    scope?: TBindingScope;
    /**
     * Lower registers first within its kind; ties keep index order.
     *
     * @default 0
     */
    order?: number;
    when?: TArtifactCondition<ApplicationType>;
    /** Topological ordering for configurations: must run after these configuration classes. */
    after?: ReadonlyArray<TClass<unknown>>;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `inject`

*const*

`@inject`, bound to the kernel's registry. The container reads
`MetadataRegistry.getInstance()` (`helpers/inversion/container.ts`), while inversion's own
`inject` writes to its module-level registry - metadata written there is never read back.

```ts
export declare const inject: (opts: TInjectOptions) => (target: any, propertyName: string | symbol | undefined, parameterIndex?: number) => void;
```

Source: `packages/kernel/src/base/metadata/injectors.ts`

## `injectable`

*const*

The root stereotype: marks a class as an artifact the application registers, with its registration defaults. Every other stereotype calls it.

```ts
export declare const injectable: <ApplicationType = unknown>(opts: IArtifactMetadata<ApplicationType>) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/injectable.ts`

## `InjectableUtility`

*class*

Helpers of the stereotype decorators; the decorators themselves stay functions.

```ts
export declare class InjectableUtility {
    /** The registration defaults a stereotype forwards to `@injectable`, copied field by field so an absent option stays absent. */
    static pickRegistrationOptions<ApplicationType = unknown>(opts: {
        metadata: IArtifactRegistrationOptions<ApplicationType>;
    }): IArtifactRegistrationOptions<ApplicationType>;
}
```

Source: `packages/kernel/src/base/metadata/injectable.ts`

## `MetadataRegistry`

*class*

Central metadata registry: decorator metadata, the model registry, repository bindings and auto-discovery.

```ts
export declare class MetadataRegistry extends BaseRegistry {
    static readonly SINGLETON_REAL_KEY = "metadata-registry";
    private constructor();
    static getInstance(): MetadataRegistry;
    clearAll(): void;
}

declare const BaseRegistry: {
    new (...args: any[]): {
        discoveredArtifacts: object[];
        addDiscoveredArtifact<Target extends object = object>(opts: {
            target: Target;
        }): void;
        getDiscoveredArtifacts(): ReadonlyArray<object>;
        clearDiscoveredArtifacts(): void;
        setArtifactMetadata<Target extends object = object, ApplicationType = unknown>(opts: {
            target: Target;
            metadata: import("./common/index.js").IArtifactMetadata<ApplicationType>;
        }): void;
        getArtifactMetadata<Target extends object = object>(opts: {
            target: Target;
        }): import("./common/index.js").IArtifactMetadata | undefined;
        addProvideMetadata<Target extends object = object>(opts: {
            target: Target;
            metadata: import("./common/index.js").IProvideMetadata;
        }): void;
        getProvideMetadata<Target extends object = object>(opts: {
            target: Target;
        }): import("./common/index.js").IProvideMetadata[];
        define: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
            value: Value;
        }) => void;
        get: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => Value | undefined;
        has: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        delete: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        getKeys: <Target extends object = object>(opts: {
            target: Target;
        }) => import("@venizia/ignis-inversion").TBindingKey[];
        getMethodNames: <T = unknown>(opts: {
            target: import("@venizia/ignis-inversion").TClass<T>;
        }) => string[];
        clearMetadata: <T extends object = object>(opts: {
            target: T;
        }) => void;
        setPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
            metadata: import("@venizia/ignis-inversion").IPropertyMetadata;
        }) => void;
        getPropertiesMetadata: <T extends object = object>(opts: {
            target: T;
        }) => Map<string | symbol, import("@venizia/ignis-inversion").IPropertyMetadata> | undefined;
        getPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
        }) => import("@venizia/ignis-inversion").IPropertyMetadata | undefined;
        setInjectMetadata: <T extends object = object>(opts: {
            target: T;
            index: number;
            metadata: import("@venizia/ignis-inversion").IInjectMetadata;
        }) => void;
        getInjectMetadata: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").IInjectMetadata[] | undefined;
        setBindingKey: <T extends object = object>(opts: {
            target: T;
            key: import("@venizia/ignis-inversion").TBindingKey;
            isProvisional?: boolean;
        }) => void;
        getBindingKey: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").TBindingKey | undefined;
        scope: string;
        identifier: string;
    };
} & {
    new (...args: any[]): {
        addRpc<Target extends object = object>(opts: {
            target: Target;
            methodName: string | symbol;
            configs: import("./common/index.js").IRpcMetadata;
        }): void;
        getRpcs<Target extends object = object>(opts: {
            target: Target;
        }): Map<string | symbol, import("./common/index.js").IRpcMetadata> | undefined;
        getRpc<Target extends object = object>(opts: {
            target: Target;
            methodName: string | symbol;
        }): import("./common/index.js").IRpcMetadata | undefined;
        hasRpcs<Target extends object = object>(opts: {
            target: Target;
        }): boolean;
        define: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
            value: Value;
        }) => void;
        get: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => Value | undefined;
        has: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        delete: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        getKeys: <Target extends object = object>(opts: {
            target: Target;
        }) => import("@venizia/ignis-inversion").TBindingKey[];
        getMethodNames: <T = unknown>(opts: {
            target: import("@venizia/ignis-inversion").TClass<T>;
        }) => string[];
        clearMetadata: <T extends object = object>(opts: {
            target: T;
        }) => void;
        setPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
            metadata: import("@venizia/ignis-inversion").IPropertyMetadata;
        }) => void;
        getPropertiesMetadata: <T extends object = object>(opts: {
            target: T;
        }) => Map<string | symbol, import("@venizia/ignis-inversion").IPropertyMetadata> | undefined;
        getPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
        }) => import("@venizia/ignis-inversion").IPropertyMetadata | undefined;
        setInjectMetadata: <T extends object = object>(opts: {
            target: T;
            index: number;
            metadata: import("@venizia/ignis-inversion").IInjectMetadata;
        }) => void;
        getInjectMetadata: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").IInjectMetadata[] | undefined;
        setBindingKey: <T extends object = object>(opts: {
            target: T;
            key: import("@venizia/ignis-inversion").TBindingKey;
            isProvisional?: boolean;
        }) => void;
        getBindingKey: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").TBindingKey | undefined;
        scope: string;
        identifier: string;
    };
} & {
    new (...args: any[]): {
        getRoutes<Target extends object = object>(opts: {
            target: Target;
        }): Map<string | symbol, import("../../index.js").IAuthRouteConfig> | undefined;
        getRoute<Target extends object = object>(opts: {
            target: Target;
            methodName: string | symbol;
        }): import("../../index.js").IAuthRouteConfig | undefined;
        hasRoutes<Target extends object = object>(opts: {
            target: Target;
        }): boolean;
        addRoute<Target extends object = object>(opts: {
            target: Target;
            methodName: string | symbol;
            configs: import("../../index.js").IAuthRouteConfig;
        }): void;
        define: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
            value: Value;
        }) => void;
        get: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => Value | undefined;
        has: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        delete: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        getKeys: <Target extends object = object>(opts: {
            target: Target;
        }) => import("@venizia/ignis-inversion").TBindingKey[];
        getMethodNames: <T = unknown>(opts: {
            target: import("@venizia/ignis-inversion").TClass<T>;
        }) => string[];
        clearMetadata: <T extends object = object>(opts: {
            target: T;
        }) => void;
        setPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
            metadata: import("@venizia/ignis-inversion").IPropertyMetadata;
        }) => void;
        getPropertiesMetadata: <T extends object = object>(opts: {
            target: T;
        }) => Map<string | symbol, import("@venizia/ignis-inversion").IPropertyMetadata> | undefined;
        getPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
        }) => import("@venizia/ignis-inversion").IPropertyMetadata | undefined;
        setInjectMetadata: <T extends object = object>(opts: {
            target: T;
            index: number;
            metadata: import("@venizia/ignis-inversion").IInjectMetadata;
        }) => void;
        getInjectMetadata: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").IInjectMetadata[] | undefined;
        setBindingKey: <T extends object = object>(opts: {
            target: T;
            key: import("@venizia/ignis-inversion").TBindingKey;
            isProvisional?: boolean;
        }) => void;
        getBindingKey: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").TBindingKey | undefined;
        scope: string;
        identifier: string;
    };
} & {
    new (...args: any[]): {
        setControllerMetadata<Target extends object = object>(opts: {
            target: Target;
            metadata: import("./common/index.js").TControllerMetadata;
        }): void;
        getControllerMetadata<Target extends object = object>(opts: {
            target: Target;
        }): import("./common/index.js").TControllerMetadata | undefined;
        getRestControllerMetadata<Target extends object = object>(opts: {
            target: Target;
        }): import("./common/index.js").IRestControllerMetadata | undefined;
        getGrpcControllerMetadata<Target extends object = object>(opts: {
            target: Target;
        }): import("./common/index.js").IGrpcControllerMetadata | undefined;
        define: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
            value: Value;
        }) => void;
        get: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => Value | undefined;
        has: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        delete: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        getKeys: <Target extends object = object>(opts: {
            target: Target;
        }) => import("@venizia/ignis-inversion").TBindingKey[];
        getMethodNames: <T = unknown>(opts: {
            target: import("@venizia/ignis-inversion").TClass<T>;
        }) => string[];
        clearMetadata: <T extends object = object>(opts: {
            target: T;
        }) => void;
        setPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
            metadata: import("@venizia/ignis-inversion").IPropertyMetadata;
        }) => void;
        getPropertiesMetadata: <T extends object = object>(opts: {
            target: T;
        }) => Map<string | symbol, import("@venizia/ignis-inversion").IPropertyMetadata> | undefined;
        getPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
        }) => import("@venizia/ignis-inversion").IPropertyMetadata | undefined;
        setInjectMetadata: <T extends object = object>(opts: {
            target: T;
            index: number;
            metadata: import("@venizia/ignis-inversion").IInjectMetadata;
        }) => void;
        getInjectMetadata: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").IInjectMetadata[] | undefined;
        setBindingKey: <T extends object = object>(opts: {
            target: T;
            key: import("@venizia/ignis-inversion").TBindingKey;
            isProvisional?: boolean;
        }) => void;
        getBindingKey: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").TBindingKey | undefined;
        scope: string;
        identifier: string;
    };
} & {
    new (...args: any[]): {
        repositoryBindings: Map<string, IRepositoryBinding<import("../../index.js").AbstractEntity>>;
        repositoryBindingsByClass: Map<Function, IRepositoryBinding<import("../../index.js").AbstractEntity>>;
        datasourceModels: Map<string | Function, Set<TClass<AnyType>>>;
        setRepositoryMetadata<Target extends object = object, Model extends import("../../index.js").AbstractEntity = import("../../index.js").AbstractEntity<unknown>, DataSource extends import("../../index.js").IDataSource = import("../../index.js").IDataSource<{}, import("../../index.js").TAnyDataSourceSchema, {}>>(opts: {
            target: Target;
            metadata: import("./common/index.js").TRepositoryMetadata<Model, DataSource> & {
                _resolved?: import("./common/index.js").IResolvedRepositoryMetadata<Model, DataSource> | undefined;
            };
        }): void;
        getRepositoryMetadata<Target extends object = object>(opts: {
            target: Target;
        }): (import("./common/index.js").TRepositoryMetadata & {
            _resolved?: import("./common/index.js").IResolvedRepositoryMetadata;
        }) | undefined;
        registerRepositoryBinding<Model extends import("../../index.js").AbstractEntity = import("../../index.js").AbstractEntity<unknown>, DataSource extends import("../../index.js").IDataSource = import("../../index.js").IDataSource<{}, import("../../index.js").TAnyDataSourceSchema, {}>>(opts: IRepositoryBinding<Model, DataSource>): void;
        getRepositoryBinding(opts: {
            target: Function;
        } | {
            name: string;
        }): IRepositoryBinding<import("../../index.js").AbstractEntity> | undefined;
        getDataSourceModelClasses(opts: {
            dataSource: string | TClass<import("../../index.js").IDataSource>;
        }): Set<TClass<AnyType>>;
        resolveModelRelations(modelMeta: IModelRegistryEntry): unknown;
        getModels(opts: {
            dataSource: string | TClass<import("../../index.js").IDataSource>;
        }): {
            tableName: string;
            schema: unknown;
            relations?: unknown;
        }[];
        getModelClasses(opts: {
            dataSource: string | TClass<import("../../index.js").IDataSource>;
        }): Array<TClass<unknown>>;
        resolveModelKey(opts: {
            modelClass: TClass<AnyType>;
        }): string;
        buildSchema(opts: {
            dataSource: string | TClass<import("../../index.js").IDataSource>;
        }): {
            schema: Record<string, unknown>;
            relations: Record<string, unknown>;
        };
        hasModels(opts: {
            dataSource: string | TClass<import("../../index.js").IDataSource>;
        }): boolean;
        define: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
            value: Value;
        }) => void;
        get: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => Value | undefined;
        has: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        delete: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        getKeys: <Target extends object = object>(opts: {
            target: Target;
        }) => import("@venizia/ignis-inversion").TBindingKey[];
        getMethodNames: <T = unknown>(opts: {
            target: import("@venizia/ignis-inversion").TClass<T>;
        }) => string[];
        clearMetadata: <T extends object = object>(opts: {
            target: T;
        }) => void;
        setPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
            metadata: import("@venizia/ignis-inversion").IPropertyMetadata;
        }) => void;
        getPropertiesMetadata: <T extends object = object>(opts: {
            target: T;
        }) => Map<string | symbol, import("@venizia/ignis-inversion").IPropertyMetadata> | undefined;
        getPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
        }) => import("@venizia/ignis-inversion").IPropertyMetadata | undefined;
        setInjectMetadata: <T extends object = object>(opts: {
            target: T;
            index: number;
            metadata: import("@venizia/ignis-inversion").IInjectMetadata;
        }) => void;
        getInjectMetadata: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").IInjectMetadata[] | undefined;
        setBindingKey: <T extends object = object>(opts: {
            target: T;
            key: import("@venizia/ignis-inversion").TBindingKey;
            isProvisional?: boolean;
        }) => void;
        getBindingKey: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").TBindingKey | undefined;
        scope: string;
        identifier: string;
        modelRegistry: Map<string, IModelRegistryEntry>;
        getModelMetadata: (opts: {
            target: object;
        }) => import("./common/index.js").IModelMetadata | undefined;
    };
} & {
    new (...args: any[]): {
        modelRegistry: Map<string, IModelRegistryEntry>;
        modelsBySchema: WeakMap<object, IModelRegistryEntry>;
        setModelMetadata<Target extends object = object>(opts: {
            target: Target;
            metadata: import("./common/index.js").IModelMetadata;
        }): void;
        getModelMetadata<Target extends object = object>(opts: {
            target: Target;
        }): import("./common/index.js").IModelMetadata | undefined;
        registerModel<Model extends import("../../index.js").AbstractEntity = import("../../index.js").AbstractEntity<unknown>>(opts: {
            target: import("./common/index.js").TDecoratorModelTarget<Model>;
            metadata: import("./common/index.js").IModelMetadata;
        }): void;
        getModelEntry(opts: {
            name: string;
        }): IModelRegistryEntry | undefined;
        getModelEntryBySchema(opts: {
            schema: object;
        }): IModelRegistryEntry | undefined;
        getAllModels(): Map<string, IModelRegistryEntry>;
        getModelAuthorizeSettings(opts: {
            name: string;
        }): import("./common/index.js").IModelAuthorizeSettings | undefined;
        getAuthorizeModelPrincipals(opts: {
            format: "array";
        }): string[];
        getAuthorizeModelPrincipals(opts: {
            format: "record";
        }): Record<string, string>;
        getAuthorizeModelSettings(opts: {
            format: "array";
        }): {
            name: string;
            authorize: import("./common/index.js").IModelAuthorizeSettings;
            entry: IModelRegistryEntry;
        }[];
        getAuthorizeModelSettings(opts: {
            format: "record";
        }): Record<string, {
            authorize: import("./common/index.js").IModelAuthorizeSettings;
            entry: IModelRegistryEntry;
        }>;
        define: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
            value: Value;
        }) => void;
        get: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => Value | undefined;
        has: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        delete: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        getKeys: <Target extends object = object>(opts: {
            target: Target;
        }) => import("@venizia/ignis-inversion").TBindingKey[];
        getMethodNames: <T = unknown>(opts: {
            target: import("@venizia/ignis-inversion").TClass<T>;
        }) => string[];
        clearMetadata: <T extends object = object>(opts: {
            target: T;
        }) => void;
        setPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
            metadata: import("@venizia/ignis-inversion").IPropertyMetadata;
        }) => void;
        getPropertiesMetadata: <T extends object = object>(opts: {
            target: T;
        }) => Map<string | symbol, import("@venizia/ignis-inversion").IPropertyMetadata> | undefined;
        getPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
        }) => import("@venizia/ignis-inversion").IPropertyMetadata | undefined;
        setInjectMetadata: <T extends object = object>(opts: {
            target: T;
            index: number;
            metadata: import("@venizia/ignis-inversion").IInjectMetadata;
        }) => void;
        getInjectMetadata: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").IInjectMetadata[] | undefined;
        setBindingKey: <T extends object = object>(opts: {
            target: T;
            key: import("@venizia/ignis-inversion").TBindingKey;
            isProvisional?: boolean;
        }) => void;
        getBindingKey: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").TBindingKey | undefined;
        scope: string;
        identifier: string;
    };
} & {
    new (...args: any[]): {
        setDataSourceMetadata<Target extends object = object>(opts: {
            target: Target;
            metadata?: import("./common/index.js").IDataSourceMetadata;
        }): void;
        getDataSourceMetadata<Target extends object = object>(opts: {
            target: Target;
        }): import("./common/index.js").IDataSourceMetadata | undefined;
        define: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
            value: Value;
        }) => void;
        get: <Target extends object = object, Value = unknown>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => Value | undefined;
        has: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        delete: <Target extends object = object>(opts: {
            target: Target;
            key: import("@venizia/ignis-inversion").TBindingKey;
        }) => boolean;
        getKeys: <Target extends object = object>(opts: {
            target: Target;
        }) => import("@venizia/ignis-inversion").TBindingKey[];
        getMethodNames: <T = unknown>(opts: {
            target: import("@venizia/ignis-inversion").TClass<T>;
        }) => string[];
        clearMetadata: <T extends object = object>(opts: {
            target: T;
        }) => void;
        setPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
            metadata: import("@venizia/ignis-inversion").IPropertyMetadata;
        }) => void;
        getPropertiesMetadata: <T extends object = object>(opts: {
            target: T;
        }) => Map<string | symbol, import("@venizia/ignis-inversion").IPropertyMetadata> | undefined;
        getPropertyMetadata: <T extends object = object>(opts: {
            target: T;
            propertyName: string | symbol;
        }) => import("@venizia/ignis-inversion").IPropertyMetadata | undefined;
        setInjectMetadata: <T extends object = object>(opts: {
            target: T;
            index: number;
            metadata: import("@venizia/ignis-inversion").IInjectMetadata;
        }) => void;
        getInjectMetadata: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").IInjectMetadata[] | undefined;
        setBindingKey: <T extends object = object>(opts: {
            target: T;
            key: import("@venizia/ignis-inversion").TBindingKey;
            isProvisional?: boolean;
        }) => void;
        getBindingKey: <T extends object = object>(opts: {
            target: T;
        }) => import("@venizia/ignis-inversion").TBindingKey | undefined;
        scope: string;
        identifier: string;
    };
} & typeof _MetadataRegistry;
```

Source: `packages/kernel/src/helpers/inversion/registry.ts`

## `model`

*const*

Registers a model class with its static schema and relations.

**Example**
```typescript
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';

const noteTable = pgTable('Note', { id: serial('id').primaryKey(), body: text('body') });

export @model({ settings: { query: { limit: { default: 20 } } } })
class Note extends ModelFactory.defineEntity({ table: noteTable }) {}
```

```ts
export declare const model: (input?: IModelMetadata) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/persistents.ts`

## `provide`

*const*

Marks a component method as the provider of `key`. `registerArtifacts` binds the key to a lazy provider that resolves the component and calls the method; SINGLETON unless `scope` says otherwise.

```ts
export declare const provide: (opts: {
    key: string;
    scope?: TBindingScope;
}) => MethodDecorator;
```

Source: `packages/kernel/src/base/metadata/injectable.ts`

## `repository`

*const*

Class decorator that registers a repository and binds it to a model (or, for a remote repository, only a datasource). Called without arguments on a subclass it reuses the type, model and datasource of its nearest decorated parent; registration options are not inherited.

**Example**
```typescript
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
import { AppDataSource } from './app.datasource';
import { Note, noteTable } from './note.model';

export @repository({ model: Note, dataSource: AppDataSource })
class NoteRepository extends DefaultCRUDRepository<typeof noteTable> {}
```

```ts
export declare const repository: <Model extends AbstractEntity = AbstractEntity, DataSource extends IDataSource = IDataSource>(metadata?: TRepositoryMetadata<Model, DataSource>) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/persistents.ts`

## `service`

*const*

Class decorator that registers the class as a service artifact; accepts the same registration options as `injectable`.

**Example**
```typescript
import { BaseService, service } from '@venizia/ignis';

export @service()
class MailService extends BaseService {
  constructor() {
    super({ scope: MailService.name });
  }
}
```

```ts
export declare const service: <ApplicationType = unknown>(opts?: IArtifactRegistrationOptions<ApplicationType>) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/injectable.ts`

## `TBindingNamespace`

*type*

Valid `BindingNamespaces` values.

```ts
export type TBindingNamespace = TConstValue<typeof BindingNamespaces>;
```

Source: `packages/kernel/src/common/bindings.ts`

## Re-exported

- `BindingKeys` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TBindingScope` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
