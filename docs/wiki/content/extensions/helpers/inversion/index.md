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
import { Container, inject, BindingScopes, BindingKeys } from '@venizia/ignis-inversion';

class UserService {
  constructor(@inject({ key: BindingKeys.build<string>({ key: 'config.appName' }) }) private appName: string) {}
}

const container = new Container({ scope: 'MyApp' });

container.bind({ key: BindingKeys.build<string>({ key: 'config.appName' }) }).toValue('MyApp');
container.bind({ key: BindingKeys.build<UserService>({ key: 'services.UserService' }) })
  .toClass(UserService)
  .setScope(BindingScopes.SINGLETON);

const userService = container.get({ key: BindingKeys.build<UserService>({ key: 'services.UserService' }) });
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
- **Keys** are made by `BindingKeys.build<T>({ namespace?, key })`, which joins namespace and key into a dotted string and names the type of the value bound under it (see [Typed keys](#typed-keys)). `bind`, `get`, `gets`, `getBinding`, `isBound`, `unbind` and `@inject({ key })` take only a key made by `build`: a raw string, a template literal, a symbol or a `{ namespace, key }` object does not compile.
- **`@inject` names a dependency by key or by class.** `@inject({ key: 'repositories.UserRepository' })` and `@inject({ target: UserRepository })` both work. They are the two arms of a union, so you pass one or the other, never both.

**Scopes**

| Scope | Constant | Behavior |
|-------|----------|----------|
| Transient | `BindingScopes.TRANSIENT` | New instance on every resolution (default) |
| Singleton | `BindingScopes.SINGLETON` | Cached on the `Binding` after first resolution |

The cache holds any value, `null` and `undefined` included. A rejected promise stays cached until `clear()`.

> [!IMPORTANT]
> Singleton caching lives on the `Binding` object, not the container. Rebinding a key creates a fresh `Binding` with its own cache. If you hold onto an old `Binding` reference, its cache stays independent of `container.clear()`/`reset()` calls made against the new `Binding` registered under the same key.

Property-injected classes only get their `@inject` properties populated when built through the container - `container.resolve()` or `instantiate()`. A plain `new MyClass()` leaves them `undefined`.

The [Full reference](/extensions/helpers/inversion/reference) covers `MetadataRegistry`, `gets()`, key formats, `IProvider`, and every error message in detail.

## Common tasks

### Bind a class with constructor injection

```typescript
class OrderService {
  constructor(
    @inject({ key: BindingKeys.build<OrderRepository>({ key: 'repositories.OrderRepository' }) }) private orderRepository: OrderRepository,
    @inject({ key: BindingKeys.build<Logger>({ key: 'services.Logger' }), isOptional: true }) private logger?: Logger,
  ) {}
}
```

### Bind a class by naming the class

Pass `target` instead of `key`. The container reads the key off the class at resolve time, from the key its registration recorded. A key rename then never reaches this file.

```typescript
class OrderService {
  constructor(
    @inject({ target: OrderRepository }) private orderRepository: OrderRepository,
  ) {}
}
```

The class has to be a registered artifact. If it is not, the container throws and names it. A circular import that leaves the class reference `undefined` is caught earlier still, at decoration time.

### Bind a value or a provider

```typescript
container.bind({ key: BindingKeys.build<string>({ key: 'APP_NAME' }) }).toValue('MyApp');

container.bind({ key: BindingKeys.build<DatabaseConnection>({ key: 'db.connection' }) })
  .toProvider((container) => {
    const config = container.get({ key: BindingKeys.build<Config>({ key: 'config.database' }) });
    return new DatabaseConnection(config);
  });
```

### Set the scope

```typescript
container.bind({ key: BindingKeys.build<CacheService>({ key: 'services.CacheService' }) })
  .toClass(CacheService)
  .setScope(BindingScopes.SINGLETON); // default is TRANSIENT if omitted
```

### Inject into a property instead of the constructor

```typescript
class UserService {
  @inject({ key: BindingKeys.build<UserRepository>({ key: 'repositories.UserRepository' }) })
  private userRepository: UserRepository;
}
```

### Resolve an optional dependency

`isOptional: true` returns `undefined` instead of throwing when the key is unbound - on the constructor, on a property, and via `container.get()`. With the `{ target }` form, an optional class that was never registered also resolves to `undefined`.

A dependency cycle throws with its path - `Circular dependency | services.A -> services.B -> services.A` - instead of overflowing the stack. A cycle that passes through an `await` is not detected. `gets()` resolves several keys at once, always treating each as optional.

```typescript
const maybeService = container.get({ key: BindingKeys.build<MyService>({ key: 'services.Optional' }), isOptional: true });
```

### Typed keys

A key can name the type of the value bound under it. `get`, `bind`, `getBinding` and `gets` read it from the key, so there is no generic to repeat and a wrong value does not compile.

```typescript
import { BindingKeys } from '@venizia/ignis-inversion';

const MAILER = BindingKeys.build<IMailer>({ namespace: 'services', key: 'Mailer' });

container.bind({ key: MAILER }).toValue(mailer); // checked against IMailer
const resolved = container.get({ key: MAILER }); // IMailer, no generic
```

`build` needs its type argument: `build<unknown>` is the explicit form for a key with no common value type (one built from a runtime name). A generic you pass to `get` or `bind` is checked against the key: a type that is a subtype or a supertype of the key's type is accepted, an unrelated one (`get<number>({ key: MAILER })`) does not compile. The type exists at compile time only; a key is the plain string at run time.

In generic code, where `T` is not known yet, build the key for `unknown` and return it as `TBindingKey<T>`: `BindingKeys.build<T>` with a type parameter does not compile, and the brand is bivariant so the return is accepted.

A key that is not one typed key - a union such as `cond ? MAILER : LABEL`, or a variable typed `TBindingKey` - resolves to `unknown`. It takes no generic: `get<IMailer>({ key })` on it does not compile. Narrow the key first, or cast the result.

`TBindingKeyValue<typeof MAILER>` names the type, for an annotation that should follow the key. Use it on an `@inject` parameter, because nothing else checks that one:

```typescript
class Notifier {
  constructor(
    @inject({ key: MAILER })
    private mailer: TBindingKeyValue<typeof MAILER>,
  ) {}
}
```

> [!WARNING]
> `@inject` is not checked against the type it decorates. A parameter decorator is handed no parameter type, and checking a property would reject every `protected` or `private` field. Resolve with `container.get({ key })` where the type matters, and annotate injected parameters with `TBindingKeyValue`.

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
