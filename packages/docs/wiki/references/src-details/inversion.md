# Package: `@venizia/ignis-inversion`

## Overview

The `@venizia/ignis-inversion` package provides a standalone, lightweight Dependency Injection (DI) and Inversion of Control (IoC) container. This package was extracted from `@venizia/ignis-helpers` to enable independent usage and better modularity.

## Package Information

| Property | Value |
|----------|-------|
| **Package Name** | `@venizia/ignis-inversion` |
| **Location** | `packages/inversion/` |
| **Purpose** | Standalone DI/IoC container |
| **Dependencies** | `lodash`, `reflect-metadata`, `zod` |

## Key Features

- **Flexible Binding Strategies**: Class, Value, and Provider-based bindings
- **Scope Management**: Singleton and Transient scopes
- **Metadata-driven Injection**: Constructor and property injection via decorators
- **Tag-based Discovery**: Find bindings by tag for modular composition
- **Type-safe**: Full TypeScript support with generics

---

## Core Components

### Binding Class

The `Binding<T>` class represents a single dependency registration in the container.

#### Binding Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `toClass(cls)` | Bind to a class constructor | `this` |
| `toValue(value)` | Bind to a static value | `this` |
| `toProvider(fn)` | Bind to a provider function or class | `this` |
| `setScope(scope)` | Set binding scope (SINGLETON/TRANSIENT) | `this` |
| `setTags(...tags)` | Add tags for discovery | `this` |
| `getValue(container)` | Resolve the bound value | `T` |
| `clearCache()` | Clear singleton cache | `void` |

#### Binding Example

```typescript
import { Binding, BindingScopes } from '@venizia/ignis-inversion';

// Create a binding
const binding = new Binding<MyService>({ key: 'services.MyService' })
  .toClass(MyService)
  .setScope(BindingScopes.SINGLETON)
  .setTags('services', 'core');
```

### Container Class

The `Container` class is the main DI container for managing bindings and resolving dependencies.

#### Container Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `bind<T>({ key })` | Create a new binding | `Binding<T>` |
| `isBound({ key })` | Check if binding exists | `boolean` |
| `getBinding<T>({ key })` | Get a specific binding | `Binding<T> \| undefined` |
| `unbind({ key })` | Remove a binding | `boolean` |
| `get<T>({ key, isOptional? })` | Resolve a dependency | `T \| undefined` |
| `resolve<T>(cls)` | Instantiate a class with injection | `T` |
| `instantiate<T>(cls)` | Same as resolve | `T` |
| `findByTag<T>({ tag })` | Find bindings by tag | `Binding<T>[]` |
| `clear()` | Clear singleton caches | `void` |
| `reset()` | Clear all bindings | `void` |

#### Container Example

```typescript
import { Container, BindingScopes } from '@venizia/ignis-inversion';

const container = new Container({ scope: 'MyApp' });

// Bind a class
container.bind<UserService>({ key: 'services.UserService' })
  .toClass(UserService)
  .setScope(BindingScopes.SINGLETON);

// Bind a value
container.bind<string>({ key: 'config.apiUrl' })
  .toValue('https://api.example.com');

// Bind a provider
container.bind<DatabaseConnection>({ key: 'database' })
  .toProvider((container) => {
    const config = container.get<Config>({ key: 'config' });
    return new DatabaseConnection(config.dbUrl);
  });

// Resolve dependencies
const userService = container.get<UserService>({ key: 'services.UserService' });
```

### MetadataRegistry Class

The `MetadataRegistry` stores and retrieves decorator metadata for DI.

#### Registry Methods

| Method | Description |
|--------|-------------|
| `define({ target, key, value })` | Define metadata on a target |
| `get({ target, key })` | Get metadata from a target |
| `has({ target, key })` | Check if metadata exists |
| `delete({ target, key })` | Delete metadata |
| `getKeys({ target })` | Get all metadata keys |
| `setPropertyMetadata(...)` | Set property injection metadata |
| `getPropertiesMetadata(...)` | Get all property metadata |
| `setInjectMetadata(...)` | Set constructor injection metadata |
| `getInjectMetadata(...)` | Get constructor injection metadata |

---

## Types and Interfaces

### Binding Scopes

```typescript
import { BindingScopes } from '@venizia/ignis-inversion';

BindingScopes.SINGLETON  // Single instance, reused
BindingScopes.TRANSIENT  // New instance each request (default)
```

### Binding Value Types

```typescript
import { BindingValueTypes } from '@venizia/ignis-inversion';

BindingValueTypes.CLASS     // Bind to class constructor
BindingValueTypes.VALUE     // Bind to static value
BindingValueTypes.PROVIDER  // Bind to provider function/class
```

### Provider Interface

```typescript
interface IProvider<T> {
  value(container: Container): T;
}

// Example provider class
class DatabaseProvider implements IProvider<DatabaseConnection> {
  value(container: Container): DatabaseConnection {
    const config = container.get<Config>({ key: 'config' });
    return new DatabaseConnection(config.dbUrl);
  }
}
```

### BindingKeys Helper

```typescript
import { BindingKeys } from '@venizia/ignis-inversion';

const key = BindingKeys.build({ namespace: 'services', key: 'UserService' });
// Result: 'services.UserService'
```

### Type Definitions

| Type | Description |
|------|-------------|
| `TNullable<T>` | `T \| undefined \| null` |
| `TClass<T>` | Class constructor type |
| `TConstructor<T>` | Generic constructor |
| `TBindingScope` | `'singleton' \| 'transient'` |
| `IPropertyMetadata` | Property injection metadata |
| `IInjectMetadata` | Constructor injection metadata |


## Injection Metadata

### Property Injection

```typescript
interface IPropertyMetadata {
  bindingKey: string | symbol;
  isOptional?: boolean;
  [key: string]: any;
}
```

### Constructor Injection

```typescript
interface IInjectMetadata {
  key: string | symbol;
  index: number;
  isOptional?: boolean;
}
```


## Project Structure

```
packages/inversion/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main exports + reflect-metadata import
│   ├── container.ts          # Container and Binding classes
│   ├── registry.ts           # MetadataRegistry class
│   └── common/
│       ├── index.ts          # Common exports
│       ├── types.ts          # Types, interfaces, BindingScopes, etc.
│       ├── keys.ts           # MetadataKeys symbols
│       ├── app-error.ts      # ApplicationError class
│       ├── base-helper.ts    # BaseHelper base class
│       └── logger.ts         # Simple Logger class
├── scripts/
│   ├── build.sh
│   ├── clean.sh
│   └── rebuild.sh
└── dist/                     # Built output
```


## Usage Examples

### Basic Container Usage

```typescript
import { Container, BindingScopes } from '@venizia/ignis-inversion';

// Create container
const container = new Container();

// Register services
container.bind({ key: 'logger' }).toValue(console);
container.bind({ key: 'services.UserService' })
  .toClass(UserService)
  .setScope(BindingScopes.SINGLETON);

// Resolve
const logger = container.get({ key: 'logger' });
const userService = container.get({ key: 'services.UserService' });
```

### Using Providers

```typescript
import { Container, IProvider } from '@venizia/ignis-inversion';

// Function provider
container.bind({ key: 'database' })
  .toProvider((container) => {
    return new Database(container.get({ key: 'config.dbUrl' }));
  });

// Class provider
class ConfigProvider implements IProvider<Config> {
  value(container: Container): Config {
    return {
      env: process.env.NODE_ENV,
      port: parseInt(process.env.PORT || '3000'),
    };
  }
}

container.bind({ key: 'config' }).toProvider(ConfigProvider);
```

### Tag-based Discovery

```typescript
// Register with tags
container.bind({ key: 'handlers.UserHandler' })
  .toClass(UserHandler)
  .setTags('handlers', 'user');

container.bind({ key: 'handlers.OrderHandler' })
  .toClass(OrderHandler)
  .setTags('handlers', 'order');

// Find all handlers
const handlers = container.findByTag({ tag: 'handlers' });
handlers.forEach(binding => {
  const handler = binding.getValue(container);
  // Use handler...
});
```

### Optional Dependencies

```typescript
// Get optional dependency (returns undefined if not bound)
const cache = container.get<CacheService>({
  key: 'services.CacheService',
  isOptional: true
});

if (cache) {
  // Use cache service
}
```


## Integration with Framework

The core `@venizia/ignis` package extends this base inversion package with:

- **ApplicationLogger integration**: Container with structured logging
- **Framework-specific metadata**: Controllers, models, repositories, data sources
- **Decorator implementations**: `@inject`, `@controller`, `@service`, etc.

For framework usage, import from `@venizia/ignis`. For standalone DI container usage, import directly from `@venizia/ignis-inversion`.

```typescript
// Standalone usage
import { Container, Binding } from '@venizia/ignis-inversion';

// Framework usage (includes logging and framework metadata)
import { Container, inject, service } from '@venizia/ignis';
```


## Building the Package

```bash
cd packages/inversion

# Build
bun run build

# Clean
bun run clean

# Rebuild (clean + build)
bun run rebuild
```
