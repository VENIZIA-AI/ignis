# Deep Dive: Dependency Injection

This document provides a technical overview of the dependency injection (DI) system in Ignis, focusing on the `Container`, `Binding`, and `@inject` decorator.

## `Container` Class

The `Container` is the heart of the DI system. It's a registry that manages the lifecycle of all your application's resources.

-   **File:** `packages/core/src/helpers/inversion/container.ts`

### Key Methods

| Method | Description |
| :--- | :--- |
| **`bind<T>({ key })`** | Starts a new binding for a given key. It returns a `Binding` instance that you can use to configure the dependency. |
| **`get<T>({ key, isOptional })`** | Retrieves a dependency from the container. If the dependency is not found and `isOptional` is `false` (the default), it will throw an error. |
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
