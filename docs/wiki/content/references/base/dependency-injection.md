---
title: Dependency Injection Reference
description: Technical reference for the DI system in IGNIS
difficulty: advanced
---

# Deep Dive: Dependency Injection

Technical reference for the DI system in IGNIS - managing resource lifecycles and dependency resolution.

**Files:**
- `packages/inversion/src/modules/container/index.ts` - Base `Container` and `Binding` classes
- `packages/inversion/src/modules/registry/index.ts` - Base `MetadataRegistry`
- `packages/inversion/src/modules/metadata/injectors.ts` - Base `@inject` decorator
- `packages/inversion/src/common/types.ts` - `BindingScopes`, `BindingValueTypes`, `BindingKeys`, `IProvider`
- `packages/kernel/src/helpers/inversion/container.ts` - Extended `Container` with `ApplicationLogger`
- `packages/kernel/src/helpers/inversion/registry.ts` - Extended `MetadataRegistry` (singleton, with model/repository/datasource mixins)
- `packages/kernel/src/base/metadata/injectors.ts` - Core `@inject` (wired to extended registry)

## Quick Reference

| Component | Purpose | Key Methods |
|-----------|---------|-------------|
| **Container** | DI registry managing resource lifecycles | `bind()`, `get()`, `gets()`, `instantiate()`, `resolve()`, `findByTag()`, `isBound()`, `unbind()`, `clear()`, `reset()` |
| **Binding** | Single registered dependency configuration | `toClass()`, `toValue()`, `toProvider()`, `setScope()`, `setTags()`, `getValue()`, `clearCache()` |
| **@inject** | Decorator marking injection points | Applied to constructor parameters and class properties |
| **MetadataRegistry** | Stores decorator metadata | Singleton - base via `metadataRegistry` export, core via `MetadataRegistry.getInstance()` |
| **BindingKeys** | Utility for building namespaced keys | `BindingKeys.build({ namespace, key })` |
| **Boot System** | Automatic artifact discovery and binding | Integrates with Container via tags and bindings |

## Prerequisites

Before reading this document, you should understand:

- [TypeScript Decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) - How decorators work in TypeScript
- [IGNIS Application basics](./application.md) - Application lifecycle and initialization
- [Services](./services.md) and [Controllers](./controllers.md) - Basic understanding of IGNIS architecture (REST controllers)
- Inversion of Control (IoC) pattern - [Martin Fowler's article](https://martinfowler.com/articles/injection.html)

## `Container` Class

Heart of the DI system - registry managing all application resources.

**File:** `packages/inversion/src/modules/container/index.ts` (Base) & `packages/kernel/src/helpers/inversion/container.ts` (Extended)

The base `Container` extends `BaseHelper` (which provides `scope` and `identifier` properties). The core `Container` extends the base and adds a `Logger` instance.

### Constructor

```typescript
const container = new Container({ scope: 'MyApp' }); // scope is optional, defaults to "Container"
```

### Key Methods

| Method | Signature | Description |
| :--- | :--- | :--- |
| **`bind`** | `bind<T>({ key: string \| symbol }): Binding<T>` | Creates and registers a new `Binding` for the given key. Returns the `Binding` for fluent configuration. |
| **`get`** | `get<T>({ key, isOptional? }): T` | Retrieves a resolved dependency. `key` can be a `string`, `symbol`, or `{ namespace, key }` object. Throws if not found and `isOptional` is `false` (default). Returns `undefined` if `isOptional` is `true` and not found. |
| **`gets`** | `gets<T extends unknown[]>({ bindings }): { [K in keyof T]: T[K] \| undefined }` | Resolves multiple dependencies at once. Each entry in `bindings` accepts `{ key, isOptional? }`. Returns a tuple-preserving array where missing bindings resolve to `undefined`. |
| **`getBinding`** | `getBinding<T>({ key }): Binding<T> \| undefined` | Returns the raw `Binding` object without resolving it. `key` accepts `string`, `symbol`, or `{ namespace, key }`. |
| **`set`** | `set<T>({ binding: Binding<T> }): void` | Directly sets a pre-built `Binding` into the container. |
| **`isBound`** | `isBound({ key: string \| symbol }): boolean` | Checks if a binding exists for the given key. |
| **`unbind`** | `unbind({ key: string \| symbol }): boolean` | Removes a binding. Returns `true` if it existed. |
| **`resolve`** | `resolve<T>(cls: TClass<T>): T` | Alias for `instantiate()`. Creates a new instance of the class with DI. |
| **`instantiate`** | `instantiate<T>(cls: TClass<T>): T` | Creates a new instance of a class, injecting constructor parameters and property dependencies from the container. |
| **`findByTag`** | `findByTag<T>({ tag, exclude? }): Binding<T>[]` | Finds all bindings tagged with `tag`. Optionally exclude specific binding keys via `exclude` (accepts `Array<string>` or `Set<string>`). |
| **`clear`** | `clear(): void` | Clears cached singleton values on all bindings (does not remove bindings). |
| **`reset`** | `reset(): void` | Removes all bindings entirely. |
| **`getMetadataRegistry`** | `getMetadataRegistry(): MetadataRegistry` | Returns the metadata registry. The core `Container` overrides this to return `MetadataRegistry.getInstance()`. |

### Instantiation Algorithm (Two-Phase)

When `container.instantiate(MyClass)` is called:

1. **Constructor injection** - Reads `@inject` metadata from the class by parameter index. The `Reflect`-stored array is already index-keyed, so there is no sort step; the container resolves each dependency and passes them as constructor arguments.
   - If any index in range has no `@inject` metadata, `instantiate()` throws immediately rather than passing `undefined`.
2. **Property injection** - After the instance is created, reads property metadata, resolves each dependency, and assigns them directly to the instance properties.

```typescript
// Both constructor and property injection in action
class UserController {
  @inject({ key: 'services.NotificationService' })
  private notificationService!: NotificationService; // Property injection

  constructor(
    @inject({ key: 'services.UserService' })
    private userService: UserService, // Constructor injection
  ) {}
}
```

> [!IMPORTANT]
> **Every constructor parameter of a container-instantiated class must carry `@inject`.** Mixing decorated and undecorated parameters is forbidden. `@inject` stores its metadata at the parameter's index, so an undecorated parameter leaves a hole in that array. There is no channel through which the container could supply it anyway - it would resolve to `undefined`. `instantiate()` refuses the shape by class name and parameter index instead of silently dereferencing the hole:
>
> ```
> [NoteController] Constructor parameter 0 has no @inject | Every parameter of a container-instantiated
> class must be decorated - the container cannot supply an undecorated one
> ```
>
> The check lives in `instantiate()`, not in the `@inject` decorator itself. Parameter decorators run right-to-left, so when `@inject` on parameter 1 runs, parameter 0 has not been visited yet - nothing at that point can know whether it will end up decorated.
>
> This does not apply to `@repository`-decorated classes whose constructor appears undecorated at index 0. The `@repository` decorator programmatically writes that inject metadata (`registry.setInjectMetadata({ target, index: 0, ... })`), even though no literal `@inject` appears in source. See [Repositories](./repositories/).

## `Binding` Class

A `Binding` represents a single registered dependency in the container. It provides a fluent API to configure *how* a dependency should be created and managed.

**File:** `packages/inversion/src/modules/container/index.ts`

The `Binding` class extends `BaseHelper`.

### Constructor

```typescript
const binding = new Binding<MyService>({ key: 'services.MyService' });
```

When a binding key contains a dot (e.g., `services.MyService`), the namespace portion (`services`) is automatically added as a tag. This enables `findByTag({ tag: 'services' })` to work without manual tagging.

### Configuration Methods

| Method | Signature | Description |
| :--- | :--- | :--- |
| **`toClass`** | `toClass(value: TClass<T>): this` | Binds to a class. The container will instantiate it (resolving constructor and property dependencies) when requested. |
| **`toValue`** | `toValue(value: T): this` | Binds to a constant value (e.g., a config object, string, number). |
| **`toProvider`** | `toProvider(value: ((container) => T) \| TClass<IProvider<T>>): this` | Binds to a factory function or a class implementing `IProvider<T>`. |
| **`setScope`** | `setScope(scope: TBindingScope): this` | Sets the lifecycle scope (`'singleton'` or `'transient'`). |
| **`setTags`** | `setTags(...tags: string[]): this` | Adds one or more tags to the binding. Tags are additive - calling this multiple times adds more tags. |
| **`getValue`** | `getValue(container?: Container): T` | Resolves the binding's value. For `CLASS` and `PROVIDER` types, a `container` argument is required. Respects singleton caching. |
| **`clearCache`** | `clearCache(): void` | Clears the cached singleton instance (if any). Next `getValue()` call will re-create it. |
| **`hasTag`** | `hasTag(tag: string): boolean` | Checks if the binding has a specific tag. |
| **`getTags`** | `getTags(): string[]` | Returns all tags as an array. |
| **`getScope`** | `getScope(): TBindingScope` | Returns the current scope setting. |
| **`getBindingMeta`** | `getBindingMeta({ type }): TClass<T> \| T \| ...` | Returns the raw resolver value. Throws if the requested type does not match the binding's actual type. |

### Fluent API Example

```typescript
container
  .bind<UserService>({ key: 'services.UserService' })
  .toClass(UserService)
  .setScope(BindingScopes.SINGLETON)
  .setTags('core');
```

### Provider Bindings

Providers allow complex creation logic. Two forms are supported:

**Function provider:**
```typescript
container.bind({ key: 'config.db' }).toProvider((container) => {
  const env = container.get<EnvConfig>({ key: 'config.env' });
  return { host: env.DB_HOST, port: env.DB_PORT };
});
```

**Class provider** (must implement `IProvider<T>`):
```typescript
class DbConfigProvider implements IProvider<DbConfig> {
  value(container: Container): DbConfig {
    const env = container.get<EnvConfig>({ key: 'config.env' });
    return { host: env.DB_HOST, port: env.DB_PORT };
  }
}

container.bind({ key: 'config.db' }).toProvider(DbConfigProvider);
```

### Binding Scopes

| Scope | Value | Description |
| :--- | :--- | :--- |
| **`BindingScopes.TRANSIENT`** | `'transient'` | (Default) A new instance is created every time the dependency is requested. |
| **`BindingScopes.SINGLETON`** | `'singleton'` | A single instance is created on first request and reused for all subsequent requests. The cache is per-Binding, not per-Container. |

### Binding Value Types

| Type | Value | Description |
| :--- | :--- | :--- |
| **`BindingValueTypes.CLASS`** | `'class'` | Bound via `toClass()`. Container instantiates with DI. |
| **`BindingValueTypes.VALUE`** | `'value'` | Bound via `toValue()`. Direct value return. |
| **`BindingValueTypes.PROVIDER`** | `'provider'` | Bound via `toProvider()`. Factory function or `IProvider` class. |

## `BindingKeys` Utility

Builds namespaced binding keys from structured objects.

**File:** `packages/inversion/src/common/types.ts`

```typescript
BindingKeys.build({ namespace: 'services', key: 'UserService' });
// → 'services.UserService'

BindingKeys.build({ namespace: '', key: 'AppConfig' });
// → 'AppConfig'

BindingKeys.build({ namespace: 'services', key: '' });
// → Throws error: key is required
```

This is also used internally by `container.get()` and `container.getBinding()` when you pass a `{ namespace, key }` object as the key.

## `@inject` Decorator

The `@inject` decorator marks where dependencies should be injected - either on constructor parameters or class properties.

**File:** `packages/inversion/src/modules/metadata/injectors.ts` (base) & `packages/kernel/src/base/metadata/injectors.ts` (core wrapper)

### Signature

```typescript
@inject({ key: string | symbol; isOptional?: boolean })
```

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `key` | `string \| symbol` | - | The binding key to resolve from the container. |
| `isOptional` | `boolean` | `false` | If `true`, returns `undefined` instead of throwing when the binding is not found. |

### Constructor Parameter Injection

```typescript
class UserController {
  constructor(
    @inject({ key: 'services.UserService' })
    private userService: UserService,

    @inject({ key: 'services.CacheService', isOptional: true })
    private cacheService?: CacheService, // Won't throw if not registered
  ) {}
}
```

### Property Injection

```typescript
class UserController {
  @inject({ key: 'services.UserService' })
  private userService!: UserService;

  @inject({ key: 'services.CacheService', isOptional: true })
  private cacheService?: CacheService;
}
```

### How It Works

1. When `@inject` is applied to a **constructor parameter**, it stores `IInjectMetadata` (key, index, isOptional) on the class via the `MetadataRegistry`.
2. When `@inject` is applied to a **property**, it stores `IPropertyMetadata` (bindingKey, isOptional) on the class prototype via the `MetadataRegistry`.
3. When `container.instantiate(MyClass)` is called, it reads both metadata sets, resolves each dependency from the container, and injects them.

### Base vs Core Decorators

The `@venizia/ignis-inversion` package exports base decorators that use the module-level `metadataRegistry` singleton. The `@venizia/ignis` (core) package re-exports wrappers that use the core `MetadataRegistry.getInstance()` singleton instead, which includes model/repository/datasource metadata support.

**Always import from `@venizia/ignis` in application code:**
```typescript
import { inject } from '@venizia/ignis';
```

## Registering a Class

No class decorator is needed to make a class injectable. A class becomes resolvable once a binding exists for it. That binding can come from boot auto-discovery, from a framework helper (`app.controller()`, `app.service()`, `@repository`), or explicitly from `container.bind()`. Scope is configured on the binding, never on the class:

```typescript
class UserService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepository: UserRepository,
  ) {
    super({ scope: UserService.name });
  }
}

app.bind({ key: 'services.UserService' })
  .toClass(UserService)
  .setScope(BindingScopes.SINGLETON); // default is TRANSIENT
```

## `MetadataRegistry`

The `MetadataRegistry` stores and retrieves all metadata attached by decorators (`@inject`, `@controller`, `@model`, etc.).

### Base MetadataRegistry

**File:** `packages/inversion/src/modules/registry/index.ts`

A singleton exported as `metadataRegistry`. Extends `BaseHelper`.

| Method | Description |
| :--- | :--- |
| `define({ target, key, value })` | Stores arbitrary metadata on a target using `Reflect.defineMetadata`. |
| `get({ target, key })` | Retrieves metadata by key from a target. |
| `has({ target, key })` | Checks if metadata exists. |
| `delete({ target, key })` | Removes metadata. Returns `true` if it existed. |
| `getKeys({ target })` | Returns all metadata keys on a target. |
| `getMethodNames({ target })` | Returns all method names on a class prototype (excluding `constructor`). |
| `clearMetadata({ target })` | Removes all metadata from a target. |
| `setInjectMetadata({ target, index, metadata })` | Stores constructor parameter injection metadata (`IInjectMetadata`). |
| `getInjectMetadata({ target })` | Returns all constructor injection metadata for a class. |
| `setPropertyMetadata({ target, propertyName, metadata })` | Stores property injection metadata (`IPropertyMetadata`). |
| `getPropertiesMetadata({ target })` | Returns a `Map<string \| symbol, IPropertyMetadata>` for all injected properties. |
| `getPropertyMetadata({ target, propertyName })` | Returns property metadata for a specific property. |

### Core MetadataRegistry

**File:** `packages/kernel/src/helpers/inversion/registry.ts`

Extends the base with controller, repository, model, and datasource metadata support via mixins. Accessed as a singleton via `MetadataRegistry.getInstance()`.

Additional capabilities include:
- Controller metadata (route configs, path mappings)
- REST and gRPC controller metadata
- Repository binding metadata
- Model registry (schema, settings)
- DataSource metadata and schema auto-discovery

### Metadata Keys

Defined in `packages/inversion/src/modules/metadata/common/constants.ts`:

```typescript
MetadataKeys.PROPERTIES  = Symbol.for('ignis:properties')
MetadataKeys.INJECT      = Symbol.for('ignis:inject')
```

### Key Types

```typescript
interface IInjectMetadata {
  key: string | symbol;
  index: number;
  isOptional?: boolean;
}

interface IPropertyMetadata {
  bindingKey: string | symbol;
  isOptional?: boolean;
  [key: string]: any;
}
```

## Artifact Registration and DI

`registerArtifacts` (the `registerArtifacts` boot step) binds every class listed in `configs.artifacts` with the same keys the manual methods use, so injection sites do not care which path registered a class.

| Binding Key | Scope | Registered by |
|-------------|-------|---------------|
| `datasources.<Class>` | Singleton | `dataSource()` / index `dataSources` |
| `components.<Class>` | Singleton | `component()` / index `components` |
| `repositories.<Class>` | Transient | `repository()` / index `repositories` |
| `services.<Class>` | Transient | `service()` / index `services` |
| `controllers.<Class>` | Singleton | `controller()` / index `controllers` |
| any key named in a component's `@provide({ key })` | Singleton (or `@provide({ scope })`) | index `components` only |

A `@provide` key is bound `toProvider`: the provider resolves the component and calls the method on the first `get`, so the value may depend on a datasource or a secret that did not exist at registration time.

```typescript
// Registered from the index at the registerArtifacts step ...
@service()
export class UserService extends BaseService {}

// ... and injected like any other binding
class UserController {
  constructor(@inject({ key: 'services.UserService' }) private userService: UserService) {}
}
```

> **Learn More:** [Registering artifacts](/guides/core-concepts/application/bootstrapping) and the [Artifact Registration reference](/references/base/bootstrapping).

## Request Context Access

Access the current Hono request context from anywhere using `useRequestContext()`. This uses Hono's context storage middleware and requires `asyncContext.enable: true` in application config.

```typescript
import { useRequestContext } from '@venizia/ignis';

class MyService extends BaseService {
  async doSomething() {
    const ctx = useRequestContext();
    if (ctx) {
      const userId = ctx.get('currentUser')?.id;
      // Use context data without passing it through parameters
    }
  }
}
```

> [!WARNING]
> `useRequestContext()` returns `undefined` outside of request handling. Always check for `undefined` before accessing context properties.

**Setup:** Enable async context in your application:
```typescript
class MyApp extends BaseApplication {
  configs = {
    asyncContext: { enable: true },
    // ...
  };
}
```

## See Also

- **Related Concepts:**
  - [Dependency Injection Guide](/guides/core-concepts/dependency-injection) - DI fundamentals tutorial
  - [Application](/guides/core-concepts/application/) - Application extends Container
  - [Controllers](/guides/core-concepts/rest-controllers) - Use DI for injecting services
  - [Services](/guides/core-concepts/services) - Use DI for injecting repositories
  - [Providers](/references/base/providers) - Factory pattern for dynamic injection

- **References:**
  - [Inversion Helper](/extensions/helpers/inversion/) - DI container utilities
  - [Artifact Registration API](/references/base/bootstrapping) - Stereotypes, `@provide`, `registerArtifacts`
  - [Glossary](/guides/reference/glossary#dependency-injection-di) - DI concepts explained

- **Tutorials:**
  - [Testing](/guides/tutorials/testing) - Unit testing with mocked dependencies
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - DI in practice

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - DI patterns and anti-patterns
