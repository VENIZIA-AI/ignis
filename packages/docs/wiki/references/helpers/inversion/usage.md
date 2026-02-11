# Usage

## Container Operations

The `Container` manages a `Map<string | symbol, Binding>` and provides methods for binding, resolving, and querying dependencies.

### Binding and Resolving

```typescript
import { Container, BindingScopes } from '@venizia/ignis-inversion';

const container = new Container({ scope: 'MyApp' });

// Bind a class (container instantiates with DI)
container.bind<UserService>({ key: 'services.UserService' })
  .toClass(UserService)
  .setScope(BindingScopes.SINGLETON);

// Bind a constant value
container.bind<string>({ key: 'API_KEY' }).toValue('my-secret-api-key');

// Bind a provider (factory function)
container.bind<DatabaseConnection>({ key: 'DatabaseConnection' })
  .toProvider((container) => {
    return new DatabaseConnection(process.env.DATABASE_URL);
  });

// Resolve a dependency
const userService = container.get<UserService>({ key: 'services.UserService' });
```

### Key Formats

The `get`, `getBinding`, and `gets` methods accept three key formats:

```typescript
// String key
container.get<UserService>({ key: 'services.UserService' });

// Symbol key
container.get<UserService>({ key: Symbol.for('services.UserService') });

// Namespaced object (built via BindingKeys.build)
container.get<UserService>({ key: { namespace: 'services', key: 'UserService' } });
```

### Optional Dependencies

```typescript
// Returns undefined instead of throwing if not bound
const maybeSvc = container.get<MyService>({
  key: 'services.Optional',
  isOptional: true,
});
```

### Resolving Multiple

```typescript
const [svcA, svcB] = container.gets<[ServiceA, ServiceB]>({
  bindings: [
    { key: 'services.ServiceA' },
    { key: 'services.ServiceB', isOptional: true },
  ],
});
```

### Tag-based Lookup

Bindings with namespaced keys (e.g., `services.UserService`) are auto-tagged with the namespace (`services`). You can also set custom tags.

```typescript
container.bind({ key: 'workers.EmailWorker' })
  .toClass(EmailWorker)
  .setTags('background', 'email');

// Find all bindings tagged 'services'
const serviceBindings = container.findByTag({ tag: 'services' });

// Exclude specific keys
const filtered = container.findByTag({
  tag: 'services',
  exclude: ['services.InternalService'],
});
```

### Instantiate Without Binding

```typescript
// Create an instance with full DI resolution but don't register it
const instance = container.resolve<MyClass>(MyClass);
// or equivalently:
const instance2 = container.instantiate<MyClass>(MyClass);
```

> [!NOTE]
> The instantiation algorithm is two-phase: first it resolves constructor parameter `@inject` metadata (sorted by param index), then it resolves property `@inject` metadata and assigns each dependency.

### Cache and Reset

```typescript
// Clear all singleton caches (bindings remain registered)
container.clear();

// Remove all bindings entirely
container.reset();
```

::: details Container Methods Summary

| Method | Purpose |
|--------|---------|
| `bind<T>({ key })` | Create and register a new `Binding<T>` |
| `get<T>({ key, isOptional? })` | Resolve a single dependency by key |
| `gets<T>({ bindings })` | Resolve multiple dependencies at once |
| `getBinding<T>({ key })` | Retrieve the raw `Binding<T>` without resolving |
| `set({ binding })` | Register an externally-created `Binding` |
| `resolve<T>(cls)` / `instantiate<T>(cls)` | Create an instance of `cls` with full DI |
| `findByTag<T>({ tag, exclude? })` | Find all bindings matching a tag |
| `isBound({ key })` | Check if a key is registered |
| `unbind({ key })` | Remove a binding |
| `clear()` | Clear all singleton caches (bindings remain) |
| `reset()` | Remove all bindings entirely |
| `getMetadataRegistry()` | Access the shared `MetadataRegistry` instance |

:::

## Binding API

The `Binding<T>` class provides a fluent API for configuring how a dependency is resolved. Each binding has a key, a resolver (class/value/provider), a scope, and tags.

### Resolver Types

Three resolver strategies are available:

```typescript
// Class -- container instantiates with DI
container.bind<UserService>({ key: 'services.UserService' })
  .toClass(UserService);

// Value -- return directly
container.bind<string>({ key: 'APP_NAME' })
  .toValue('MyApp');

// Provider -- factory function or IProvider class
container.bind<DatabaseConnection>({ key: 'db.connection' })
  .toProvider((container) => {
    const config = container.get<Config>({ key: 'config.database' });
    return new DatabaseConnection(config);
  });
```

### Class-based Provider

For complex creation logic, implement the `IProvider<T>` interface:

```typescript
import { IProvider, Container } from '@venizia/ignis-inversion';

class DatabaseConnectionProvider implements IProvider<DatabaseConnection> {
  value(container: Container): DatabaseConnection {
    const config = container.get<Config>({ key: 'config.database' });
    return new DatabaseConnection(config);
  }
}

container.bind<DatabaseConnection>({ key: 'db.connection' })
  .toProvider(DatabaseConnectionProvider);
```

### Fluent Chaining

```typescript
container.bind<CacheService>({ key: 'services.CacheService' })
  .toClass(CacheService)
  .setScope(BindingScopes.SINGLETON)
  .setTags('infrastructure', 'cache');

// Query binding metadata
const binding = container.getBinding<CacheService>({ key: 'services.CacheService' });
binding.hasTag('infrastructure');  // true
binding.getTags();                 // ['services', 'infrastructure', 'cache']
binding.getScope();                // 'singleton'
```

> [!TIP]
> Namespace auto-tagging means `services.CacheService` automatically gets a `'services'` tag. You do not need to add it manually.

::: details Binding Methods Summary

| Method | Purpose |
|--------|---------|
| `toClass(cls)` | Container instantiates `cls` with DI |
| `toValue(val)` | Return `val` directly |
| `toProvider(fn \| cls)` | Factory function `(container) => T` or `IProvider<T>` class |
| `setScope(scope)` | `'singleton'` or `'transient'` (default) |
| `setTags(...tags)` | Add string tags (namespace auto-tagged from key) |
| `hasTag(tag)` | Check if binding has a specific tag |
| `getTags()` | Get all tags as `string[]` |
| `getScope()` | Get current scope |
| `getValue(container?)` | Resolve the bound value (respects scope caching) |
| `getBindingMeta({ type })` | Get raw resolver value, validated by type |
| `clearCache()` | Clear singleton cache for this binding |

:::

## Decorators

The `@inject` and `@injectable` decorators store metadata via `MetadataRegistry` using `reflect-metadata`. The container reads this metadata during instantiation.

### Constructor Injection

This is the recommended approach -- dependencies are explicit and available at instantiation.

```typescript
import { inject, injectable, BindingScopes } from '@venizia/ignis-inversion';

@injectable({ scope: BindingScopes.SINGLETON })
class UserService {
  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepo: UserRepository,

    @inject({ key: 'services.Logger', isOptional: true })
    private logger?: Logger,
  ) {}
}
```

### Property Injection

```typescript
import { inject, injectable } from '@venizia/ignis-inversion';

@injectable({})
class UserService {
  @inject({ key: 'repositories.UserRepository' })
  private userRepo: UserRepository;

  @inject({ key: 'services.Logger', isOptional: true })
  private logger?: Logger;
}
```

> [!WARNING]
> Property-injected classes must be instantiated through the container (`container.resolve()` or `container.instantiate()`). Using `new MyClass()` directly will leave `@inject` properties as `undefined`.

### @injectable Decorator

Marks a class with DI metadata (scope and tags). Used by the framework layer to configure bindings automatically.

```typescript
@injectable({
  scope: BindingScopes.SINGLETON,
  tags: { category: 'infrastructure' },
})
class CacheService {
  // ...
}
```

::: details @inject Full Signature
```typescript
inject(opts: {
  key: string | symbol;       // Binding key to resolve
  isOptional?: boolean;       // If true, returns undefined instead of throwing (default: false)
  registry?: MetadataRegistry; // Override the default singleton registry (advanced)
})
```
:::

::: details @injectable Full Signature
```typescript
injectable(
  metadata: {
    scope?: TBindingScope;           // 'singleton' | 'transient'
    tags?: Record<string, any>;      // Arbitrary tag metadata
  },
  registry?: MetadataRegistry,       // Override the default singleton registry (advanced)
)
```
:::

## Scopes and Lifecycle

### Binding Scopes

| Scope | Behavior |
|-------|----------|
| `BindingScopes.TRANSIENT` | New instance each resolution (default) |
| `BindingScopes.SINGLETON` | Cached after first resolution, reused thereafter |

```typescript
import { BindingScopes } from '@venizia/ignis-inversion';

// Singleton -- one instance shared across all resolutions
container.bind({ key: 'services.CacheService' })
  .toClass(CacheService)
  .setScope(BindingScopes.SINGLETON);

// Transient (default) -- new instance every time
container.bind({ key: 'services.RequestHandler' })
  .toClass(RequestHandler)
  .setScope(BindingScopes.TRANSIENT);
```

> [!IMPORTANT]
> Singleton caching is per-`Binding` object, not per-Container. If you hold a direct reference to a `Binding` (via `getBinding()`), its cache is independent of `container.clear()`.

### Cache Management

```typescript
// Clear all singleton caches (bindings stay registered)
container.clear();

// Remove all bindings entirely (full reset)
container.reset();

// Clear cache for a single binding
const binding = container.getBinding({ key: 'services.CacheService' });
binding.clearCache();
```

## MetadataRegistry

The `MetadataRegistry` is a singleton that stores all decorator metadata using `reflect-metadata`. Both `@inject` and `@injectable` delegate to it. You typically will not interact with the registry directly.

```typescript
import { MetadataKeys } from '@venizia/ignis-inversion';

MetadataKeys.PROPERTIES  // Symbol.for('ignis:properties')
MetadataKeys.INJECT      // Symbol.for('ignis:inject')
MetadataKeys.INJECTABLE  // Symbol.for('ignis:injectable')
```

::: details MetadataRegistry API

| Method | Purpose |
|--------|---------|
| `define({ target, key, value })` | Store arbitrary metadata on a target |
| `get({ target, key })` | Retrieve metadata by key |
| `has({ target, key })` | Check if metadata exists |
| `delete({ target, key })` | Remove metadata by key |
| `getKeys({ target })` | List all metadata keys on a target |
| `clearMetadata({ target })` | Remove all metadata from a target |
| `setInjectMetadata({ target, index, metadata })` | Store constructor `@inject` metadata |
| `getInjectMetadata({ target })` | Get all constructor injection metadata |
| `setPropertyMetadata({ target, propertyName, metadata })` | Store property `@inject` metadata |
| `getPropertiesMetadata({ target })` | Get all property injection metadata |
| `getPropertyMetadata({ target, propertyName })` | Get single property injection metadata |
| `setInjectableMetadata({ target, metadata })` | Store `@injectable` metadata |
| `getInjectableMetadata({ target })` | Get `@injectable` metadata |
| `getMethodNames({ target })` | List method names on a class prototype |

:::

## Utilities

### BindingKeys

Utility for building namespaced binding keys:

```typescript
import { BindingKeys } from '@venizia/ignis-inversion';

BindingKeys.build({ namespace: 'services', key: 'UserService' });
// => 'services.UserService'
```

### ApplicationError and getError

Error factory used internally and available for consumers:

```typescript
import { ApplicationError, getError, ErrorSchema } from '@venizia/ignis-inversion';

// Factory function
throw getError({ message: 'Something failed', statusCode: 500, messageCode: 'ERR_INTERNAL' });

// Direct construction
throw new ApplicationError({ message: 'Not found', statusCode: 404 });

// Zod schema for validation
ErrorSchema.parse({ message: 'test', statusCode: 400 });
```

### Logger

Lightweight console logger (debug output requires `process.env.DEBUG`):

```typescript
import { Logger } from '@venizia/ignis-inversion';

Logger.info('Server started on port %d', 3000);
Logger.warn('Deprecation warning');
Logger.error('Connection failed: %s', err.message);
Logger.debug('Resolved binding: %s', key); // Only prints when DEBUG is set
```

::: details Exported Types
```typescript
// Nullable wrapper
type TNullable<T> = T | undefined | null;

// Async-or-sync value
type ValueOrPromise<T> = T | Promise<T>;

// Object values union
type ValueOf<T> = T[keyof T];

// Class/constructor types
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
type TClass<T> = TConstructor<T> & { [property: string]: any };

// Extract string|number const values from a class
type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;

// Binding scope type
type TBindingScope = TConstValue<typeof BindingScopes>; // 'singleton' | 'transient'

// Binding value type
type TBindingValueType = TConstValue<typeof BindingValueTypes>; // 'class' | 'value' | 'provider'

// Provider interface for class-based providers
interface IProvider<T> {
  value(container: Container): T;
}

// Injection metadata interfaces
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

interface IInjectableMetadata {
  scope?: TBindingScope;
  tags?: Record<string, any>;
}

// Type guards
function isClass<T>(target: any): target is TClass<T>;
function isClassProvider<T>(target: any): target is TClass<IProvider<T>>;
function isClassConstructor(fn: Function): boolean;
```
:::
