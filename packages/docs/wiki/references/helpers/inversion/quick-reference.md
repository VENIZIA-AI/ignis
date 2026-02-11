# Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| **Container** | BaseHelper | Central registry -- manages bindings and resolution |
| **Binding** | BaseHelper | Fluent configuration for how a dependency is resolved |
| **MetadataRegistry** | BaseHelper | Singleton store for all decorator metadata (`reflect-metadata`) |

## Core Concepts

| Concept | Description |
|---------|-------------|
| **@inject** | Decorator for constructor parameter or property injection |
| **@injectable** | Decorator marking a class with scope/tag metadata |
| **BindingKeys** | Utility for building namespaced binding keys |
| **BindingScopes** | `SINGLETON` (cached) or `TRANSIENT` (new each time) |

::: details Import Paths
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
:::
