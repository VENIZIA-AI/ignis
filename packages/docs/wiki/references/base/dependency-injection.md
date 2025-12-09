# Deep Dive: Dependency Injection

Technical reference for the DI system in Ignis - managing resource lifecycles and dependency resolution.

**Files:**
- `packages/core/src/helpers/inversion/container.ts`
- `packages/core/src/base/metadata/injectors.ts`
- `packages/helpers/src/helpers/inversion/registry.ts`

## Quick Reference

| Component | Purpose | Key Methods |
|-----------|---------|-------------|
| **Container** | DI registry managing resource lifecycles | `bind()`, `get()`, `instantiate()`, `findByTag()` |
| **Binding** | Single registered dependency configuration | `toClass()`, `toValue()`, `toProvider()`, `setScope()` |
| **@inject** | Decorator marking injection points | Applied to constructor parameters/properties |
| **MetadataRegistry** | Stores decorator metadata | Singleton accessed via `getInstance()` |

## `Container` Class

Heart of the DI system - registry managing all application resources.

**File:** `packages/core/src/helpers/inversion/container.ts`

### Key Methods

| Method | Description |
| :--- | :--- |
| **`bind<T>({ key })`** | Starts a new binding for a given key. It returns a `Binding` instance that you can use to configure the dependency. |
| **`get<T>({ key, isOptional })`** | Retrieves a dependency from the container. The `key` can be a string, a symbol, or an object like `{ namespace: 'services', key: 'MyService' }`. If the dependency is not found and `isOptional` is `false` (the default), it will throw an error. |
| **`instantiate<T>(cls)`** | Creates a new instance of a class, automatically injecting any dependencies specified in its constructor or on its properties. This is the method the container uses internally to create your controllers, services, etc. |
| **`findByTag({ tag })`** | Finds all bindings that have been tagged with a specific tag (e.g., `'controllers'`, `'components'`). This is used by the application to discover and initialize all registered resources of a certain type. |

## `Binding` Class

A `Binding` represents a single registered dependency in the container. It's a fluent API that allows you to specify *how* a dependency should be created and managed.

-   **File:** `packages/core/src/helpers/inversion/container.ts`

### Configuration Methods

| Method | Description |
| :--- | :--- |
| **`toClass(MyClass)`** | Binds the key to a class. The container will instantiate this class (and resolve its dependencies) when the key is requested. |
| **`toValue(someValue)`** | Binds the key to a constant value (e.g., a configuration object, a string, a number). |
| **`toProvider(MyProvider)`**| Binds the key to a provider class or function. This is for dependencies that require complex creation logic. |
| **`setScope(scope)`** | Sets the lifecycle scope of the binding. See "Binding Scopes" below. |

### Binding Scopes

| Scope | Description |
| :--- | :--- |
| **`BindingScopes.TRANSIENT`** | (Default) A new instance of the dependency is created every time it is injected or requested from the container. |
| **`BindingScopes.SINGLETON`** | A single instance is created the first time it is requested, and that same instance is reused for all subsequent requests. DataSources and Components are typically singletons. |

## `@inject` Decorator

The `@inject` decorator is used to mark where dependencies should be injected.

-   **File:** `packages/core/src/base/metadata/injectors.ts`

### How It Works

1.  When you apply the `@inject` decorator to a constructor parameter or a class property, it uses `Reflect.metadata` to attach metadata to the class.
2.  The metadata includes the **binding key** of the dependency to be injected.
3.  When the `container.instantiate(MyClass)` method is called, it reads this metadata.
4.  It then calls `container.get({ key })` for each decorated parameter/property to resolve the dependency.
5.  Finally, it creates the instance of `MyClass`, passing the resolved dependencies to the constructor or setting them on the instance properties.

This entire process is managed by the framework when your application starts up, ensuring that all your registered classes are created with their required dependencies.

## `MetadataRegistry`

The `MetadataRegistry` is a crucial part of the DI and routing systems. It's a singleton class responsible for storing and retrieving all the metadata attached by decorators like `@inject`, `@controller`, `@get`, etc.

-   **File:** `packages/helpers/src/helpers/inversion/registry.ts`

### Role in DI

-   When you use a decorator (e.g., `@inject`), it calls a method on the `MetadataRegistry.getInstance()` to store information about the injection (like the binding key and target property/parameter).
-   When the `Container` instantiates a class, it queries the `MetadataRegistry` to find out which dependencies need to be injected and where.

You typically won't interact with the `MetadataRegistry` directly, but it's the underlying mechanism that makes the decorator-based DI and routing systems work seamlessly.
