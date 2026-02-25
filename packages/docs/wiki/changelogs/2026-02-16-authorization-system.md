---
title: Authorization System & Auth Module Refactor
description: Enforcer-based authorization with RBAC, voters, Casbin integration, filtered adapters, and comprehensive auth module restructuring
---

# Changelog - 2026-02-16 (Updated 2026-02-25)

## Authorization System & Auth Module Refactor

This release introduces a complete authorization system alongside a major restructuring of the authentication module. The authorization system supports Casbin integration and custom enforcers, following the same registry-based architecture as authentication.

> [!NOTE]
> **2026-02-25 Update:** Major refactoring -- removed `DefaultAuthorizationEnforcer` and `AbilityBuilder`, moved enforcer options to co-locate with registry registration, added `BaseFilteredAdapter` and `DrizzleCasbinAdapter`, introduced `CasbinRuleVariants` constants, simplified `IAuthorizeOptions`, merged authorization flow from 8 steps to 7.

## Overview

- **Authorization System**: Enforcer-based authorization with voter pattern, rules caching, and role shortcuts
- **Casbin Enforcer**: Integration with the `casbin` library for policy-engine-based authorization (optional peer dep)
- **Filtered Adapters**: `BaseFilteredAdapter` (template method) + `DrizzleCasbinAdapter` (raw SQL via Drizzle) for loading user-scoped policies
- **Registry-based Registration**: Enforcer class, name, type, and options co-located in `AuthorizationEnforcerRegistry.register()`
- **Auth Module Restructure**: Consistent file organization across authenticate and authorize modules
- **Import Cleanup**: Replaced barrel `@/` imports with specific file paths to prevent circular dependencies
- **Helpers Rename**: `packages/helpers/src/helpers/` renamed to `packages/helpers/src/modules/`
- **Terminology Update**: `requirement` renamed to `spec`, `abilities` renamed to `rules` throughout the authorization module

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. `IAuthenticateRouteConfig` Replaced by `IAuthRouteConfig`

The route config interface now supports both authentication and authorization:

**Before:**
```typescript
import { IAuthenticateRouteConfig } from '@venizia/ignis';

interface MyRouteConfig extends IAuthenticateRouteConfig {
  // authenticate only
}
```

**After:**
```typescript
import { IAuthRouteConfig } from '@venizia/ignis';

interface MyRouteConfig extends IAuthRouteConfig {
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}
```

### 2. Helpers Source Directory Rename

**Before:**
```
packages/helpers/src/helpers/
```

**After:**
```
packages/helpers/src/modules/
```

Internal imports changed from `@/helpers/...` to `@/modules/...`. External imports via `@venizia/ignis-helpers` are **unaffected**.

### 3. Authorization Terminology: `requirement` to `spec`

**Before:**
```typescript
authorize: { requirement: { action: 'read', resource: 'Article' } }
```

**After:**
```typescript
import { AuthorizationActions } from '@venizia/ignis';

authorize: { action: AuthorizationActions.READ, resource: 'Article' }
// or
authorize({ spec: { action: AuthorizationActions.READ, resource: 'Article' } })
```

## New Features

### Authorization System

**Files:** `packages/core/src/components/auth/authorize/`

**Problem:** Ignis had authentication but no authorization. Developers needed to implement their own permission checking logic.

**Solution:** A pluggable enforcer-based authorization system that integrates seamlessly with the existing authentication middleware chain. Setup is a three-step process: bind global options, register the component, then register enforcers via the registry.

```typescript
import {
  AuthorizeComponent,
  AuthorizeBindingKeys,
  AuthorizationEnforcerRegistry,
  AuthorizationEnforcerTypes,
  CasbinAuthorizationEnforcer,
  CasbinEnforcerModelDrivers,
  DrizzleCasbinAdapter,
  IAuthorizeOptions,
} from '@venizia/ignis';

// Step 1: Global options (simplified — no enforcer-specific config)
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  defaultDecision: 'deny',
  alwaysAllowRoles: ['999_super-admin'],
});

// Step 2: Register component
this.component(AuthorizeComponent);

// Step 3: Register enforcer(s) with co-located options
AuthorizationEnforcerRegistry.getInstance().register({
  container: this,
  enforcers: [{
    enforcer: CasbinAuthorizationEnforcer,
    name: 'casbin',
    type: AuthorizationEnforcerTypes.CASBIN,
    options: {
      model: { driver: CasbinEnforcerModelDrivers.FILE, definition: './security/model.conf' },
      adapter: new DrizzleCasbinAdapter({ dataSource, entities: { ... } }),
      cached: { use: false },
    },
  }],
});
```

**Benefits:**
- Role-based shortcuts (`alwaysAllowRoles`, `allowedRoles`)
- Voter pattern for custom authorization logic
- Rules caching per-request on Hono context
- CRUD factory integration with per-route overrides
- Casbin integration as optional peer dependency
- Filtered adapter pattern for loading user-scoped policies
- Registry-based enforcer registration with co-located options

### Authorization Middleware Pipeline (7 Steps)

| Step | Action | Short-circuits? |
|------|--------|-----------------|
| 1 | Check `SKIP_AUTHORIZATION` flag | Yes |
| 2 | Get authenticated user | Yes (401) |
| 3 | Check role-based shortcuts (`alwaysAllowRoles` + `allowedRoles`) | Yes |
| 4 | Execute voters | Yes (DENY/ALLOW) |
| 5 | Resolve enforcer | No |
| 6 | Build/cache rules | No |
| 7 | Evaluate via enforcer | Yes (403) |

### CRUD Factory Authorization Support

```typescript
import { AuthorizationActions } from '@venizia/ignis';

ControllerFactory.defineCrudController({
  entity: Article,
  repository: { name: 'ArticleRepository' },
  controller: { name: 'ArticleController', basePath: '/articles' },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  authorize: { action: AuthorizationActions.READ, resource: 'Article' },
  routes: {
    find: { authenticate: { skip: true } },           // Public
    deleteById: { authorize: { action: AuthorizationActions.DELETE, resource: 'Article' } }, // Override
    count: { authorize: { skip: true } },              // Skip authz only
  },
});
```

### Shared AbstractAuthRegistry

**File:** `packages/core/src/components/auth/base/abstract-auth-registry.ts`

Both `AuthenticationStrategyRegistry` and `AuthorizationEnforcerRegistry` now extend a shared `AbstractAuthRegistry<T>` base class, eliminating duplicate registration/resolution logic.

### AuthorizationRole Value Object

**File:** `packages/core/src/components/auth/authorize/models/authorization-role.model.ts`

Priority-based role comparison with identifier formatting:

```typescript
import { AuthorizationRoles } from '@venizia/ignis';

AuthorizationRoles.SUPER_ADMIN.identifier;  // '999_super-admin'
AuthorizationRoles.ADMIN.isHigherThan({ target: AuthorizationRoles.USER }); // true
```

## Refactoring

### Auth Module Restructure

Both authenticate and authorize modules now follow a consistent internal structure:

```
auth/
├── authenticate/
│   ├── common/          # Constants, keys, types
│   ├── controllers/     # Auth controller factory
│   ├── middlewares/      # authenticate() middleware
│   ├── providers/       # AuthenticationProvider
│   ├── services/        # JWTTokenService, BasicTokenService
│   ├── strategies/      # JWT, Basic strategies + registry
│   └── index.ts
├── authorize/
│   ├── adapters/        # BaseFilteredAdapter, DrizzleCasbinAdapter
│   ├── common/          # Constants (CasbinRuleVariants, etc.), keys, types
│   ├── enforcers/       # CasbinAuthorizationEnforcer + registry
│   ├── middlewares/      # authorize() middleware
│   ├── models/          # AuthorizationRole
│   ├── providers/       # AuthorizationProvider
│   └── index.ts
├── base/                # AbstractAuthRegistry (shared)
└── models/              # Entity column helpers (User, Role, etc.)
```

### Circular Import Prevention

All barrel `@/` imports within the auth module and controller files were replaced with specific file path imports:

**Before:**
```typescript
import { IAuthRouteConfig, TContext } from '@/base/controllers';
import { getError } from '@/helpers';
```

**After:**
```typescript
import { IAuthRouteConfig, TContext } from '@/base/controllers/common/types';
import { getError } from '@venizia/ignis-helpers';
```

**Pattern applied across 22+ files** -- prevents circular dependency chains caused by barrel re-exports.

### Singleton Convenience Functions

Moved standalone `authenticate()` and `authorize()` functions from provider modules to middleware modules for clearer separation:

```
authenticate/providers/ → authenticate/middlewares/authenticate.middleware.ts
authorize/providers/    → authorize/middlewares/authorize.middleware.ts
```

## Files Changed

### Core Package (`packages/core`) -- New Files

| File | Changes |
|------|---------|
| `src/components/auth/authorize/common/constants.ts` | Authorization, AuthorizationActions, AuthorizationDecisions, AuthorizationRoles, AuthorizationEnforcerTypes, CasbinEnforcerCachedDrivers, CasbinEnforcerModelDrivers, CasbinRuleVariants constants |
| `src/components/auth/authorize/common/keys.ts` | AuthorizeBindingKeys (OPTIONS, ALWAYS_ALLOW_ROLES, enforcerOptions(name)) |
| `src/components/auth/authorize/common/types.ts` | IAuthorizationEnforcer, IAuthorizationSpec, IAuthorizeOptions, ICasbinEnforcerOptions, TAuthorizationVoter, TAuthorizeFn |
| `src/components/auth/authorize/common/index.ts` | Barrel export for common |
| `src/components/auth/authorize/adapters/base-filtered.ts` | BaseFilteredAdapter -- abstract template method pattern for casbin FilteredAdapter |
| `src/components/auth/authorize/adapters/drizzle-casbin.ts` | DrizzleCasbinAdapter -- Drizzle-based read-only FilteredAdapter with raw SQL |
| `src/components/auth/authorize/component.ts` | AuthorizeComponent -- validates options, binds alwaysAllowRoles |
| `src/components/auth/authorize/enforcers/enforcer-registry.ts` | AuthorizationEnforcerRegistry singleton with type-discriminated register() |
| `src/components/auth/authorize/enforcers/casbin.enforcer.ts` | CasbinAuthorizationEnforcer (optional peer dep, injects options from registry) |
| `src/components/auth/authorize/middlewares/authorize.middleware.ts` | authorize() standalone function |
| `src/components/auth/authorize/providers/authorization.provider.ts` | AuthorizationProvider -- middleware factory |
| `src/components/auth/authorize/models/authorization-role.model.ts` | AuthorizationRole value object |
| `src/components/auth/base/abstract-auth-registry.ts` | AbstractAuthRegistry shared base class |
| `src/__tests__/authorize/authorize.test.ts` | 45 authorization tests |

### Core Package (`packages/core`) -- Modified Files

| File | Changes |
|------|---------|
| `src/base/controllers/abstract.ts` | Added authorize middleware injection in getRouteConfigs() and getJSXRouteConfigs() |
| `src/base/controllers/common/types.ts` | IAuthRouteConfig -- added authorize field, TRouteAuthorizeConfig type |
| `src/base/controllers/factory/definition.ts` | resolveRouteAuthorize() for CRUD factory authorization |
| `src/base/controllers/factory/controller.ts` | authorize support in defineControllerRouteConfigs() |
| `src/components/auth/authenticate/strategies/strategy-registry.ts` | Refactored to extend AbstractAuthRegistry |
| `src/components/auth/authenticate/index.ts` | Updated barrel exports |
| `src/components/auth/index.ts` | Added authorize, base, and models exports |
| `src/base/metadata/routes.ts` | Updated IAuthRouteConfig references |

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/helpers/` → `src/modules/` | Directory rename -- 59 internal import paths updated |
| `src/index.ts` | Updated barrel export path |
| `package.json` | Updated 7 sub-export paths in exports field |

### Tests

| File | Changes |
|------|---------|
| `src/__tests__/authorize/authorize.test.ts` | 45 tests covering: DefaultAuthorizationEnforcer, CasbinAuthorizationEnforcer, AuthorizationProvider middleware, AbilityBuilder, AuthorizationRole, voters, conditions, role shortcuts |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a previous version.

### Step 1: Update `IAuthenticateRouteConfig` References

If you used `IAuthenticateRouteConfig` in custom controllers, rename to `IAuthRouteConfig`:

```typescript
// Before
import { IAuthenticateRouteConfig } from '@venizia/ignis';

// After
import { IAuthRouteConfig } from '@venizia/ignis';
```

### Step 2: Add Authorization (Optional)

If you want authorization, follow the three-step setup:

```typescript
import {
  AuthorizeBindingKeys,
  AuthorizeComponent,
  AuthorizationEnforcerRegistry,
  AuthorizationEnforcerTypes,
  CasbinAuthorizationEnforcer,
  CasbinEnforcerModelDrivers,
  IAuthorizeOptions,
} from '@venizia/ignis';

// Step 1: Bind global options (simplified — no enforcer-specific config)
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  defaultDecision: 'deny',
  alwaysAllowRoles: ['999_super-admin'],
});

// Step 2: Register component
this.component(AuthorizeComponent);

// Step 3: Register enforcer(s) with co-located options
AuthorizationEnforcerRegistry.getInstance().register({
  container: this,
  enforcers: [{
    enforcer: CasbinAuthorizationEnforcer,
    name: 'casbin',
    type: AuthorizationEnforcerTypes.CASBIN,
    options: {
      model: { driver: CasbinEnforcerModelDrivers.FILE, definition: './security/model.conf' },
      cached: { use: false },
    },
  }],
});
```

### Step 3: Add Authorization to Routes

Add `authorize` to route configs:

```typescript
import { AuthorizationActions } from '@venizia/ignis';

this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },
    authorize: { action: AuthorizationActions.READ, resource: 'Article' },
    // ...
  },
  handler: async (context) => { ... },
});
```

### Step 4: Update Internal Imports (If Extending Framework)

If you import from internal paths (not `@venizia/ignis`), update barrel imports to specific files:

```typescript
// Before
import { TContext } from '@/base/controllers';

// After
import { TContext } from '@/base/controllers/common/types';
```
