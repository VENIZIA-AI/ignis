---
title: Core/Helpers Decoupling
description: Decoupled @venizia/ignis from runtime re-export of @venizia/ignis-helpers. Core now uses type-only re-exports for helpers types and explicit re-exports for DI-specific inversion symbols.
---

# Changelog - 2026-02-26

## Core/Helpers Decoupling

Removed the tight coupling between `@venizia/ignis` (core) and `@venizia/ignis-helpers` by replacing the runtime barrel re-export with a type-only re-export. This creates a clean separation where core = framework layer and helpers = standalone utilities.

## Overview

- **Removed** `export * from '@venizia/ignis-helpers'` from core's barrel export
- **Added** `export type * from '@venizia/ignis-helpers'` for type-only re-exports (TypeScript 5.0+)
- **Expanded** explicit DI-specific inversion re-exports to keep foundational DI symbols accessible from core
- **Updated** ~28 example files and ~12 internal core files to import runtime helpers directly from `@venizia/ignis-helpers`

## Breaking Changes

> [!WARNING]
> This is a breaking change for consumers importing runtime helpers symbols from `@venizia/ignis`.

### 1. Runtime helper symbols no longer available from `@venizia/ignis`

**Before:**
```typescript
// All helpers were available from core
import { LoggerFactory, applicationEnvironment, DataTypes, getUID, HTTP, int, DiskHelper } from '@venizia/ignis';
```

**After:**
```typescript
// Runtime helpers must be imported from @venizia/ignis-helpers
import { LoggerFactory, applicationEnvironment, DataTypes, getUID, HTTP, int, DiskHelper } from '@venizia/ignis-helpers';

// Types are still available from core (via export type *)
import type { AnyObject, FC, PropsWithChildren, TOptions } from '@venizia/ignis';

// Framework symbols remain in core (unchanged)
import { BaseApplication, BaseController, controller, get, inject } from '@venizia/ignis';
```

### 2. What stays in `@venizia/ignis`

| Category | Symbols |
|----------|---------|
| **DI Primitives** | `Binding`, `BindingKeys`, `BindingScopes`, `BindingValueTypes`, `IProvider`, `isClass`, `isClassProvider`, `isClassConstructor`, `TBindingScope`, `TBindingValueType`, `IBindingTag` |
| **Framework Base** | `BaseApplication`, `BaseController`, `BaseService`, `BaseEntity`, all repositories, all decorators |
| **Components** | `HealthCheckComponent`, `SwaggerComponent`, `AuthenticationComponent`, etc. |
| **All types** | Every type from both `@venizia/ignis-helpers` and `@venizia/ignis-inversion` (via `export type *`) |

### 3. What moves to `@venizia/ignis-helpers`

| Symbol | Category |
|--------|----------|
| `LoggerFactory` | Logger |
| `applicationEnvironment` | Environment |
| `int`, `float`, `toBoolean` | Parse utilities |
| `getUID` | UID utilities |
| `DataTypes`, `HTTP` | Constants |
| `Environment` | Environment module |
| `DiskHelper`, `MemoryStorageHelper` | Storage |
| `RedisHelper`, `DefaultRedisHelper` | Redis |
| `BullMQHelper`, `QueueHelper` | Queue |
| `AnyObject`, `FC`, `PropsWithChildren` | Types (runtime re-export removed) |

## Design Decision

### Why `export type *` instead of `export *`?

The previous `export * from '@venizia/ignis-helpers'` created several problems:

1. **Tight coupling** - Core's public API surface included every helpers symbol, making it hard to version independently
2. **Ambiguous imports** - Consumers couldn't tell if a symbol belonged to core or helpers
3. **Bundle bloat** - Tree-shaking couldn't eliminate unused helpers re-exports in some bundlers

The new approach using `export type *` (TypeScript 5.0+):
- **Types remain accessible** - `import type { AnyObject } from '@venizia/ignis'` still works
- **Runtime is explicit** - Runtime helpers must be imported from their source package
- **Clean API boundary** - Core only exports its own runtime symbols + DI primitives from inversion

## Files Changed

### Core Package (`packages/core-server`)

| File | Changes |
|------|---------|
| `src/helpers/index.ts` | Changed `export * from '@venizia/ignis-helpers'` to `export type * from '@venizia/ignis-helpers'` |
| `src/helpers/inversion/index.ts` | Expanded DI-specific re-exports (`IProvider`, `isClass`, `isClassProvider`, `isClassConstructor`, `TBindingScope`, `TBindingValueType`, `IBindingTag`) |
| `src/base/models/enrichers/data-type.enricher.ts` | Import `AnyType` from `@venizia/ignis-helpers` |
| `src/components/mail/**` (12 files) | Import runtime symbols (`BaseHelper`, `getError`, `RedisHelper`, `QueueHelper`, etc.) from `@venizia/ignis-helpers` |

### Examples (`examples/`)

| Directory | Files Changed | Symbols Moved |
|-----------|---------------|---------------|
| `vert/` | 17 files | `LoggerFactory`, `applicationEnvironment`, `int`, `HTTP`, `DataTypes`, `getUID`, `DiskHelper`, `Environment` |
| `rpc-api-server/` | 8 files + package.json | `LoggerFactory`, `applicationEnvironment`, `int`, `AnyObject`, `FC`, `PropsWithChildren` |
| `websocket-test/` | 2 files | `LoggerFactory`, `WebSocketServerHelper` |
| `socket-io-test/` | 2 files | `LoggerFactory`, `SocketIOServerHelper` |
| `5-mins-qs/` | 1 file + package.json | `LoggerFactory` |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a previous version.

### Step 1: Add `@venizia/ignis-helpers` dependency

If your project doesn't already depend on `@venizia/ignis-helpers`, add it:

```bash
bun add @venizia/ignis-helpers
```

### Step 2: Split imports

Find all imports from `@venizia/ignis` that include helpers-specific runtime symbols and split them:

```typescript
// BEFORE
import { BaseController, controller, get, LoggerFactory, HTTP, DataTypes } from '@venizia/ignis';

// AFTER
import { BaseController, controller, get } from '@venizia/ignis';
import { LoggerFactory, HTTP, DataTypes } from '@venizia/ignis-helpers';
```

### Step 3: Type-only imports remain unchanged

If you only use type imports, no changes needed:

```typescript
// This still works (unchanged)
import type { AnyObject, FC, TOptions } from '@venizia/ignis';
```

### Step 4: Verify build

```bash
bun run rebuild
```

Look for errors like `"X" is not exported from "@venizia/ignis"` - these indicate runtime symbols that need to be moved to `@venizia/ignis-helpers` imports.
