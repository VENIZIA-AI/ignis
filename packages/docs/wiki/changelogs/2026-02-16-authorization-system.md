---
title: Authorization System & Auth Module Refactor
description: Enforcer-based authorization with RBAC, ABAC, voters, Casbin integration, and comprehensive auth module restructuring
---

# Changelog - 2026-02-16

## Authorization System & Auth Module Refactor

This release introduces a complete authorization system alongside a major restructuring of the authentication module. The authorization system supports both built-in RBAC/ABAC and optional Casbin integration, following the same registry-based architecture as authentication.

## Overview

- **Authorization System**: Enforcer-based authorization with deny-first semantics, voter pattern, ability caching, and role shortcuts
- **Default Enforcer**: Zero-dependency RBAC/ABAC enforcer with `AbilityBuilder` for static rules and `loadPermissions` for DB-driven rules
- **Casbin Enforcer**: Optional integration with the `casbin` library for policy-engine-based authorization
- **Auth Module Restructure**: Consistent file organization across authenticate and authorize modules
- **Import Cleanup**: Replaced barrel `@/` imports with specific file paths to prevent circular dependencies
- **Helpers Rename**: `packages/helpers/src/helpers/` renamed to `packages/helpers/src/modules/`
- **Terminology Update**: `requirement` renamed to `spec` throughout the authorization module

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

**Solution:** A pluggable enforcer-based authorization system that integrates seamlessly with the existing authentication middleware chain.

```typescript
import {
  AuthorizeComponent,
  AuthorizeBindingKeys,
  DefaultAuthorizationEnforcer,
  AuthorizationActions,
  AuthorizationDecisions,
  AuthorizationRoles,
  IAuthorizeOptions,
} from '@venizia/ignis';

// Configure authorization
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: DefaultAuthorizationEnforcer,
  defaultDecision: AuthorizationDecisions.DENY,
  alwaysAllowRoles: [AuthorizationRoles.SUPER_ADMIN.name],
  defineAbilitiesFor: ({ user, builder }) => {
    builder.allow({ action: AuthorizationActions.READ, resource: 'Article' });
    builder.allow({ action: AuthorizationActions.CREATE, resource: 'Article' });
    builder.deny({ action: AuthorizationActions.DELETE, resource: 'Article' });
  },
});

this.component(AuthorizeComponent);
```

**Benefits:**
- Deny-first semantics (deny always takes precedence over allow)
- Role-based shortcuts (`alwaysAllowRoles`, `allowedRoles`)
- Voter pattern for custom authorization logic
- ABAC via condition matching
- Ability caching per-request on Hono context
- CRUD factory integration with per-route overrides
- Casbin integration as optional peer dependency

### Authorization Middleware Pipeline (8 Steps)

| Step | Action | Short-circuits? |
|------|--------|-----------------|
| 1 | Check `SKIP_AUTHORIZATION` flag | Yes |
| 2 | Get authenticated user | Yes (403) |
| 3 | Check global `alwaysAllowRoles` | Yes |
| 4 | Check per-route `allowedRoles` | Yes |
| 5 | Execute voters | Yes (DENY/ALLOW) |
| 6 | Resolve enforcer | No |
| 7 | Build/cache abilities | No |
| 8 | Evaluate via enforcer | Yes (403) |

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
│   ├── common/          # Constants, keys, types
│   ├── enforcers/       # Default, Casbin enforcers + registry
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
| `src/components/auth/authorize/common/constants.ts` | Authorization, AuthorizationActions, AuthorizationDecisions, AuthorizationRoles constants |
| `src/components/auth/authorize/common/keys.ts` | AuthorizeBindingKeys binding key constants |
| `src/components/auth/authorize/common/types.ts` | IAuthorizationEnforcer, IAuthorizationSpec, IAuthorizeOptions, TAuthorizationVoter, IPermissionRule, IAbilityBuilder, TAuthorizeFn |
| `src/components/auth/authorize/common/index.ts` | Barrel export for common |
| `src/components/auth/authorize/component.ts` | AuthorizeComponent -- registers enforcer and bindings |
| `src/components/auth/authorize/enforcers/enforcer-registry.ts` | AuthorizationEnforcerRegistry singleton |
| `src/components/auth/authorize/enforcers/default.enforcer.ts` | DefaultAuthorizationEnforcer + AbilityBuilder |
| `src/components/auth/authorize/enforcers/casbin.enforcer.ts` | CasbinAuthorizationEnforcer (optional peer dep) |
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

If you want authorization, bind options and register the component:

```typescript
import {
  AuthorizeBindingKeys,
  AuthorizeComponent,
  DefaultAuthorizationEnforcer,
  AuthorizationDecisions,
  AuthorizationRoles,
  IAuthorizeOptions,
} from '@venizia/ignis';

// In preConfigure():
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: DefaultAuthorizationEnforcer,
  defaultDecision: AuthorizationDecisions.DENY,
  alwaysAllowRoles: [AuthorizationRoles.SUPER_ADMIN.name],
  defineAbilitiesFor: ({ user, builder }) => {
    // Define your rules
  },
});

this.component(AuthorizeComponent);
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
