# Inversion (DI)

Standalone IoC container with decorator-based injection, fluent binding API, and singleton/transient scoping -- the foundation layer for all Ignis packages.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-inversion` |
| **Classes** | `Container`, `Binding`, `MetadataRegistry` |
| **Decorators** | `@inject`, `@injectable` |
| **Runtimes** | Both (Bun and Node.js) |

#### Import Paths

```typescript
import {
  Container,
  Binding,
  MetadataRegistry,
  metadataRegistry,
  inject,
  injectable,
  BindingKeys,
  BindingScopes,
  BindingValueTypes,
  MetadataKeys,
  BaseHelper,
  ApplicationError,
  getError,
  ErrorSchema,
  Logger,
} from '@venizia/ignis-inversion';

import type {
  TNullable,
  ValueOrPromise,
  ValueOf,
  TClass,
  TConstructor,
  TAbstractConstructor,
  TConstValue,
  TBindingScope,
  TBindingValueType,
  IProvider,
  IInjectMetadata,
  IPropertyMetadata,
  IInjectableMetadata,
} from '@venizia/ignis-inversion';
```

> [!NOTE]
> The framework package `@venizia/ignis` re-exports everything from `@venizia/ignis-inversion` and adds higher-level helpers (`app.controller()`, `app.service()`, etc.).

## Creating an Instance

`Container` extends `BaseHelper`, providing a named scope for debugging context.

```typescript
import { Container } from '@venizia/ignis-inversion';

const container = new Container({ scope: 'MyApp' });
```

The `scope` parameter is optional and defaults to `'Container'`. It is used for logging and error context only.

Basic binding example:

```typescript
import { Container, BindingScopes } from '@venizia/ignis-inversion';

const container = new Container({ scope: 'MyApp' });

// Bind a class (container instantiates with DI)
container.bind<UserService>({ key: 'services.UserService' })
  .toClass(UserService)
  .setScope(BindingScopes.SINGLETON);

// Resolve the dependency
const userService = container.get<UserService>({ key: 'services.UserService' });
```

## Usage

### Binding Values

Three resolver strategies are available via the fluent `Binding` API:

```typescript
// Class -- container instantiates with DI
container.bind<UserService>({ key: 'services.UserService' })
  .toClass(UserService);

// Value -- return directly
container.bind<string>({ key: 'APP_NAME' })
  .toValue('MyApp');

// Provider -- factory function
container.bind<DatabaseConnection>({ key: 'db.connection' })
  .toProvider((container) => {
    const config = container.get<Config>({ key: 'config.database' });
    return new DatabaseConnection(config);
  });
```

#### Class-based Provider

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

When `toProvider` receives a class with a `value()` method on its prototype, the container instantiates the class (with full DI support) and then calls `value(container)` to produce the final value.

#### Fluent Chaining

All `Binding` setter methods return `this` for chaining:

```typescript
container.bind<CacheService>({ key: 'services.CacheService' })
  .toClass(CacheService)
  .setScope(BindingScopes.SINGLETON)
  .setTags('infrastructure', 'cache');
```

#### Static Factory

`Binding` also exposes a static factory for creating bindings outside a container:

```typescript
import { Binding, BindingScopes } from '@venizia/ignis-inversion';

const binding = Binding.bind<IHealthCheckOptions>({
  key: 'options.healthCheck',
}).toValue({ restOptions: { path: '/health' } });

// Register it on a container later
container.set({ binding });
```

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

The container reads `@inject` metadata during `instantiate()`, sorts by parameter index, resolves each dependency, and passes them as constructor arguments.

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

The instantiation algorithm is two-phase:
1. **Constructor injection** -- reads `@inject` metadata on the constructor, sorts by parameter index, resolves from container
2. **Property injection** -- reads property metadata, resolves and assigns each dependency to the instance

### Scopes (Singleton / Transient)

| Scope | Constant | Behavior |
|-------|----------|----------|
| Transient | `BindingScopes.TRANSIENT` | New instance every resolution (default) |
| Singleton | `BindingScopes.SINGLETON` | Cached after first resolution, reused thereafter |

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
> Singleton caching is per-`Binding` object, not per-Container. If you rebind the same key, the old `Binding` retains its cache independently.

#### Cache Management

```typescript
// Clear all singleton caches (bindings stay registered)
container.clear();

// Remove all bindings entirely (full reset)
container.reset();

// Clear cache for a single binding
const binding = container.getBinding({ key: 'services.CacheService' });
binding?.clearCache();
```

### Namespaces and Tags

Bindings with namespaced keys (e.g., `services.UserService`) are automatically tagged with the namespace portion (`services`). You can also add custom tags manually.

```typescript
container.bind({ key: 'workers.EmailWorker' })
  .toClass(EmailWorker)
  .setTags('background', 'email');
// This binding now has tags: ['workers', 'background', 'email']

// Find all bindings tagged 'services'
const serviceBindings = container.findByTag({ tag: 'services' });

// Exclude specific keys
const filtered = container.findByTag({
  tag: 'services',
  exclude: ['services.InternalService'],
});
```

#### Building Namespaced Keys

```typescript
import { BindingKeys } from '@venizia/ignis-inversion';

BindingKeys.build({ namespace: 'services', key: 'UserService' });
// => 'services.UserService'

// The key parameter is required; an empty key throws an error
BindingKeys.build({ namespace: '', key: 'UserService' });
// => 'UserService'
```

### Key Formats

The `get`, `getBinding`, and `gets` methods accept three key formats:

```typescript
// String key
container.get<UserService>({ key: 'services.UserService' });

// Symbol key
container.get<UserService>({ key: Symbol.for('services.UserService') });

// Namespaced object (built via BindingKeys.build internally)
container.get<UserService>({ key: { namespace: 'services', key: 'UserService' } });
```

### Optional Dependencies

```typescript
// Returns undefined instead of throwing if not bound
const maybeSvc = container.get<MyService>({
  key: 'services.Optional',
  isOptional: true,
});

// In decorators
@inject({ key: 'services.Logger', isOptional: true })
private logger?: Logger;
```

### Resolving Multiple Dependencies

```typescript
const [svcA, svcB] = container.gets<[ServiceA, ServiceB]>({
  bindings: [
    { key: 'services.ServiceA' },
    { key: 'services.ServiceB', isOptional: true },
  ],
});
```

> [!NOTE]
> `gets()` internally calls `get()` with `isOptional: true` for each entry. Unresolved bindings return `undefined` rather than throwing.

### Instantiate Without Binding

```typescript
// Create an instance with full DI resolution but don't register it
const instance = container.resolve<MyClass>(MyClass);
// or equivalently:
const instance2 = container.instantiate<MyClass>(MyClass);
```

Both methods perform the same two-phase instantiation (constructor injection, then property injection). `resolve()` is an alias for `instantiate()`.

### Checking and Removing Bindings

```typescript
// Check if a key is registered
container.isBound({ key: 'services.UserService' }); // true or false

// Remove a binding
container.unbind({ key: 'services.UserService' }); // returns true if removed, false if not found
```

### MetadataRegistry

The `MetadataRegistry` is a singleton that stores all decorator metadata using `reflect-metadata`. Both `@inject` and `@injectable` delegate to it. You typically will not interact with the registry directly.

```typescript
import { MetadataKeys, metadataRegistry } from '@venizia/ignis-inversion';

// Well-known metadata keys
MetadataKeys.PROPERTIES  // Symbol.for('ignis:properties')
MetadataKeys.INJECT      // Symbol.for('ignis:inject')
MetadataKeys.INJECTABLE  // Symbol.for('ignis:injectable')

// Access via container
const registry = container.getMetadataRegistry();
```

The registry also supports generic metadata operations for storing arbitrary metadata on any object:

```typescript
metadataRegistry.define({ target: myObj, key: 'custom:flag', value: true });
metadataRegistry.get({ target: myObj, key: 'custom:flag' }); // true
metadataRegistry.has({ target: myObj, key: 'custom:flag' }); // true
metadataRegistry.delete({ target: myObj, key: 'custom:flag' }); // true
```

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

### Utilities

#### ApplicationError and getError

Error factory used internally and available for consumers:

```typescript
import { ApplicationError, getError, ErrorSchema } from '@venizia/ignis-inversion';

// Factory function
throw getError({ message: 'Something failed', statusCode: 500, messageCode: 'ERR_INTERNAL' });

// Direct construction (defaults to statusCode 400)
throw new ApplicationError({ message: 'Not found', statusCode: 404 });

// Zod schema for validation
ErrorSchema.parse({ message: 'test', statusCode: 400 });
```

#### Logger

Lightweight console logger (debug output requires `process.env.DEBUG`):

```typescript
import { Logger } from '@venizia/ignis-inversion';

Logger.info('Server started on port %d', 3000);
Logger.warn('Deprecation warning');
Logger.error('Connection failed: %s', err.message);
Logger.debug('Resolved binding: %s', key); // Only prints when DEBUG env var is set
```

## API Summary

### Container

| Method | Signature | Description |
|--------|-----------|-------------|
| `bind` | `bind<T>(opts: { key: string \| symbol }): Binding<T>` | Create and register a new binding |
| `get` | `get<T>(opts: { key: string \| symbol \| { namespace, key }, isOptional?: boolean }): T` | Resolve a dependency by key; throws if not found and `isOptional` is `false` |
| `gets` | `gets<T>(opts: { bindings: Array<{ key, isOptional? }> }): T[]` | Resolve multiple dependencies at once (all treated as optional) |
| `getBinding` | `getBinding<T>(opts: { key: string \| symbol \| { namespace, key } }): Binding<T> \| undefined` | Retrieve the raw `Binding` without resolving |
| `set` | `set<T>(opts: { binding: Binding<T> }): void` | Register an externally-created binding |
| `isBound` | `isBound(opts: { key: string \| symbol }): boolean` | Check if a key is registered |
| `unbind` | `unbind(opts: { key: string \| symbol }): boolean` | Remove a binding; returns `true` if removed |
| `resolve` | `resolve<T>(cls: TClass<T>): T` | Alias for `instantiate` |
| `instantiate` | `instantiate<T>(cls: TClass<T>): T` | Create instance with full DI (constructor + property injection) |
| `findByTag` | `findByTag<T>(opts: { tag: string, exclude?: string[] \| Set<string> }): Binding<T>[]` | Find all bindings matching a tag, optionally excluding keys |
| `clear` | `clear(): void` | Clear all singleton caches (bindings remain) |
| `reset` | `reset(): void` | Remove all bindings entirely |
| `getMetadataRegistry` | `getMetadataRegistry(): MetadataRegistry` | Access the shared MetadataRegistry singleton |

### Binding

| Method | Signature | Description |
|--------|-----------|-------------|
| `toClass` | `toClass(value: TClass<T>): this` | Container instantiates the class with DI |
| `toValue` | `toValue(value: T): this` | Return value directly |
| `toProvider` | `toProvider(value: ((container) => T) \| TClass<IProvider<T>>): this` | Factory function or `IProvider` class |
| `setScope` | `setScope(scope: TBindingScope): this` | Set to `'singleton'` or `'transient'` (default) |
| `setTags` | `setTags(...tags: string[]): this` | Add string tags (namespace auto-tagged from key) |
| `hasTag` | `hasTag(tag: string): boolean` | Check if binding has a specific tag |
| `getTags` | `getTags(): string[]` | Get all tags as array |
| `getScope` | `getScope(): TBindingScope` | Get current scope |
| `getValue` | `getValue(container?: Container): T` | Resolve the bound value (respects scope caching) |
| `getBindingMeta` | `getBindingMeta(opts: { type: TBindingValueType }): any` | Get raw resolver value; throws if type does not match |
| `clearCache` | `clearCache(): void` | Clear singleton cache for this binding |
| `bind` (static) | `static bind<T>(opts: { key: string }): Binding<T>` | Static factory to create a Binding outside a container |

### MetadataRegistry

| Method | Signature | Description |
|--------|-----------|-------------|
| `define` | `define<Target, Value>(opts: { target: Target, key: string \| symbol, value: Value }): void` | Store arbitrary metadata on a target |
| `get` | `get<Target, Value>(opts: { target: Target, key: string \| symbol }): Value \| undefined` | Retrieve metadata by key |
| `has` | `has<Target>(opts: { target: Target, key: string \| symbol }): boolean` | Check if metadata exists |
| `delete` | `delete<Target>(opts: { target: Target, key: string \| symbol }): boolean` | Remove metadata by key |
| `getKeys` | `getKeys<Target>(opts: { target: Target }): (string \| symbol)[]` | List all metadata keys on a target |
| `getMethodNames` | `getMethodNames<T>(opts: { target: TClass<T> }): string[]` | List non-constructor method names on a class prototype |
| `clearMetadata` | `clearMetadata<T>(opts: { target: T }): void` | Remove all metadata from a target |
| `setInjectMetadata` | `setInjectMetadata<T>(opts: { target: T, index: number, metadata: IInjectMetadata }): void` | Store constructor `@inject` metadata at parameter index |
| `getInjectMetadata` | `getInjectMetadata<T>(opts: { target: T }): IInjectMetadata[] \| undefined` | Get all constructor injection metadata |
| `setPropertyMetadata` | `setPropertyMetadata<T>(opts: { target: T, propertyName: string \| symbol, metadata: IPropertyMetadata }): void` | Store property `@inject` metadata |
| `getPropertiesMetadata` | `getPropertiesMetadata<T>(opts: { target: T }): Map<string \| symbol, IPropertyMetadata> \| undefined` | Get all property injection metadata |
| `getPropertyMetadata` | `getPropertyMetadata<T>(opts: { target: T, propertyName: string \| symbol }): IPropertyMetadata \| undefined` | Get single property injection metadata |
| `setInjectableMetadata` | `setInjectableMetadata<T>(opts: { target: T, metadata: IInjectableMetadata }): void` | Store `@injectable` metadata |
| `getInjectableMetadata` | `getInjectableMetadata<T>(opts: { target: T }): IInjectableMetadata \| undefined` | Get `@injectable` metadata |

### Decorators

| Decorator | Signature | Description |
|-----------|-----------|-------------|
| `@inject` | `inject(opts: { key: string \| symbol, isOptional?: boolean, registry?: MetadataRegistry })` | Marks a constructor parameter or property for dependency injection |
| `@injectable` | `injectable(metadata: { scope?: TBindingScope, tags?: Record<string, any> }, registry?: MetadataRegistry)` | Marks a class with DI metadata (scope and tags) |

### Constants

| Constant | Values | Description |
|----------|--------|-------------|
| `BindingScopes.SINGLETON` | `'singleton'` | Cached after first resolution |
| `BindingScopes.TRANSIENT` | `'transient'` | New instance each resolution |
| `BindingValueTypes.CLASS` | `'class'` | Container instantiates with DI |
| `BindingValueTypes.VALUE` | `'value'` | Direct value return |
| `BindingValueTypes.PROVIDER` | `'provider'` | Factory function or IProvider class |
| `MetadataKeys.PROPERTIES` | `Symbol.for('ignis:properties')` | Property injection metadata key |
| `MetadataKeys.INJECT` | `Symbol.for('ignis:inject')` | Constructor injection metadata key |
| `MetadataKeys.INJECTABLE` | `Symbol.for('ignis:injectable')` | Injectable class metadata key |

### Exported Types

```typescript
type TNullable<T> = T | undefined | null;
type ValueOrPromise<T> = T | Promise<T>;
type ValueOf<T> = T[keyof T];
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
type TClass<T> = TConstructor<T> & { [property: string]: any };
type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
type TBindingScope = 'singleton' | 'transient';
type TBindingValueType = 'class' | 'value' | 'provider';

interface IProvider<T> {
  value(container: Container): T;
}

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

## Troubleshooting

### "Binding key: X is not bounded in context!"

**Cause:** The dependency was never registered with the container, or the key string does not match exactly.

**Fix:**
1. Verify the binding exists: `container.isBound({ key: 'services.UserService' })`.
2. Check for typos in the key passed to `@inject({ key: '...' })` vs the key used in `container.bind({ key: '...' })`.
3. If the dependency is optional, use `@inject({ key: '...', isOptional: true })` or `container.get({ key: '...', isOptional: true })`.

### "[getValue] Invalid context/container to instantiate class"

**Cause:** A `Binding` configured with `toClass()` was resolved without a `Container` reference. This happens when calling `binding.getValue()` directly without passing a container.

**Fix:** Always resolve class bindings through the container via `container.get({ key })` rather than calling `binding.getValue()` without arguments.

### "[getValue] Invalid context/container to get provider value"

**Cause:** A `Binding` configured with `toProvider()` was resolved without a `Container` reference.

**Fix:** Same as above -- resolve provider bindings through the container via `container.get({ key })`.

### "[getBindingMeta] Invalid resolver type"

**Cause:** Called `getBindingMeta({ type })` with a type that does not match the binding's actual resolver type (e.g., asking for `'class'` on a value binding).

**Fix:** Ensure the `type` parameter matches the binding's resolver. Check what was used: `toClass()` = `'class'`, `toValue()` = `'value'`, `toProvider()` = `'provider'`.

### "[getBinding] Invalid binding key type"

**Cause:** The key passed to `getBinding()` is not a `string`, `symbol`, or `{ namespace, key }` object.

**Fix:** Use one of the three supported key formats: a string, a symbol, or an object with `namespace` and `key` properties.

### "[BindingKeys][build] Invalid key to build"

**Cause:** Called `BindingKeys.build()` with an empty `key` value.

**Fix:** Provide a non-empty `key` string: `BindingKeys.build({ namespace: 'services', key: 'UserService' })`.

### "@inject decorator can only be used on class properties or constructor parameters"

**Cause:** The `@inject` decorator was applied to something other than a class property or constructor parameter.

**Fix:** Only use `@inject` on constructor parameters or class properties.

### "Property injection returns undefined"

**Cause:** The class was instantiated with `new MyClass()` directly instead of going through the container.

**Fix:** Always use `container.resolve(MyClass)` or `container.instantiate(MyClass)` to create instances. Only the container reads `@inject` metadata and populates injected properties.

### "getInjectMetadata returns undefined"

**Cause:** `reflect-metadata` was not imported before decorators were evaluated, or `experimentalDecorators` / `emitDecoratorMetadata` are not enabled in `tsconfig.json`.

**Fix:**
1. Ensure `import 'reflect-metadata'` is at the top of your entry point (or rely on `@venizia/ignis-inversion` which imports it automatically).
2. Verify your `tsconfig.json` includes:
   ```json
   {
     "compilerOptions": {
       "experimentalDecorators": true,
       "emitDecoratorMetadata": true
     }
   }
   ```

### "Singleton returns stale instance after rebinding"

**Cause:** Singleton caching is per-`Binding` object. If you hold a direct reference to an old `Binding` (e.g., from `getBinding()`), its cache is independent of the container.

**Fix:**
1. Always resolve via `container.get()` rather than caching `Binding` references.
2. Call `container.clear()` to clear all singleton caches without removing bindings.
3. Call `container.reset()` to remove all bindings entirely.

## See Also

- **Guides:**
  - [Dependency Injection Guide](/guides/core-concepts/dependency-injection) - DI fundamentals
  - [Application](/guides/core-concepts/application/) - Application extends Container

- **Other Helpers:**
  - [Helpers Index](../index) - All available helpers

- **References:**
  - [Dependency Injection API](/references/base/dependency-injection) - Complete DI reference

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - DI patterns
