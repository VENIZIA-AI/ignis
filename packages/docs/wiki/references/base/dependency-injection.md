# Deep Dive: Dependency Injection

Technical reference for the DI system in Ignis - managing resource lifecycles and dependency resolution.

**Files:**
- `packages/inversion/src/container.ts` (base Container and Binding classes)
- `packages/core/src/helpers/inversion/container.ts` (extended Container with ApplicationLogger)
- `packages/core/src/base/metadata/injectors.ts` (@inject, @injectable decorators)
- `packages/core/src/helpers/inversion/registry.ts` (MetadataRegistry)

## Quick Reference

| Component | Purpose | Key Methods |
|-----------|---------|-------------|
| **Container** | DI registry managing resource lifecycles | `bind()`, `get()`, `instantiate()`, `findByTag()` |
| **Binding** | Single registered dependency configuration | `toClass()`, `toValue()`, `toProvider()`, `setScope()`, `setTags()` |
| **@inject** | Decorator marking injection points | Applied to constructor parameters/properties |
| **MetadataRegistry** | Stores decorator metadata | Singleton accessed via `getInstance()` |
| **Boot System** | Automatic artifact discovery and binding | Integrates with Container via tags and bindings |

## `Container` Class

Heart of the DI system - registry managing all application resources.

**File:** `packages/inversion/src/container.ts` (Base) & `packages/core/src/helpers/inversion/container.ts` (Extended)

### Key Methods

| Method | Description |
| :--- | :--- |
| **`bind<T>({ key })`** | Starts a new binding for a given key. It returns a `Binding` instance that you can use to configure the dependency. |
| **`get<T>({ key, isOptional })`** | Retrieves a dependency from the container. The `key` can be a string, a symbol, or an object like `{ namespace: 'services', key: 'MyService' }`. If the dependency is not found and `isOptional` is `false` (the default), it will throw an error. |
| **`instantiate<T>(cls)`** | Creates a new instance of a class, automatically injecting any dependencies specified in its constructor or on its properties. This is the method the container uses internally to create your controllers, services, etc. |
| **`findByTag({ tag })`** | Finds all bindings that have been tagged with a specific tag (e.g., `'controllers'`, `'components'`). This is used by the application to discover and initialize all registered resources of a certain type. |

## `Binding` Class

A `Binding` represents a single registered dependency in the container. It's a fluent API that allows you to specify *how* a dependency should be created and managed.

-   **File:** `packages/inversion/src/container.ts`

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

-   **File:** `packages/core/src/helpers/inversion/registry.ts`

### Role in DI

-   When you use a decorator (e.g., `@inject`), it calls a method on the `MetadataRegistry.getInstance()` to store information about the injection (like the binding key and target property/parameter).
-   When the `Container` instantiates a class, it queries the `MetadataRegistry` to find out which dependencies need to be injected and where.

You typically won't interact with the `MetadataRegistry` directly, but it's the underlying mechanism that makes the decorator-based DI and routing systems work seamlessly.

## Boot System Integration

The boot system (`@venizia/ignis-boot`) extends the DI container to support automatic artifact discovery and registration.

### Key Bindings

When boot system is enabled, the following bindings are created:

| Binding Key | Type | Description |
|-------------|------|-------------|
| `@app/instance` | Value | The application container instance |
| `@app/project_root` | Value | Absolute path to project root |
| `@app/boot-options` | Value | Boot configuration options |
| `bootstrapper` | Class (Singleton) | Main boot orchestrator |
| `booter.DatasourceBooter` | Class (Tagged: 'booter') | Datasource discovery booter |
| `booter.RepositoryBooter` | Class (Tagged: 'booter') | Repository discovery booter |
| `booter.ServiceBooter` | Class (Tagged: 'booter') | Service discovery booter |
| `booter.ControllerBooter` | Class (Tagged: 'booter') | Controller discovery booter |

### Tag-based Discovery

The boot system uses container tags for automatic discovery:

```typescript
// Register a booter with tag
this.bind({ key: 'booter.CustomBooter' })
  .toClass(CustomBooter)
  .setTags('booter');

// Find all booters
const booterBindings = this.findByTag<IBooter>({ tag: 'booter' });
```

This pattern allows the `Bootstrapper` to automatically discover and execute all registered booters without explicit registration.

### Artifact Bindings

Once artifacts are discovered and loaded, they're bound using consistent patterns:

```typescript
// Controllers
this.bind({ key: 'controllers.UserController' }).toClass(UserController);

// Services
this.bind({ key: 'services.UserService' }).toClass(UserService);

// Repositories
this.bind({ key: 'repositories.UserRepository' }).toClass(UserRepository);

// Datasources
this.bind({ key: 'datasources.PostgresDataSource' }).toClass(PostgresDataSource);
```

### Boot Lifecycle & DI

The boot system integrates into the application lifecycle:

1. **Application Constructor** - Binds boot infrastructure if `bootOptions` configured
2. **initialize()** - Calls `boot()` which:
   - Discovers booters from container (via `findByTag`)
   - Instantiates booters (via `container.get()` or `binding.getValue()`)
   - Executes boot phases (configure → discover → load)
   - Each booter binds discovered artifacts to container
3. **Post-Boot** - All artifacts available for dependency injection

**Example Flow:**

```typescript
// 1. Boot discovers UserController.js file
// 2. Boot loads UserController class
// 3. Boot binds to container:
app.bind({ key: 'controllers.UserController' }).toClass(UserController);

// 4. Later, when UserController is instantiated:
@injectable()
class UserController {
  constructor(
    @inject({ key: 'services.UserService' })
    private _userService: UserService  // Auto-injected!
  ) {}
}
```

### Benefits

- **Zero-configuration DI**: Artifacts auto-discovered and registered
- **Convention-based**: Follow naming patterns, get DI for free
- **Extensible**: Custom booters integrate seamlessly via tags
- **Type-safe**: Full TypeScript support throughout boot process

> **Learn More:** See [Bootstrapping Concepts](/guides/core-concepts/application/bootstrapping) and [Boot Package Reference](/references/src-details/boot.md)
