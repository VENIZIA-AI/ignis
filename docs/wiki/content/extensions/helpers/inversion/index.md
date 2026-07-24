---
title: Inversion (DI)
description: Standalone IoC container with decorator-based injection and a fluent binding API
difficulty: intermediate
---

# Inversion (DI)

`@venizia/ignis-inversion` is the standalone IoC container - decorator-based injection, a fluent binding API, and singleton/transient scoping - that every other IGNIS package builds on.

## In one example

The smallest real use: bind a class with constructor injection, then resolve it through the container.

```typescript
import { Container, inject, BindingScopes } from '@venizia/ignis-inversion';

class UserService {
  constructor(@inject({ key: 'config.appName' }) private appName: string) {}
}

const container = new Container({ scope: 'MyApp' });

container.bind<string>({ key: 'config.appName' }).toValue('MyApp');
container.bind<UserService>({ key: 'services.UserService' })
  .toClass(UserService)
  .setScope(BindingScopes.SINGLETON);

const userService = container.get<UserService>({ key: 'services.UserService' });
```

A class needs no decorator to be bindable. The binding is always created explicitly with `container.bind()`, and its scope is set via `setScope()`.

The framework layer (`@venizia/ignis`) creates these bindings for you - for controllers, services, and repositories - via `app.controller()` / `app.service()` / `@repository`.

## How it works

- **A binding resolves one of three ways.** All `Binding` setters return `this`, so calls chain.

  | Resolver | Behavior |
  |---|---|
  | `toClass` | Container instantiates the class with full DI |
  | `toValue` | Returns the value as-is |
  | `toProvider` | Calls a factory function, or an `IProvider` class |

- **Instantiation is two-phase.** `container.resolve(cls)` and `container.instantiate(cls)` are the same method - `resolve` is an alias.

  | Phase | What happens |
  |---|---|
  | 1. Constructor injection | Reads `@inject` metadata by parameter index, passes resolved values as constructor args |
  | 2. Property injection | Assigns each `@inject`-decorated property on the built instance |

- **Every constructor parameter must carry `@inject`.** The metadata array is index-keyed - an undecorated parameter leaves a hole the container has no way to fill. `instantiate()` refuses the class by name and parameter index rather than passing `undefined`.
- **Namespaces auto-tag bindings.** A key like `services.UserService` tags the binding `services` automatically. `setTags()` adds more. `findByTag()` queries by tag, with an `exclude` list.
- **Keys** can be a `string`, a `symbol`, or `{ namespace, key }` (built into a dotted string via `BindingKeys.build`).

**Scopes**

| Scope | Constant | Behavior |
|-------|----------|----------|
| Transient | `BindingScopes.TRANSIENT` | New instance on every resolution (default) |
| Singleton | `BindingScopes.SINGLETON` | Cached on the `Binding` after first resolution |

> [!IMPORTANT]
> Singleton caching lives on the `Binding` object, not the container. Rebinding a key creates a fresh `Binding` with its own cache. If you hold onto an old `Binding` reference, its cache stays independent of `container.clear()`/`reset()` calls made against the new `Binding` registered under the same key.

Property-injected classes only get their `@inject` properties populated when built through the container - `container.resolve()` or `instantiate()`. A plain `new MyClass()` leaves them `undefined`.

The [Full reference](/extensions/helpers/inversion/reference) covers `MetadataRegistry`, `gets()`, key formats, `IProvider`, and every error message in detail.

## Common tasks

### Bind a class with constructor injection

```typescript
class OrderService {
  constructor(
    @inject({ key: 'repositories.OrderRepository' }) private orderRepository: OrderRepository,
    @inject({ key: 'services.Logger', isOptional: true }) private logger?: Logger,
  ) {}
}
```

### Bind a value or a provider

```typescript
container.bind<string>({ key: 'APP_NAME' }).toValue('MyApp');

container.bind<DatabaseConnection>({ key: 'db.connection' })
  .toProvider((container) => {
    const config = container.get<Config>({ key: 'config.database' });
    return new DatabaseConnection(config);
  });
```

### Set the scope

```typescript
container.bind({ key: 'services.CacheService' })
  .toClass(CacheService)
  .setScope(BindingScopes.SINGLETON); // default is TRANSIENT if omitted
```

### Inject into a property instead of the constructor

```typescript
class UserService {
  @inject({ key: 'repositories.UserRepository' })
  private userRepository: UserRepository;
}
```

### Resolve an optional dependency

`isOptional: true` returns `undefined` instead of throwing when the key is unbound - on the constructor and via `container.get()`. `gets()` resolves several keys at once, always treating each as optional.

```typescript
const maybeService = container.get<MyService>({ key: 'services.Optional', isOptional: true });
```

### Instantiate a class without registering it

```typescript
const instance = container.resolve<MyClass>(MyClass); // full DI, not bound to a key
```

## See also

- [Full reference](/extensions/helpers/inversion/reference) - every method, `MetadataRegistry`, error message, and edge case
- [Dependency Injection Guide](/guides/core-concepts/dependency-injection) - DI fundamentals in the framework layer
- [Application](/guides/core-concepts/application/) - `Application` extends `Container`
- [Dependency Injection API](/references/base/dependency-injection) - the framework-layer DI reference
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Architectural Patterns](/best-practices/architectural-patterns) - DI patterns

**Files:**

- [`packages/inversion/src/modules/container/container.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/container.ts) - `Container`, two-phase `instantiate()`
- [`packages/inversion/src/modules/container/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/base.ts) - `BaseContainer`, binding storage
- [`packages/inversion/src/modules/binding/binding.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/binding/binding.ts) - `Binding`
- [`packages/inversion/src/modules/metadata/injectors.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/metadata/injectors.ts) - `@inject`
- [`packages/inversion/src/modules/registry/registry.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/registry/registry.ts) - `MetadataRegistry`
