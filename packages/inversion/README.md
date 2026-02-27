<div align="center">

# :fire: IGNIS - @venizia/ignis-inversion

**Standalone, lightweight DI/IoC container for TypeScript**

[![npm](https://img.shields.io/npm/v/@venizia/ignis-inversion.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-inversion)
[![License](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A ~350-line Dependency Injection & Inversion of Control (IoC) container featuring decorator-based constructor and property injection, fluent Binding API, singleton/transient scoping, namespace auto-tagging, Provider pattern, and tag-based discovery. Part of the [Ignis Framework](https://github.com/VENIZIA-AI/ignis).

[Installation](#installation) &#8226; [Quick Start](#quick-start) &#8226; [API Reference](#container) &#8226; [Documentation](https://venizia-ai.github.io/ignis)

</div>

## Highlights

| | Feature | |
| :---: | :--- | :--- |
| **1** | **~350 Lines of Core** | Full IoC container with zero bloat |
| **2** | **Decorator-Based DI** | `@inject` for constructor and property injection |
| **3** | **Fluent Binding API** | Chain `.toClass()`, `.toValue()`, `.toProvider()`, `.setScope()` |
| **4** | **Namespace Auto-Tagging** | `"services.UserService"` auto-tags with `"services"` |
| **5** | **Zero Framework Lock-in** | Works with any TypeScript project |

---

## Philosophy

Ignis Inversion takes the best ideas from **LoopBack 4**'s IoC system -- decorator-based injection, fluent binding configuration, namespace-driven organization -- and strips them down to ~350 lines of focused, zero-overhead container logic. No complex module system, no provider hierarchies, no framework lock-in. Just a fast, type-safe container that works with any TypeScript project.

**Why this exists:**

| Library | Limitation |
|---------|------------|
| **LoopBack 4** | Had the right DI architecture but came bundled with an entire framework (now effectively abandoned) |
| **NestJS** | Modules add ceremony and indirection when all you need is straightforward DI |
| **InversifyJS** | Powerful but heavy for projects that need a simple, fast container |
| **tsyringe** | Minimal but lacks fluent configuration, tagging, and property injection |

Ignis Inversion gives you **constructor injection, property injection, singleton/transient scoping, tag-based discovery, and a provider pattern** -- all in a single dependency with no runtime overhead.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Container](#container)
  - [Binding](#binding)
  - [MetadataRegistry](#metadataregistry)
  - [Decorators](#decorators)
  - [Binding Keys](#binding-keys)
  - [BaseHelper](#basehelper)
- [Advanced Usage](#advanced-usage)
  - [Constructor Injection](#constructor-injection)
  - [Property Injection](#property-injection)
  - [Provider Pattern](#provider-pattern)
  - [Optional Dependencies](#optional-dependencies)
  - [Singleton vs Transient Scoping](#singleton-vs-transient-scoping)
  - [Tag-Based Discovery](#tag-based-discovery)
  - [Type Guards and Utilities](#type-guards-and-utilities)
- [Container Lifecycle](#container-lifecycle)
  - [Create, Bind, Resolve, Teardown](#create-bind-resolve-teardown)
  - [clear() vs reset()](#clear-vs-reset)
- [Binding Resolution Internals](#binding-resolution-internals)
  - [Two-Phase Instantiation Walkthrough](#two-phase-instantiation-walkthrough)
  - [Resolver Types and getValue() Flow](#resolver-types-and-getvalue-flow)
  - [Singleton Caching Internals](#singleton-caching-internals)
- [Provider Pattern Deep Dive](#provider-pattern-deep-dive)
  - [Function Providers](#function-providers)
  - [Class-Based Providers (IProvider)](#class-based-providers-iprovider)
  - [When to Use Each](#when-to-use-each)
- [Scope Behavior Details](#scope-behavior-details)
  - [Transient Behavior](#transient-behavior)
  - [Singleton Behavior](#singleton-behavior)
  - [Cache Management](#cache-management)
- [Real-World Example: Mini Application](#real-world-example-mini-application)
- [Container Independence](#container-independence)
- [Integration with Other Ignis Packages](#integration-with-other-ignis-packages)
  - [How Core Uses Inversion](#how-core-uses-inversion)
  - [How Boot Uses Inversion](#how-boot-uses-inversion)
  - [MetadataRegistry Extension via Mixins](#metadataregistry-extension-via-mixins)
- [Symbol.for Metadata Keys](#symbolforkk-metadata-keys)
- [Performance Considerations](#performance-considerations)
- [Types](#types)
  - [Core Types](#core-types)
  - [DI-Specific Types](#di-specific-types)
  - [Metadata Types](#metadata-types)
  - [Metadata Keys](#metadata-keys)
- [Complete Type Reference](#complete-type-reference)
- [Error Handling](#error-handling)
  - [Common Error Scenarios](#common-error-scenarios)
  - [Error Catalog](#error-catalog)
- [API Reference](#api-reference)
  - [Container API](#container-api)
  - [Binding API](#binding-api)
  - [MetadataRegistry API](#metadataregistry-api)
  - [Decorators API](#decorators-api)
  - [Utility Functions](#utility-functions)
- [Migration Guide](#migration-guide)
  - [From InversifyJS](#from-inversifyjs)
  - [From tsyringe](#from-tsyringe)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Installation

```bash
bun add @venizia/ignis-inversion
# or
npm install @venizia/ignis-inversion
```

**Requirements:**

- TypeScript 5.x with `experimentalDecorators` and `emitDecoratorMetadata` enabled in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

**Peer dependency:** `reflect-metadata` is included as a direct dependency and automatically imported.

---

## Quick Start

### Basic Container Usage

```typescript
import { Container } from '@venizia/ignis-inversion';

const container = new Container();

// Bind a plain value
container.bind({ key: 'config.dbHost' }).toValue('localhost');

// Bind a class
class Logger {
  log(msg: string) {
    console.log(msg);
  }
}

container.bind({ key: 'Logger' }).toClass(Logger);

// Resolve dependencies
const dbHost = container.get<string>({ key: 'config.dbHost' });
const logger = container.get<Logger>({ key: 'Logger' });

logger.log(`Connecting to ${dbHost}`);
```

### Decorator-Based Dependency Injection

```typescript
import { Container, injectable, inject } from '@venizia/ignis-inversion';

@injectable({})
class UserRepository {
  findById(id: string) {
    return { id, name: 'Alice' };
  }
}

@injectable({})
class UserService {
  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepo: UserRepository,
  ) {}

  getUser(id: string) {
    return this.userRepo.findById(id);
  }
}

// Wire it up
const container = new Container();
container
  .bind({ key: 'repositories.UserRepository' })
  .toClass(UserRepository)
  .setScope('singleton');

container.bind({ key: 'services.UserService' }).toClass(UserService);

// Resolve -- constructor dependencies are injected automatically
const service = container.get<UserService>({ key: 'services.UserService' });
service.getUser('123'); // { id: '123', name: 'Alice' }
```

---

## Core Concepts

### Container

The `Container` is the central IoC registry. It stores bindings, resolves dependencies, and performs two-phase instantiation (constructor injection, then property injection).

```typescript
import { Container } from '@venizia/ignis-inversion';

// Create a container (optional scope name for debugging)
const container = new Container({ scope: 'MyApp' });
```

**Key operations:**

```typescript
// Register a binding
container.bind<MyService>({ key: 'services.MyService' }).toClass(MyService);

// Resolve a dependency
const svc = container.get<MyService>({ key: 'services.MyService' });

// Check if a binding exists
container.isBound({ key: 'services.MyService' }); // true

// Remove a binding
container.unbind({ key: 'services.MyService' }); // true

// Resolve multiple bindings at once
const [db, cache] = container.gets<[Database, Cache]>({
  bindings: [
    { key: 'datasources.Database' },
    { key: 'datasources.Cache', isOptional: true },
  ],
});

// Instantiate a class with DI without registering it
const instance = container.resolve<MyService>(MyService);
// or equivalently:
const instance2 = container.instantiate<MyService>(MyService);

// Clear all cached singleton values (bindings remain)
container.clear();

// Remove all bindings entirely
container.reset();

// Access the global metadata registry
const registry = container.getMetadataRegistry();
```

**Namespaced key lookup:**

The `get` and `getBinding` methods accept keys in three formats:

```typescript
// String key
container.get<MyService>({ key: 'services.MyService' });

// Symbol key
container.get<MyService>({ key: Symbol.for('services.MyService') });

// Structured namespace + key object (built via BindingKeys.build)
container.get<MyService>({ key: { namespace: 'services', key: 'MyService' } });
```

**Two-phase instantiation algorithm:**

When a class binding is resolved, the container:

1. **Constructor injection** -- Reads `@inject` metadata from the class, sorts parameters by index, resolves each dependency from the container, and calls `new Class(...resolvedArgs)`.
2. **Property injection** -- Reads property `@inject` metadata from the instance, resolves each dependency, and assigns it to the corresponding property.

---

### Binding

A `Binding<T>` represents a registered dependency and how to resolve it. Bindings are created via `container.bind()` and configured with a fluent API.

```typescript
const binding = container.bind<UserService>({ key: 'services.UserService' });
```

**Binding value types:**

```typescript
// Class -- container instantiates with DI
binding.toClass(UserService);

// Value -- returns the exact value
binding.toValue({ host: 'localhost', port: 5432 });

// Provider -- factory function or IProvider class
binding.toProvider((container) => {
  const config = container.get<Config>({ key: 'config' });
  return new DatabasePool(config);
});
```

**Fluent configuration:**

```typescript
container
  .bind<UserService>({ key: 'services.UserService' })
  .toClass(UserService)
  .setScope('singleton')
  .setTags('critical', 'user-domain');
```

**Direct binding insertion:**

You can also create a binding externally and insert it into the container:

```typescript
import { Binding } from '@venizia/ignis-inversion';

const binding = Binding.bind<Config>({ key: 'config' });
binding.toValue({ port: 3000 });

container.set({ binding });
```

---

### MetadataRegistry

The `MetadataRegistry` is a singleton that stores all decorator metadata using `reflect-metadata`. It is the bridge between decorators (compile-time annotations) and the container (runtime resolution).

```typescript
import { metadataRegistry } from '@venizia/ignis-inversion';

// Or access it via a container instance
const registry = container.getMetadataRegistry();
```

**Generic metadata storage:**

```typescript
// Store arbitrary metadata on any target
registry.define({ target: MyClass, key: 'custom:role', value: 'admin' });

// Retrieve it
const role = registry.get<typeof MyClass, string>({
  target: MyClass,
  key: 'custom:role',
});

// Check existence
registry.has({ target: MyClass, key: 'custom:role' }); // true

// Remove
registry.delete({ target: MyClass, key: 'custom:role' }); // true
```

**Introspection:**

```typescript
// Get all metadata keys for a target
const keys = registry.getKeys({ target: MyClass });

// Get all non-constructor method names from a class
const methods = registry.getMethodNames({ target: MyClass });

// Clear all metadata for a target
registry.clearMetadata({ target: MyClass });
```

The registry also provides specialized methods for injection metadata (`setInjectMetadata`, `getInjectMetadata`), property metadata (`setPropertyMetadata`, `getPropertiesMetadata`, `getPropertyMetadata`), and injectable metadata (`setInjectableMetadata`, `getInjectableMetadata`). These are typically used internally by the `@inject` and `@injectable` decorators.

**How injection metadata is stored:**

- **Constructor `@inject`:** Stored on the **class constructor** itself using `MetadataKeys.INJECT` as the reflect-metadata key. The value is an array of `IInjectMetadata` objects, indexed by parameter position.
- **Property `@inject`:** Stored on the **class constructor** (via `target.constructor`) using `MetadataKeys.PROPERTIES` as the reflect-metadata key. The value is a `Map<string | symbol, IPropertyMetadata>` mapping property names to their injection config.
- **`@injectable`:** Stored on the **class constructor** using `MetadataKeys.INJECTABLE`. The value is an `IInjectableMetadata` object with optional scope and tags.

---

### Decorators

Two decorators form the DI annotation layer:

#### `@injectable(metadata)`

Marks a class as injectable with optional scope and tag metadata.

```typescript
import { injectable } from '@venizia/ignis-inversion';

@injectable({ scope: 'singleton', tags: { domain: 'user' } })
class UserService {
  // ...
}
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `metadata.scope` | `'singleton' \| 'transient'` | Optional. Default binding scope hint |
| `metadata.tags` | `Record<string, any>` | Optional. Arbitrary tag metadata |

#### `@inject(opts)`

Marks a constructor parameter or class property for dependency injection.

```typescript
import { inject } from '@venizia/ignis-inversion';

class OrderService {
  // Property injection
  @inject({ key: 'services.NotificationService' })
  private notifier!: NotificationService;

  constructor(
    // Constructor parameter injection
    @inject({ key: 'repositories.OrderRepository' })
    private orderRepo: OrderRepository,

    // Optional dependency -- resolves to undefined if not bound
    @inject({ key: 'services.AuditService', isOptional: true })
    private auditService?: AuditService,
  ) {}
}
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `opts.key` | `string \| symbol` | The binding key to resolve |
| `opts.isOptional` | `boolean` | If `true`, returns `undefined` instead of throwing when unbound. Default: `false` |
| `opts.registry` | `MetadataRegistry` | Optional. Override the default global registry |

**What happens internally when `@inject` is applied:**

- If applied to a **constructor parameter** (when `parameterIndex` is a number), it calls `registry.setInjectMetadata()` which stores `{ key, index, isOptional }` in a reflect-metadata array on the class constructor.
- If applied to a **property** (when `propertyName` is defined), it calls `registry.setPropertyMetadata()` which stores `{ bindingKey, isOptional }` in a reflect-metadata Map on the class constructor.
- If applied in any other context, it throws an `ApplicationError` with the message `@inject decorator can only be used on class properties or constructor parameters`.

---

### Binding Keys

Ignis uses a **namespace-based naming convention** for binding keys. This keeps large applications organized and enables tag-based discovery.

```typescript
import { BindingKeys } from '@venizia/ignis-inversion';

// Build a namespaced key
const key = BindingKeys.build({ namespace: 'services', key: 'UserService' });
// => 'services.UserService'
```

**Convention:** `namespace.ClassName`

| Namespace | Usage |
|:----------|:------|
| `controllers` | HTTP controllers |
| `services` | Business logic services |
| `repositories` | Data access repositories |
| `datasources` | Database connections |
| `config` | Configuration values |

**Auto-tagging:** When a binding key contains a dot (e.g., `"services.UserService"`), the text before the first dot is automatically added as a tag. This means `container.bind({ key: 'services.UserService' })` automatically tags the binding with `"services"`.

```typescript
container.bind({ key: 'services.UserService' }).toClass(UserService);
container.bind({ key: 'services.OrderService' }).toClass(OrderService);

// Find all service bindings via the auto-tag
const serviceBindings = container.findByTag({ tag: 'services' });
// => [Binding<UserService>, Binding<OrderService>]
```

**BindingKeys.build validation:** The `key` parameter is required. If it is empty, `BindingKeys.build` throws an `ApplicationError`. The `namespace` parameter is optional -- if empty, the result is just the key without a dot prefix.

```typescript
BindingKeys.build({ namespace: '', key: 'AppConfig' }); // => 'AppConfig'
BindingKeys.build({ namespace: 'config', key: '' });     // throws ApplicationError
```

---

### BaseHelper

Both `Container` and `Binding` extend `BaseHelper`, a minimal base class that provides debugging context:

```typescript
export class BaseHelper {
  scope: string;       // Descriptive scope name (e.g., 'MyApp' for Container, 'services.UserService' for Binding)
  identifier: string;  // Optional secondary identifier

  constructor(opts: { scope: string; identifier?: string });
}
```

- **Container** sets `scope` to the constructor's `opts.scope` or `'Container'` by default.
- **Binding** sets `scope` to its binding key string (e.g., `'services.UserService'`).
- **MetadataRegistry** sets `scope` to `'MetadataRegistry'`.

`BaseHelper` exists so that every DI primitive carries a human-readable label for logging and debugging. In the full Ignis framework, the core package extends `BaseHelper` with a `Logger` instance, but the inversion package keeps it minimal.

---

## Advanced Usage

### Constructor Injection

Constructor injection is the primary injection mechanism. The container reads `@inject` metadata, sorts by parameter index, resolves each dependency, and passes them as constructor arguments.

```typescript
@injectable({})
class PaymentService {
  constructor(
    @inject({ key: 'repositories.PaymentRepository' })
    private paymentRepo: PaymentRepository,

    @inject({ key: 'services.NotificationService' })
    private notifier: NotificationService,

    @inject({ key: 'config.stripe.apiKey' })
    private stripeApiKey: string,
  ) {}

  async charge(amount: number) {
    // All three dependencies are available
    const result = await this.paymentRepo.create({ data: { amount } });
    this.notifier.send(`Payment of ${amount} processed`);
    return result;
  }
}

// Registration
container.bind({ key: 'config.stripe.apiKey' }).toValue('sk_test_...');
container.bind({ key: 'repositories.PaymentRepository' }).toClass(PaymentRepository);
container.bind({ key: 'services.NotificationService' }).toClass(NotificationService);
container.bind({ key: 'services.PaymentService' }).toClass(PaymentService);

// Resolution -- all deps injected automatically
const paymentService = container.get<PaymentService>({ key: 'services.PaymentService' });
```

---

### Property Injection

Property injection assigns dependencies after the constructor completes. Useful for optional dependencies or to avoid long constructor parameter lists.

```typescript
@injectable({})
class ReportService {
  @inject({ key: 'services.Logger' })
  private logger!: Logger;

  @inject({ key: 'services.CacheService', isOptional: true })
  private cache?: CacheService;

  generate() {
    this.logger.log('Generating report...');
    if (this.cache) {
      // Use cache if available
    }
  }
}
```

> **Note:** Use the definite assignment assertion (`!`) for required property injections since TypeScript cannot see that the container will assign the value.

---

### Provider Pattern

Providers allow deferred or dynamic resolution. Two forms are supported:

**Function provider:**

```typescript
container.bind({ key: 'datasources.Pool' }).toProvider((container) => {
  const config = container.get<DbConfig>({ key: 'config.database' });
  return new Pool({
    host: config.host,
    port: config.port,
    max: config.poolSize,
  });
});
```

**Class provider (implements `IProvider<T>`):**

```typescript
import { IProvider, Container } from '@venizia/ignis-inversion';

class DatabasePoolProvider implements IProvider<Pool> {
  value(container: Container): Pool {
    const config = container.get<DbConfig>({ key: 'config.database' });
    return new Pool({
      host: config.host,
      port: config.port,
      max: config.poolSize,
    });
  }
}

container.bind({ key: 'datasources.Pool' }).toProvider(DatabasePoolProvider);
```

Class providers are instantiated by the container (via `container.instantiate`), so they can themselves use DI if needed.

---

### Optional Dependencies

Mark a dependency as optional to receive `undefined` instead of an error when the binding does not exist.

**In `@inject`:**

```typescript
class MyService {
  constructor(
    @inject({ key: 'services.Analytics', isOptional: true })
    private analytics?: AnalyticsService,
  ) {}
}
```

**In `container.get`:**

```typescript
// Throws if not bound
const svc = container.get<MyService>({ key: 'services.MyService' });

// Returns undefined if not bound
const svc = container.get<MyService>({ key: 'services.MyService', isOptional: true });
```

---

### Singleton vs Transient Scoping

| Scope | Behavior | Use Case |
|:------|:---------|:---------|
| `transient` (default) | New instance created on every `get()` call | Stateful per-request services, short-lived objects |
| `singleton` | Cached after first resolution; same instance returned thereafter | Database pools, configuration, shared utilities |

```typescript
// Transient (default) -- new instance each time
container.bind({ key: 'services.RequestContext' }).toClass(RequestContext);

// Singleton -- cached after first resolution
container
  .bind({ key: 'datasources.Database' })
  .toClass(DatabaseDataSource)
  .setScope('singleton');
```

**Cache management:**

```typescript
// Clear a single binding's cached singleton
const binding = container.getBinding({ key: 'datasources.Database' });
binding?.clearCache();

// Clear ALL singleton caches (bindings remain registered)
container.clear();

// Remove all bindings entirely
container.reset();
```

**Scope constants:**

```typescript
import { BindingScopes } from '@venizia/ignis-inversion';

BindingScopes.SINGLETON; // 'singleton'
BindingScopes.TRANSIENT; // 'transient'
```

---

### Tag-Based Discovery

Tags enable querying the container for groups of related bindings. Namespace auto-tagging handles the common case automatically, and you can add custom tags for more granular control.

```typescript
// Auto-tagged by namespace
container.bind({ key: 'controllers.UserController' }).toClass(UserController);
container.bind({ key: 'controllers.OrderController' }).toClass(OrderController);

// Custom tags
container
  .bind({ key: 'services.EmailNotifier' })
  .toClass(EmailNotifier)
  .setTags('notifiers', 'async');

container
  .bind({ key: 'services.SmsNotifier' })
  .toClass(SmsNotifier)
  .setTags('notifiers', 'async');

// Find all controllers
const controllerBindings = container.findByTag({ tag: 'controllers' });

// Find all notifiers
const notifierBindings = container.findByTag({ tag: 'notifiers' });

// Find notifiers, excluding a specific one
const filtered = container.findByTag({
  tag: 'notifiers',
  exclude: ['services.SmsNotifier'],
});

// Resolve all found bindings
const notifiers = notifierBindings.map(b => b.getValue(container));
```

**Tag inspection:**

```typescript
const binding = container.getBinding({ key: 'services.EmailNotifier' });
binding?.hasTag('notifiers'); // true
binding?.getTags();           // ['services', 'notifiers', 'async']
```

---

### Type Guards and Utilities

The package exports several type guard functions for runtime type checking:

```typescript
import { isClass, isClassProvider, isClassConstructor } from '@venizia/ignis-inversion';

// Check if a value is a class (has a prototype)
isClass(UserService);       // true
isClass(() => {});          // false

// Check if a value is an IProvider class (has prototype.value as function)
isClassProvider(DatabasePoolProvider); // true
isClassProvider((c) => new Pool());   // false

// Check if a function is a named class constructor
isClassConstructor(UserService); // true
isClassConstructor(() => {});    // false
```

---

## Container Lifecycle

### Create, Bind, Resolve, Teardown

A container goes through a predictable lifecycle:

```typescript
import { Container } from '@venizia/ignis-inversion';

// 1. CREATE -- Instantiate the container
const container = new Container({ scope: 'MyApp' });

// 2. BIND -- Register all dependencies
container.bind({ key: 'config.port' }).toValue(3000);
container.bind({ key: 'services.Logger' }).toClass(ConsoleLogger).setScope('singleton');
container.bind({ key: 'services.UserService' }).toClass(UserService);

// 3. RESOLVE -- Get instances (triggers instantiation + injection)
const userService = container.get<UserService>({ key: 'services.UserService' });
const port = container.get<number>({ key: 'config.port' });

// 4. INSPECT -- Query what is registered
container.isBound({ key: 'services.Logger' });  // true
const loggerBinding = container.getBinding({ key: 'services.Logger' });
const allServices = container.findByTag({ tag: 'services' });

// 5. MODIFY -- Add or remove bindings at runtime
container.unbind({ key: 'services.UserService' });
container.bind({ key: 'services.UserService' }).toClass(EnhancedUserService);

// 6. TEARDOWN -- Clean up
container.clear();  // Clear singleton caches, keep bindings
container.reset();  // Remove all bindings
```

---

### clear() vs reset()

These two methods serve very different purposes:

| Method | Bindings | Singleton Caches | Use Case |
|:-------|:---------|:-----------------|:---------|
| `clear()` | Kept | Cleared | Refresh singleton instances (e.g., reconnect a database pool) without losing the binding configuration |
| `reset()` | Removed | Removed (implicitly) | Full teardown -- the container returns to an empty state |

**`clear()` in detail:**

Iterates over every binding in the container and calls `binding.clearCache()` on each. After calling `clear()`, the next `get()` call on a singleton binding will create a fresh instance and cache it again.

```typescript
// Singleton is cached
const db1 = container.get<Database>({ key: 'datasources.Database' });
const db2 = container.get<Database>({ key: 'datasources.Database' });
console.log(db1 === db2); // true

// Clear caches
container.clear();

// Next resolution creates a new instance
const db3 = container.get<Database>({ key: 'datasources.Database' });
console.log(db1 === db3); // false
```

**`reset()` in detail:**

Calls `this.bindings.clear()` on the internal `Map`, removing all bindings entirely. Any subsequent `get()` call will throw `"Binding key: X is not bounded in context!"` unless new bindings are registered.

```typescript
container.reset();
container.isBound({ key: 'services.Logger' }); // false
container.get({ key: 'services.Logger' });       // throws ApplicationError
```

---

## Binding Resolution Internals

Understanding how the container resolves bindings is essential for debugging DI issues.

### Two-Phase Instantiation Walkthrough

When you call `container.get({ key: 'services.UserService' })` and the binding is configured with `toClass(UserService)`, the following happens step by step:

```
container.get({ key: 'services.UserService' })
  |
  +--> container.getBinding({ key: 'services.UserService' })
  |      returns Binding<UserService>
  |
  +--> binding.getValue(container)
         |
         +--> Check scope: if singleton and cached, return cached value immediately
         |
         +--> Resolver type is CLASS, so:
         |      container.instantiate(UserService)
         |
         |    === PHASE 1: Constructor Injection ===
         |
         |    1. registry.getInjectMetadata({ target: UserService })
         |       Returns: [
         |         { key: 'repositories.UserRepository', index: 0, isOptional: false },
         |         { key: 'services.Logger', index: 1, isOptional: true },
         |       ]
         |
         |    2. Sort metadata by index (ascending)
         |       Sorted: [index:0 -> UserRepository, index:1 -> Logger]
         |
         |    3. For each metadata entry:
         |       args[0] = container.get({ key: 'repositories.UserRepository', isOptional: false })
         |       args[1] = container.get({ key: 'services.Logger', isOptional: true })
         |       (Each of these may recursively trigger instantiation of other classes)
         |
         |    4. const instance = new UserService(args[0], args[1])
         |
         |    === PHASE 2: Property Injection ===
         |
         |    5. registry.getPropertiesMetadata({ target: instance })
         |       Returns: Map {
         |         'cache' => { bindingKey: 'services.CacheService', isOptional: true }
         |       }
         |
         |    6. For each property:
         |       instance['cache'] = container.get({ key: 'services.CacheService', isOptional: true })
         |
         |    7. Return instance
         |
         +--> If scope is singleton, cache: this.cached = instance
         |
         +--> Return instance
```

---

### Resolver Types and getValue() Flow

The `getValue()` method on a `Binding` handles three resolver types:

```
binding.getValue(container)
  |
  +--> if (singleton && cached) return cached
  |
  +--> switch (resolver.type):
  |
  |    case 'value':
  |      instance = resolver.value  (direct return, no container needed)
  |
  |    case 'provider':
  |      if (isClassProvider(resolver.value)):
  |        // Class provider: instantiate the provider class with DI, then call .value()
  |        providerInstance = container.instantiate(resolver.value)
  |        instance = providerInstance.value(container)
  |      else:
  |        // Function provider: call the function directly with container
  |        instance = resolver.value(container)
  |
  |    case 'class':
  |      instance = container.instantiate(resolver.value)
  |
  +--> if (singleton) this.cached = instance
  +--> return instance
```

**Key insight:** Both `class` and `provider` (class-based) resolver types require a container reference. If `getValue()` is called without a container on these types, it throws:
- `[getValue] Invalid context/container to instantiate class`
- `[getValue] Invalid context/container to get provider value`

The `value` resolver type does not require a container -- it returns the stored value directly.

---

### Singleton Caching Internals

Singleton caching is handled **per-Binding**, not per-Container. The cached value is stored as a private `cached` property on the `Binding` instance:

```typescript
// Simplified internal logic
getValue(container?: Container): T {
  // Fast path: return cached singleton
  if (this.bindScope === 'singleton' && this.cached !== undefined) {
    return this.cached;
  }

  // ... resolve instance ...

  // Cache for singleton scope
  if (this.bindScope === 'singleton') {
    this.cached = instance;
  }

  return instance;
}
```

> **Important:** The cache check uses `this.cached !== undefined`. This means if a singleton resolves to `undefined` or `null`, it will **not** be cached and will be re-resolved on every call. For value bindings that intentionally hold `undefined`, use transient scope or wrap the value.

**`clearCache()` behavior:**

```typescript
clearCache() {
  if (!this.cached) {
    return;
  }
  this.cached = undefined;
}
```

Note that `clearCache()` checks `!this.cached` (falsy check), so it will skip clearing if the cached value is already falsy (`undefined`, `null`, `0`, `''`, `false`). For typical use cases (classes, objects, pools), this is not an issue.

---

## Provider Pattern Deep Dive

### Function Providers

Function providers are simple factory functions that receive the container and return a value:

```typescript
container.bind({ key: 'services.DatabasePool' }).toProvider((container) => {
  const host = container.get<string>({ key: 'config.db.host' });
  const port = container.get<number>({ key: 'config.db.port' });
  const pool = new Pool({ host, port, max: 10 });
  return pool;
});
```

Function providers are called directly -- `provider(container)` -- with no DI on the function itself. They are best for simple factory logic where you just need to read config and create an object.

---

### Class-Based Providers (IProvider)

Class-based providers implement the `IProvider<T>` interface and are themselves instantiated via the container's DI mechanism:

```typescript
import { IProvider, Container, inject, injectable } from '@venizia/ignis-inversion';

interface DbConfig {
  host: string;
  port: number;
  maxConnections: number;
}

@injectable({})
class DatabasePoolProvider implements IProvider<Pool> {
  constructor(
    @inject({ key: 'config.database' })
    private config: DbConfig,
  ) {}

  value(container: Container): Pool {
    return new Pool({
      host: this.config.host,
      port: this.config.port,
      max: this.config.maxConnections,
    });
  }
}

// Registration
container.bind({ key: 'config.database' }).toValue({ host: 'localhost', port: 5432, maxConnections: 10 });
container.bind({ key: 'datasources.Pool' }).toProvider(DatabasePoolProvider).setScope('singleton');

// Resolution -- provider is instantiated with DI, then .value() is called
const pool = container.get<Pool>({ key: 'datasources.Pool' });
```

The container detects class-based providers using `isClassProvider()`, which checks whether the target has a `prototype.value` method. If detected, the provider is instantiated via `container.instantiate()` (which performs full two-phase DI on the provider class), and then its `value(container)` method is called.

The full Ignis framework also provides a `BaseProvider<T>` abstract class (in `@venizia/ignis` core) that extends `BaseHelper` and implements `IProvider<T>`, giving providers access to scoped logging.

---

### When to Use Each

| Pattern | Use When |
|:--------|:---------|
| **Function provider** | Simple factory logic. No need for the provider itself to have injected dependencies. One-liner or few-liner creation. |
| **Class provider** | The provider needs its own injected dependencies. Complex initialization logic. Reusable across multiple bindings. Testing requires mocking the provider. |
| **`toClass()`** | The dependency is a straightforward class with `@inject` decorators. No custom factory logic needed. |
| **`toValue()`** | The value is a static constant, configuration object, or pre-constructed instance. |

---

## Scope Behavior Details

### Transient Behavior

Transient is the default scope. Every call to `get()` creates a brand new instance:

```typescript
container.bind({ key: 'services.RequestHandler' }).toClass(RequestHandler);

const handler1 = container.get<RequestHandler>({ key: 'services.RequestHandler' });
const handler2 = container.get<RequestHandler>({ key: 'services.RequestHandler' });

console.log(handler1 === handler2); // false -- different instances
```

Transient bindings never cache. Each resolution triggers the full two-phase instantiation process. This is ideal for per-request objects, short-lived services, or stateful objects where sharing would cause bugs.

---

### Singleton Behavior

Singleton bindings cache the instance after the first resolution:

```typescript
container.bind({ key: 'datasources.Postgres' }).toClass(PostgresDataSource).setScope('singleton');

// First call: triggers instantiation, caches result
const ds1 = container.get<PostgresDataSource>({ key: 'datasources.Postgres' });

// Second call: returns cached instance immediately (no instantiation)
const ds2 = container.get<PostgresDataSource>({ key: 'datasources.Postgres' });

console.log(ds1 === ds2); // true -- same instance

// Third call from a different part of the app: still the same instance
const ds3 = container.get<PostgresDataSource>({ key: 'datasources.Postgres' });
console.log(ds1 === ds3); // true
```

---

### Cache Management

**Clear a single binding's cache:**

```typescript
const binding = container.getBinding<PostgresDataSource>({ key: 'datasources.Postgres' });
binding?.clearCache();

// Next get() will create a fresh instance
const freshDs = container.get<PostgresDataSource>({ key: 'datasources.Postgres' });
```

**Clear all singleton caches at once:**

```typescript
container.clear(); // All singleton caches are wiped, but bindings remain
```

**When to use `clearCache()`:**

- Database pool needs to reconnect after a connection failure
- Configuration changed at runtime and singleton services need refreshing
- Testing: reset state between test cases without re-registering all bindings

---

## Real-World Example: Mini Application

This example shows a complete mini-application with multiple services wired together via DI, demonstrating constructor injection, property injection, singletons, transients, and providers:

```typescript
import { Container, injectable, inject, IProvider } from '@venizia/ignis-inversion';

// --- Configuration ---
interface AppConfig {
  dbHost: string;
  dbPort: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// --- Logger ---
@injectable({})
class Logger {
  constructor(
    @inject({ key: 'config' })
    private config: AppConfig,
  ) {}

  info(message: string) {
    if (['debug', 'info'].includes(this.config.logLevel)) {
      console.log(`[INFO] ${message}`);
    }
  }

  error(message: string) {
    console.error(`[ERROR] ${message}`);
  }
}

// --- Database Connection (via provider) ---
class DatabaseConnection {
  constructor(public host: string, public port: number) {}

  query(sql: string): any[] {
    // Simulated query
    return [{ id: 1 }];
  }

  close() {
    // Close the connection pool
  }
}

class DatabaseConnectionProvider implements IProvider<DatabaseConnection> {
  value(container: Container): DatabaseConnection {
    const config = container.get<AppConfig>({ key: 'config' });
    return new DatabaseConnection(config.dbHost, config.dbPort);
  }
}

// --- Repository ---
@injectable({})
class UserRepository {
  constructor(
    @inject({ key: 'datasources.Database' })
    private db: DatabaseConnection,

    @inject({ key: 'services.Logger' })
    private logger: Logger,
  ) {}

  findById(id: number) {
    this.logger.info(`UserRepository.findById(${id})`);
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`);
  }

  findAll() {
    this.logger.info('UserRepository.findAll()');
    return this.db.query('SELECT * FROM users');
  }

  create(data: { name: string; email: string }) {
    this.logger.info(`UserRepository.create(${data.name})`);
    return { id: Date.now(), ...data };
  }
}

// --- Service with property injection ---
@injectable({})
class NotificationService {
  info(message: string) {
    console.log(`[NOTIFICATION] ${message}`);
  }
}

@injectable({})
class UserService {
  // Property injection for optional dependency
  @inject({ key: 'services.NotificationService', isOptional: true })
  private notifier?: NotificationService;

  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepo: UserRepository,

    @inject({ key: 'services.Logger' })
    private logger: Logger,
  ) {}

  getUser(id: number) {
    this.logger.info(`UserService.getUser(${id})`);
    return this.userRepo.findById(id);
  }

  createUser(data: { name: string; email: string }) {
    this.logger.info(`UserService.createUser(${data.name})`);
    const user = this.userRepo.create(data);
    this.notifier?.info(`User created: ${data.name}`);
    return user;
  }
}

// --- Wire it all up ---
const container = new Container({ scope: 'MyApp' });

// Configuration (value binding)
container.bind({ key: 'config' }).toValue({
  dbHost: 'localhost',
  dbPort: 5432,
  logLevel: 'info',
} satisfies AppConfig);

// Singletons -- shared across the application
container.bind({ key: 'services.Logger' }).toClass(Logger).setScope('singleton');
container.bind({ key: 'datasources.Database' }).toProvider(DatabaseConnectionProvider).setScope('singleton');

// Transients -- fresh instance per resolution
container.bind({ key: 'repositories.UserRepository' }).toClass(UserRepository);
container.bind({ key: 'services.NotificationService' }).toClass(NotificationService);
container.bind({ key: 'services.UserService' }).toClass(UserService);

// --- Use it ---
const userService = container.get<UserService>({ key: 'services.UserService' });
userService.createUser({ name: 'Alice', email: 'alice@example.com' });
// Output:
//   [INFO] UserService.createUser(Alice)
//   [INFO] UserRepository.create(Alice)
//   [NOTIFICATION] User created: Alice

// Verify singleton behavior
const logger1 = container.get<Logger>({ key: 'services.Logger' });
const logger2 = container.get<Logger>({ key: 'services.Logger' });
console.log(logger1 === logger2); // true

// Query bindings by tag
const allServices = container.findByTag({ tag: 'services' });
console.log(allServices.map(b => b.key));
// ['services.Logger', 'services.NotificationService', 'services.UserService']

// Cleanup
container.clear(); // Clear caches for reconnection
container.reset(); // Full teardown
```

---

## Container Independence

Each `Container` instance is completely independent. There is no parent/child container hierarchy, no container nesting, and no shared state between containers. Two separate `Container` instances have entirely separate binding registries:

```typescript
const container1 = new Container({ scope: 'App1' });
const container2 = new Container({ scope: 'App2' });

container1.bind({ key: 'config.port' }).toValue(3000);
container2.bind({ key: 'config.port' }).toValue(4000);

container1.get<number>({ key: 'config.port' }); // 3000
container2.get<number>({ key: 'config.port' }); // 4000

container1.isBound({ key: 'config.port' }); // true
container2.isBound({ key: 'config.port' }); // true -- independent
container1.reset();
container2.isBound({ key: 'config.port' }); // still true
```

**However**, the `MetadataRegistry` is a **shared singleton**. Decorator metadata (`@inject`, `@injectable`) is stored globally because TypeScript decorators execute at class definition time, before any container exists. This means:

- All containers share the same decorator metadata.
- If you define `@inject({ key: 'services.Logger' })` on a class, that metadata is visible from any container.
- Each container independently resolves the binding for `'services.Logger'` from its own registry.

This design is intentional: metadata describes the class's **dependencies**, while the container determines **how to fulfill** those dependencies.

---

## Integration with Other Ignis Packages

### How Core Uses Inversion

The `@venizia/ignis` core package extends both `Container` and `MetadataRegistry` from inversion:

**Container extension:**

```typescript
// packages/core/src/helpers/inversion/container.ts
import { Container as DIContainer } from '@venizia/ignis-inversion';

export class Container extends DIContainer {
  logger: Logger;  // Adds structured logging

  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
    this.logger = LoggerFactory.getLogger([opts?.scope ?? Container.name]);
  }

  override getMetadataRegistry() {
    return MetadataRegistry.getInstance();  // Uses core's extended registry
  }
}
```

The core `BaseApplication` extends this enhanced `Container`, so the application itself **is** the DI container:

```typescript
class BaseApplication extends BootMixin(Container) {
  // The application IS the container
  // this.bind(), this.get(), this.findByTag() -- all available directly
}
```

**Decorator re-export with custom registry:**

Core re-exports `@inject` and `@injectable` but wires them to the core-extended `MetadataRegistry`:

```typescript
// packages/core/src/base/metadata/injectors.ts
import { inject as coreInject, injectable as coreInjectable } from '@venizia/ignis-inversion';

export const inject = (opts: { key: string | symbol; isOptional?: boolean }) => {
  return coreInject({ ...opts, registry: MetadataRegistry.getInstance() });
};
```

---

### How Boot Uses Inversion

The boot package uses inversion for auto-discovery of artifacts. All booters use `@inject` for their dependencies:

```typescript
// packages/boot/src/booters/controller.booter.ts
import { BindingKeys, inject } from '@venizia/ignis-inversion';

class ControllerBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) { /* ... */ }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'controllers', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('controllers');
    }
  }
}
```

The `BootMixin` uses tag-based discovery to find all booters:

```typescript
// packages/boot/src/boot.mixin.ts
import { BindingScopes, Container } from '@venizia/ignis-inversion';

export const BootMixin = <T extends TMixinTarget<Container>>(baseClass: T) => {
  class Mixed extends baseClass {
    constructor(...args: any[]) {
      super(...args);
      // Register booters with the 'booter' tag
      this.bind({ key: 'booter.ControllerBooter' }).toClass(ControllerBooter).setTags('booter');
      this.bind({ key: 'booter.ServiceBooter' }).toClass(ServiceBooter).setTags('booter');
      // ...
      this.bind({ key: 'bootstrapper' }).toClass(Bootstrapper).setScope(BindingScopes.SINGLETON);
    }

    boot(): Promise<IBootReport> {
      const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });
      return bootstrapper.boot({});
    }
  }
  return Mixed;
};
```

The `Bootstrapper` then discovers booters via `container.findByTag({ tag: 'booter' })` and runs them through their lifecycle phases.

---

### MetadataRegistry Extension via Mixins

The core package extends the inversion `MetadataRegistry` using mixin composition:

```typescript
// packages/core/src/helpers/inversion/registry.ts
import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';

export class MetadataRegistry extends ControllerMetadataMixin(
  RepositoryMetadataMixin(ModelMetadataMixin(DatasourceMetadataMixin(_MetadataRegistry))),
) {
  private static instance: MetadataRegistry;

  static getInstance(): MetadataRegistry {
    if (!MetadataRegistry.instance) {
      MetadataRegistry.instance = new MetadataRegistry();
    }
    return MetadataRegistry.instance;
  }
}
```

This adds domain-specific metadata methods (controller routes, repository bindings, model schemas, datasource configs) on top of the base injection metadata that inversion provides. The mixin chain is:

```
inversion.MetadataRegistry (inject/property/injectable metadata)
  + DatasourceMetadataMixin (datasource settings)
  + ModelMetadataMixin (model schemas, relations)
  + RepositoryMetadataMixin (repository bindings, schema auto-discovery)
  + ControllerMetadataMixin (controller metadata, route definitions)
```

---

## Symbol.for Metadata Keys

The `MetadataKeys` object uses `Symbol.for()` instead of plain `Symbol()`:

```typescript
export const MetadataKeys = {
  PROPERTIES: Symbol.for('ignis:properties'),
  INJECT:     Symbol.for('ignis:inject'),
  INJECTABLE: Symbol.for('ignis:injectable'),
};
```

**Why `Symbol.for()` instead of `Symbol()`:**

`Symbol.for('ignis:properties')` uses the **global Symbol registry**. This means:

1. Any module in any package that calls `Symbol.for('ignis:properties')` gets the **same symbol**.
2. This is critical for monorepo setups where `@venizia/ignis-inversion` might be resolved from different `node_modules` paths or bundled separately.
3. Plain `Symbol('ignis:properties')` creates a **unique** symbol each time -- if two copies of the library exist (e.g., different versions), their symbols would not match, and metadata lookups would silently fail.

**Why prefixed with `ignis:`:**

The `ignis:` prefix acts as a namespace to avoid collisions with other libraries that might also use `Symbol.for()`. This is a common convention for libraries that store global metadata.

---

## Performance Considerations

### Singleton vs Transient Performance

- **Singleton resolution (cached):** Effectively free after the first call. The `getValue()` method checks `this.cached !== undefined` and returns immediately. No container lookup, no instantiation, no metadata reading.
- **Singleton resolution (first call):** Same cost as transient -- full two-phase instantiation.
- **Transient resolution:** Every call pays the full cost: metadata lookup, dependency resolution (potentially recursive), constructor invocation, property assignment.

> **Recommendation:** Use singleton for anything stateless or expensive to create (database connections, loggers, configuration parsers). Use transient for per-request state or objects that must not be shared.

### Metadata Reflection Cost

- `Reflect.getMetadata()` is called on every class instantiation (both constructor and property phases).
- The metadata itself is computed once at class definition time (when decorators execute) and stored in the reflect-metadata backing store.
- The per-resolution cost is the reflection lookup + iterating the inject metadata array. For a class with N constructor parameters and M properties, this is O(N log N + M) (the sort for constructor params, then the property iteration).

### Container Lookup Cost

- Bindings are stored in a `Map<string | symbol, Binding>`. Lookup is O(1) average.
- `findByTag()` iterates all bindings -- O(total bindings). For tag-heavy queries, this is the most expensive container operation.
- `getBinding()` with a `{ namespace, key }` object calls `BindingKeys.build()` first, which concatenates two strings. Negligible cost.

### Best Practices

1. **Register datasources as singletons** -- connection pools are expensive and must be shared.
2. **Register services as singletons if they are stateless** -- avoids repeated instantiation.
3. **Keep constructor parameter counts reasonable** -- 3--5 parameters is typical. More than 7 is a code smell indicating the class has too many responsibilities.
4. **Prefer constructor injection over property injection** -- it is resolved during instantiation (one pass), while property injection requires an additional metadata lookup pass.

---

## Types

### Core Types

```typescript
// Nullable wrapper
type TNullable<T> = T | undefined | null;

// Value that may be synchronous or a Promise
type ValueOrPromise<T> = T | Promise<T>;

// Extract value types from an object
type ValueOf<T> = T[keyof T];

// Class constructor types
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
type TClass<T> = TConstructor<T> & { [property: string]: any };

// Extract string/number constant values from a class
type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
```

### DI-Specific Types

```typescript
// Binding scope: 'singleton' | 'transient'
type TBindingScope = TConstValue<typeof BindingScopes>;

// Binding value type: 'class' | 'value' | 'provider'
type TBindingValueType = TConstValue<typeof BindingValueTypes>;

// Provider interface for class-based providers
interface IProvider<T> {
  value(container: Container): T;
}

// Binding tag interface
interface IBindingTag {
  [name: string]: any;
}
```

### Metadata Types

```typescript
// Property injection metadata
interface IPropertyMetadata {
  bindingKey: string | symbol;
  isOptional?: boolean;
  [key: string]: any;
}

// Constructor parameter injection metadata
interface IInjectMetadata {
  key: string | symbol;
  index: number;
  isOptional?: boolean;
}

// @injectable decorator metadata
interface IInjectableMetadata {
  scope?: TBindingScope;
  tags?: Record<string, any>;
}
```

### Metadata Keys

Globally registered symbols used internally to store decorator metadata:

```typescript
import { MetadataKeys } from '@venizia/ignis-inversion';

MetadataKeys.PROPERTIES;  // Symbol.for('ignis:properties')
MetadataKeys.INJECT;      // Symbol.for('ignis:inject')
MetadataKeys.INJECTABLE;  // Symbol.for('ignis:injectable')
```

---

## Complete Type Reference

Every type, interface, class, constant, and function exported from `@venizia/ignis-inversion`:

### Classes

```typescript
class BaseHelper {
  scope: string;
  identifier: string;
  constructor(opts: { scope: string; identifier?: string });
}

class Container extends BaseHelper {
  protected bindings: Map<string | symbol, Binding>;

  constructor(opts?: { scope: string });
  getMetadataRegistry(): MetadataRegistry;
  bind<T>(opts: { key: string | symbol }): Binding<T>;
  isBound(opts: { key: string | symbol }): boolean;
  getBinding<T>(opts: { key: string | symbol | { namespace: string; key: string } }): TNullable<Binding<T>>;
  unbind(opts: { key: string | symbol }): boolean;
  set<T>(opts: { binding: Binding<T> }): void;
  get<T>(opts: { key: string | symbol | { namespace: string; key: string }; isOptional?: false }): T;
  get<T>(opts: { key: string | symbol | { namespace: string; key: string }; isOptional?: boolean }): T | undefined;
  gets<T extends unknown[]>(opts: {
    bindings: { [K in keyof T]: { key: string | symbol | { namespace: string; key: string }; isOptional?: boolean } };
  }): { [K in keyof T]: T[K] | undefined };
  resolve<T>(cls: TClass<T>): T;
  instantiate<T>(cls: TClass<T>): T;
  findByTag<T = any>(opts: { tag: string; exclude?: Array<string> | Set<string> }): Binding<T>[];
  clear(): void;
  reset(): void;
}

class Binding<T = any> extends BaseHelper {
  key: string;

  constructor(opts: { key: string });
  static bind<T = any>(opts: { key: string }): Binding<T>;
  toClass(value: TClass<T>): this;
  toValue(value: T): this;
  toProvider(value: (<C extends Container>(container: C) => T) | TClass<IProvider<T>>): this;
  getBindingMeta(opts: { type: TConstValue<typeof BindingValueTypes> }): any;
  setScope(scope: TBindingScope): this;
  setTags(...tags: string[]): this;
  hasTag(tag: string): boolean;
  getTags(): string[];
  getScope(): TBindingScope;
  getValue(container?: Container): T;
  clearCache(): void;
}

class MetadataRegistry extends BaseHelper {
  constructor();
  define<Target extends object, Value = any>(opts: { target: Target; key: string | symbol; value: Value }): void;
  get<Target extends object, Value = any>(opts: { target: Target; key: string | symbol }): Value | undefined;
  has<Target extends object>(opts: { target: Target; key: string | symbol }): boolean;
  delete<Target extends object>(opts: { target: Target; key: string | symbol }): boolean;
  getKeys<Target extends object>(opts: { target: Target }): (string | symbol)[];
  getMethodNames<T = any>(opts: { target: TClass<T> }): string[];
  clearMetadata<T extends object>(opts: { target: T }): void;
  setPropertyMetadata<T extends object>(opts: { target: T; propertyName: string | symbol; metadata: IPropertyMetadata }): void;
  getPropertiesMetadata<T extends object>(opts: { target: T }): Map<string | symbol, IPropertyMetadata> | undefined;
  getPropertyMetadata<T extends object>(opts: { target: T; propertyName: string | symbol }): IPropertyMetadata | undefined;
  setInjectMetadata<T extends object>(opts: { target: T; index: number; metadata: IInjectMetadata }): void;
  getInjectMetadata<T extends object>(opts: { target: T }): IInjectMetadata[] | undefined;
  setInjectableMetadata<T extends object>(opts: { target: T; metadata: IInjectableMetadata }): void;
  getInjectableMetadata<T extends object>(opts: { target: T }): IInjectableMetadata | undefined;
}

class ApplicationError extends Error {
  statusCode: number;
  messageCode?: string;
  constructor(opts: TError);
  static getError(opts: TError): ApplicationError;
}

class Logger {
  static info(message: string, ...args: unknown[]): void;
  static warn(message: string, ...args: unknown[]): void;
  static error(message: string, ...args: unknown[]): void;
  static debug(message: string, ...args: unknown[]): void;  // Only logs when process.env.DEBUG is set
}
```

### Static Classes (Constants)

```typescript
class BindingScopes {
  static readonly SINGLETON = 'singleton';  // 'singleton'
  static readonly TRANSIENT = 'transient';  // 'transient'
}

class BindingValueTypes {
  static readonly CLASS = 'class';        // 'class'
  static readonly VALUE = 'value';        // 'value'
  static readonly PROVIDER = 'provider';  // 'provider'
}

class BindingKeys {
  static build(opts: { namespace: string; key: string }): string;
}
```

### Interfaces

```typescript
interface IProvider<T> {
  value(container: Container): T;
}

interface IBindingTag {
  [name: string]: any;
}

interface IPropertyMetadata {
  bindingKey: string | symbol;
  isOptional?: boolean;
  [key: string]: any;
}

interface IInjectMetadata {
  key: string | symbol;
  index: number;
  isOptional?: boolean;
}

interface IInjectableMetadata {
  scope?: TBindingScope;
  tags?: Record<string, any>;
}
```

### Type Aliases

```typescript
type TNullable<T> = T | undefined | null;
type ValueOrPromise<T> = T | Promise<T>;
type ValueOf<T> = T[keyof T];
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
type TClass<T> = TConstructor<T> & { [property: string]: any };
type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
type TBindingScope = TConstValue<typeof BindingScopes>;  // 'singleton' | 'transient'
type TBindingValueType = TConstValue<typeof BindingValueTypes>;  // 'class' | 'value' | 'provider'
type TError = z.infer<typeof ErrorSchema>;  // { message: string; name?: string; statusCode?: number; messageCode?: string }
```

### Constants

```typescript
const MetadataKeys: {
  PROPERTIES: symbol;  // Symbol.for('ignis:properties')
  INJECT: symbol;      // Symbol.for('ignis:inject')
  INJECTABLE: symbol;  // Symbol.for('ignis:injectable')
};
```

### Exported Singleton

```typescript
const metadataRegistry: MetadataRegistry;  // Pre-instantiated shared MetadataRegistry
```

### Schemas

```typescript
const ErrorSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  statusCode: z.ZodOptional<z.ZodNumber>;
  messageCode: z.ZodOptional<z.ZodString>;
  message: z.ZodString;
}>;
```

### Functions

```typescript
function injectable(metadata: IInjectableMetadata, registry?: MetadataRegistry): ClassDecorator;
function inject(opts: { key: string | symbol; isOptional?: boolean; registry?: MetadataRegistry }): PropertyDecorator & ParameterDecorator;
function isClass<T>(target: any): target is TClass<T>;
function isClassProvider<T>(target: any): target is TClass<IProvider<T>>;
function isClassConstructor(fn: Function): boolean;
function getError(opts: TError): ApplicationError;
```

---

## Error Handling

All container errors are thrown as `ApplicationError` instances, which extend the native `Error` class with additional context.

```typescript
import { ApplicationError, getError, ErrorSchema } from '@venizia/ignis-inversion';

// ApplicationError structure
class ApplicationError extends Error {
  statusCode: number;    // HTTP status code (default: 400)
  messageCode?: string;  // Machine-readable error code
}

// Factory function
const err = getError({
  message: 'Binding not found',
  statusCode: 404,
  messageCode: 'BINDING_NOT_FOUND',
});

// Static factory
const err2 = ApplicationError.getError({
  message: 'Something went wrong',
});

// Zod schema for validation
ErrorSchema.parse({
  message: 'Invalid input',
  statusCode: 400,
});
```

### Common Error Scenarios

**1. Resolving an unbound key:**

```typescript
container.get({ key: 'services.Unknown' });
// throws: ApplicationError { message: 'Binding key: services.Unknown is not bounded in context!' }
```

**2. Resolving an unbound optional key:**

```typescript
const result = container.get({ key: 'services.Unknown', isOptional: true });
// result === undefined (no error thrown)
```

**3. Class binding resolved without container context:**

This happens internally if you call `binding.getValue()` without passing a container on a class or provider binding.

```typescript
const binding = Binding.bind({ key: 'test' });
binding.toClass(SomeClass);
binding.getValue(); // no container passed
// throws: ApplicationError { message: '[getValue] Invalid context/container to instantiate class | type: class | key: test' }
```

**4. Provider binding resolved without container:**

```typescript
const binding = Binding.bind({ key: 'test' });
binding.toProvider((container) => 'value');
binding.getValue();
// throws: ApplicationError { message: '[getValue] Invalid context/container to get provider value | type: provider | key: test' }
```

**5. Accessing wrong resolver type via getBindingMeta:**

```typescript
const binding = Binding.bind({ key: 'test' });
binding.toValue('hello');
binding.getBindingMeta({ type: 'class' });
// throws: ApplicationError { message: '[getBindingMeta] Invalid resolver type, only value is allowd | resolverType: value | optType: class' }
```

**6. Invalid binding key type in getBinding:**

```typescript
container.getBinding({ key: 123 as any });
// throws: ApplicationError { message: '[getBinding] Invalid binding key type | opts: 123 | allowed: [string, symbol, { namespace: string, key: string }]' }
```

**7. @inject used in wrong context:**

```typescript
// If @inject is somehow applied to something that is neither a property nor a constructor parameter:
// throws: ApplicationError { message: '@inject decorator can only be used on class properties or constructor parameters' }
```

**8. BindingKeys.build with empty key:**

```typescript
BindingKeys.build({ namespace: 'services', key: '' });
// throws: ApplicationError { message: '[BindingKeys][build] Invalid key to build | key: ' }
```

---

### Error Catalog

| Scenario | Error Message | Root Cause |
|:---------|:--------------|:-----------|
| Unbound key | `Binding key: {key} is not bounded in context!` | The key was never registered via `bind()` |
| Class without container | `[getValue] Invalid context/container to instantiate class` | `getValue()` called without passing container |
| Provider without container | `[getValue] Invalid context/container to get provider value` | `getValue()` called without passing container |
| Wrong resolver type | `[getBindingMeta] Invalid resolver type, only {actual} is allowd` | Accessing binding metadata with wrong type |
| Invalid key type | `[getBinding] Invalid binding key type` | Key is not string, symbol, or object |
| Invalid decorator usage | `@inject decorator can only be used on class properties or constructor parameters` | Decorator applied to wrong target |
| Empty binding key build | `[BindingKeys][build] Invalid key to build` | `BindingKeys.build()` called with empty key |

> **Note on circular dependencies:** The container does **not** detect circular dependencies at bind-time or resolution-time. If class A depends on class B, and class B depends on class A (both via constructor injection), resolution will enter infinite recursion and crash with a stack overflow. To break circular dependencies, use property injection on one side, or introduce a provider that defers resolution.

---

## API Reference

### Container API

| Method | Signature | Description |
|:-------|:----------|:------------|
| `constructor` | `new Container(opts?: { scope: string })` | Create a new container with optional debug scope |
| `bind` | `bind<T>(opts: { key: string \| symbol }): Binding<T>` | Create and register a new binding |
| `get` | `get<T>(opts: { key: string \| symbol \| { namespace, key }, isOptional?: boolean }): T` | Resolve a dependency by key |
| `gets` | `gets<T>(opts: { bindings: Array<{ key, isOptional? }> }): T[]` | Resolve multiple dependencies at once |
| `getBinding` | `getBinding<T>(opts: { key: string \| symbol \| { namespace, key } }): Binding<T> \| undefined` | Get the raw Binding object without resolving |
| `set` | `set<T>(opts: { binding: Binding<T> }): void` | Insert an externally-created binding |
| `isBound` | `isBound(opts: { key: string \| symbol }): boolean` | Check if a key has a registered binding |
| `unbind` | `unbind(opts: { key: string \| symbol }): boolean` | Remove a binding |
| `resolve` | `resolve<T>(cls: TClass<T>): T` | Instantiate a class with DI (alias for `instantiate`) |
| `instantiate` | `instantiate<T>(cls: TClass<T>): T` | Instantiate a class, injecting constructor params and properties |
| `findByTag` | `findByTag<T>(opts: { tag: string, exclude?: string[] \| Set<string> }): Binding<T>[]` | Find all bindings matching a tag |
| `clear` | `clear(): void` | Clear all singleton caches (bindings remain) |
| `reset` | `reset(): void` | Remove all bindings |
| `getMetadataRegistry` | `getMetadataRegistry(): MetadataRegistry` | Access the global metadata registry |

### Binding API

| Method | Signature | Description |
|:-------|:----------|:------------|
| `constructor` | `new Binding<T>(opts: { key: string })` | Create a binding (prefer `container.bind()`) |
| `Binding.bind` | `static bind<T>(opts: { key: string }): Binding<T>` | Static factory method |
| `toClass` | `toClass(value: TClass<T>): this` | Resolve by instantiating a class with DI |
| `toValue` | `toValue(value: T): this` | Resolve by returning a static value |
| `toProvider` | `toProvider(value: ((container) => T) \| TClass<IProvider<T>>): this` | Resolve via factory function or provider class |
| `setScope` | `setScope(scope: 'singleton' \| 'transient'): this` | Set the binding scope |
| `setTags` | `setTags(...tags: string[]): this` | Add tags to the binding |
| `hasTag` | `hasTag(tag: string): boolean` | Check if binding has a specific tag |
| `getTags` | `getTags(): string[]` | Get all tags |
| `getScope` | `getScope(): TBindingScope` | Get the current scope |
| `getValue` | `getValue(container?: Container): T` | Resolve the binding value |
| `getBindingMeta` | `getBindingMeta(opts: { type: TBindingValueType }): any` | Get the raw resolver value (with type assertion) |
| `clearCache` | `clearCache(): void` | Clear the singleton cache for this binding |

### MetadataRegistry API

| Method | Signature | Description |
|:-------|:----------|:------------|
| `define` | `define(opts: { target, key, value }): void` | Store metadata on a target |
| `get` | `get(opts: { target, key }): Value \| undefined` | Retrieve metadata |
| `has` | `has(opts: { target, key }): boolean` | Check if metadata exists |
| `delete` | `delete(opts: { target, key }): boolean` | Remove metadata |
| `getKeys` | `getKeys(opts: { target }): (string \| symbol)[]` | List all metadata keys |
| `getMethodNames` | `getMethodNames(opts: { target: TClass }): string[]` | List non-constructor method names |
| `clearMetadata` | `clearMetadata(opts: { target }): void` | Remove all metadata from a target |
| `setInjectMetadata` | `setInjectMetadata(opts: { target, index, metadata }): void` | Store constructor `@inject` metadata |
| `getInjectMetadata` | `getInjectMetadata(opts: { target }): IInjectMetadata[] \| undefined` | Retrieve constructor injection metadata |
| `setPropertyMetadata` | `setPropertyMetadata(opts: { target, propertyName, metadata }): void` | Store property `@inject` metadata |
| `getPropertiesMetadata` | `getPropertiesMetadata(opts: { target }): Map<string \| symbol, IPropertyMetadata> \| undefined` | Retrieve all property metadata |
| `getPropertyMetadata` | `getPropertyMetadata(opts: { target, propertyName }): IPropertyMetadata \| undefined` | Retrieve metadata for a single property |
| `setInjectableMetadata` | `setInjectableMetadata(opts: { target, metadata }): void` | Store `@injectable` metadata |
| `getInjectableMetadata` | `getInjectableMetadata(opts: { target }): IInjectableMetadata \| undefined` | Retrieve `@injectable` metadata |

### Decorators API

| Decorator | Signature | Description |
|:----------|:----------|:------------|
| `@injectable` | `injectable(metadata: IInjectableMetadata, registry?: MetadataRegistry): ClassDecorator` | Mark a class as injectable |
| `@inject` | `inject(opts: { key: string \| symbol, isOptional?: boolean, registry?: MetadataRegistry })` | Inject a dependency into a constructor parameter or property |

### Utility Functions

| Function | Signature | Description |
|:---------|:----------|:------------|
| `isClass` | `isClass<T>(target: any): target is TClass<T>` | Check if a value is a class |
| `isClassProvider` | `isClassProvider<T>(target: any): target is TClass<IProvider<T>>` | Check if a value is an `IProvider` class |
| `isClassConstructor` | `isClassConstructor(fn: Function): boolean` | Check if a function is a named class constructor |
| `getError` | `getError(opts: { message, statusCode?, messageCode? }): ApplicationError` | Create an ApplicationError |
| `BindingKeys.build` | `BindingKeys.build(opts: { namespace: string, key: string }): string` | Build a namespaced binding key |

---

## Migration Guide

### From InversifyJS

InversifyJS uses similar concepts but with different API shapes. Here is a mapping:

| InversifyJS | Ignis Inversion | Notes |
|:------------|:----------------|:------|
| `@injectable()` | `@injectable({})` | Ignis requires an options object (can be empty) |
| `@inject(TYPES.Logger)` | `@inject({ key: 'services.Logger' })` | Ignis uses options objects, supports string or symbol keys |
| `container.bind<T>(TYPES.Logger).to(Logger)` | `container.bind({ key: 'services.Logger' }).toClass(Logger)` | Fluent chain on options-based `bind()` |
| `container.bind<T>(TYPES.Logger).to(Logger).inSingletonScope()` | `container.bind({ key: 'services.Logger' }).toClass(Logger).setScope('singleton')` | Scope via `setScope()` |
| `container.bind<T>(TYPES.Config).toConstantValue(val)` | `container.bind({ key: 'config' }).toValue(val)` | `toValue` instead of `toConstantValue` |
| `container.bind<T>(TYPES.Pool).toDynamicValue((ctx) => ...)` | `container.bind({ key: 'pool' }).toProvider((container) => ...)` | Provider receives container directly, no request context |
| `container.get<T>(TYPES.Logger)` | `container.get<T>({ key: 'services.Logger' })` | Options object for `get()` |
| `@optional()` + `@inject()` | `@inject({ key: '...', isOptional: true })` | Single decorator with `isOptional` flag |
| `container.isBound(TYPES.Logger)` | `container.isBound({ key: 'services.Logger' })` | Options object |
| `container.unbind(TYPES.Logger)` | `container.unbind({ key: 'services.Logger' })` | Options object |
| `@tagged('name', value)` | `binding.setTags('name')` | Tags are set on bindings, not decorators |
| `container.getAll<T>(TYPES.Plugin)` | `container.findByTag({ tag: 'plugins' }).map(b => b.getValue(container))` | Use tag-based discovery + manual resolution |

**Example migration:**

```typescript
// InversifyJS
const TYPES = {
  Logger: Symbol.for('Logger'),
  UserRepo: Symbol.for('UserRepo'),
  UserService: Symbol.for('UserService'),
};

@injectable()
class UserService {
  constructor(
    @inject(TYPES.UserRepo) private repo: UserRepository,
    @inject(TYPES.Logger) private logger: Logger,
  ) {}
}

const container = new InversifyContainer();
container.bind<Logger>(TYPES.Logger).to(Logger).inSingletonScope();
container.bind<UserRepository>(TYPES.UserRepo).to(UserRepository);
container.bind<UserService>(TYPES.UserService).to(UserService);
const svc = container.get<UserService>(TYPES.UserService);
```

```typescript
// Ignis Inversion equivalent
@injectable({})
class UserService {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private repo: UserRepository,
    @inject({ key: 'services.Logger' }) private logger: Logger,
  ) {}
}

const container = new Container();
container.bind({ key: 'services.Logger' }).toClass(Logger).setScope('singleton');
container.bind({ key: 'repositories.UserRepository' }).toClass(UserRepository);
container.bind({ key: 'services.UserService' }).toClass(UserService);
const svc = container.get<UserService>({ key: 'services.UserService' });
```

---

### From tsyringe

tsyringe uses a token-based approach with a global container. Here is the mapping:

| tsyringe | Ignis Inversion | Notes |
|:---------|:----------------|:------|
| `@injectable()` | `@injectable({})` | Similar, options object required |
| `@inject('token')` | `@inject({ key: 'token' })` | Options object |
| `container.register('token', { useClass: Cls })` | `container.bind({ key: 'token' }).toClass(Cls)` | Fluent API instead of config object |
| `container.register('token', { useValue: val })` | `container.bind({ key: 'token' }).toValue(val)` | |
| `container.register('token', { useFactory: fn })` | `container.bind({ key: 'token' }).toProvider(fn)` | Factory/provider |
| `container.resolve(Cls)` | `container.resolve(Cls)` or `container.instantiate(Cls)` | Nearly identical |
| `@singleton()` | `@injectable({})` + `.setScope('singleton')` | Scope on binding, not decorator |
| `container.createChildContainer()` | N/A | Ignis has no child containers |
| `@injectAll('token')` | `container.findByTag({ tag }).map(b => b.getValue(container))` | Use tag discovery |

**Key differences from tsyringe:**

- Ignis does not have a global container -- you always create explicit `Container` instances.
- Ignis has no child containers. Each container is independent.
- Ignis uses namespace-based string keys with auto-tagging, rather than string/symbol tokens.
- Property injection is supported natively in Ignis (tsyringe only supports constructor injection).

---

## Troubleshooting

### Forgetting `experimentalDecorators` or `emitDecoratorMetadata`

**Symptom:** `@inject` and `@injectable` decorators have no effect. Dependencies are `undefined` at runtime. No error is thrown.

**Fix:** Add both flags to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

Both are required. `experimentalDecorators` enables decorator syntax, while `emitDecoratorMetadata` causes TypeScript to emit `Reflect.metadata()` calls that store parameter type information.

---

### Wrong Binding Key Format

**Symptom:** `Binding key: X is not bounded in context!` even though you registered the binding.

**Common causes:**

- Mismatched key strings (typo, different casing).
- Using `Symbol()` instead of `Symbol.for()` -- each `Symbol()` call creates a unique symbol, so `Symbol('key') !== Symbol('key')`.
- Registering with `'services.UserService'` but resolving with `'service.UserService'` (missing 's').

**Fix:** Use `container.isBound({ key })` to verify the exact key exists. Consider using `BindingKeys.build()` to construct keys consistently.

---

### Optional vs Required Dependencies

**Symptom:** Application crashes with `Binding key: X is not bounded in context!` for a dependency that should be optional.

**Fix:** Add `isOptional: true` to the `@inject` options:

```typescript
@inject({ key: 'services.Analytics', isOptional: true })
private analytics?: AnalyticsService;
```

---

### Property Injection Not Working

**Symptom:** Property decorated with `@inject` is `undefined` at runtime.

**Possible causes:**

1. Missing `experimentalDecorators` / `emitDecoratorMetadata` in tsconfig.
2. Accessing the property in the constructor -- property injection happens **after** the constructor runs. If you need the dependency in the constructor, use constructor injection instead.
3. The class was instantiated with `new MyClass()` instead of `container.get()` or `container.instantiate()`. Manual instantiation bypasses the DI container entirely.

---

### Singleton Returns Different Instances

**Symptom:** A binding set to `setScope('singleton')` returns different instances.

**Possible causes:**

1. The key string does not match exactly between `bind()` and `get()`.
2. `container.clear()` was called between resolutions, which wipes all singleton caches.
3. The binding was `unbind()`-ed and re-`bind()`-ed, creating a new `Binding` instance with no cache.

---

### Circular Dependencies

**Symptom:** Stack overflow error during resolution.

**Cause:** Class A constructor-injects Class B, and Class B constructor-injects Class A.

**Fix:** Break the cycle by using property injection on one side:

```typescript
// Instead of:
class A {
  constructor(@inject({ key: 'B' }) private b: B) {}
}
class B {
  constructor(@inject({ key: 'A' }) private a: A) {}
}

// Use property injection on one side:
class A {
  constructor(@inject({ key: 'B' }) private b: B) {}
}
class B {
  @inject({ key: 'A' })
  private a!: A;  // Property injection breaks the cycle
}
```

Alternatively, use a provider to defer resolution:

```typescript
container.bind({ key: 'A' }).toProvider((container) => {
  const a = new A();
  a.b = container.get({ key: 'B' });
  return a;
});
```

---

### Debug Logging

Set the `DEBUG` environment variable to enable debug-level logging from the `MetadataRegistry`:

```bash
DEBUG=1 bun run start
```

This will print messages like:

```
[DEBUG] [define] Set metadata | target: UserService | key: Symbol(ignis:inject) | value: [...]
```

This is helpful for verifying that decorators are correctly storing metadata.

---

## License

[MIT](./LICENSE.md)
