---
title: Authorization System & Auth Module Refactor
description: IGNIS now has a pluggable authorization system with role shortcuts, voters and Casbin support, and route configs use a new IAuthRouteConfig type.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-02-16 (Updated 2026-02-25)

## Authorization System & Auth Module Refactor

**In one line.** You can now protect routes with an `authorize` setting backed by role shortcuts, custom voters or a Casbin policy engine, using the same registry setup as authentication.

## What changed

- **Authorization on routes.** Route configs and the CRUD controller factory accept `authorize`, with per-route overrides and `authorize: { skip: true }`.
- **Role shortcuts and voters.** `alwaysAllowRoles` and `allowedRoles` decide without calling an enforcer. Voters add custom ALLOW or DENY logic. Rules are cached per request.
- **Casbin enforcer.** `CasbinAuthorizationEnforcer` uses the `casbin` library, an optional peer dependency.
- **Filtered adapters.** `BaseFilteredAdapter` and `DrizzleCasbinAdapter` load user-scoped policies (read-only, raw SQL through Drizzle). `CasbinRuleVariants` holds the rule-type constants.
- **Enforcer options live with the registration.** Class, name, type and options are given together to `AuthorizationEnforcerRegistry.register()`, and `IAuthorizeOptions` is simplified. `DefaultAuthorizationEnforcer` and `AbilityBuilder` are removed.
- **Role helper.** `AuthorizationRoles.SUPER_ADMIN.identifier` gives `'999_super-admin'`, and `AuthorizationRoles.ADMIN.isHigherThan({ target: AuthorizationRoles.USER })` compares roles by priority.

## Who is affected

- **Code using `IAuthenticateRouteConfig`.** Rename it to `IAuthRouteConfig`.
- **Code using the old `authorize: { requirement: ... }` shape.** Move to the new spec shape (see Breaking changes).
- **Everyone else.** Authorization is opt-in; nothing changes until you register `AuthorizeComponent`.

## Breaking changes

> [!WARNING]
> Custom controllers that extend `IAuthenticateRouteConfig`, and code that uses `requirement`, must be updated.

**Before:**

```typescript
import { IAuthenticateRouteConfig } from '@venizia/ignis';

interface MyRouteConfig extends IAuthenticateRouteConfig {}

authorize: { requirement: { action: 'read', resource: 'Article' } }
```

**After:**

```typescript
import { IAuthRouteConfig, AuthorizationActions } from '@venizia/ignis';

interface MyRouteConfig extends IAuthRouteConfig {
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}

authorize: { action: AuthorizationActions.READ, resource: 'Article' }
// or
authorize({ spec: { action: AuthorizationActions.READ, resource: 'Article' } })
```

Terminology also changed: `requirement` is now `spec`, and `abilities` is now `rules`.

The helpers source directory `packages/helpers/src/helpers/` was renamed to `packages/helpers/src/modules/` (internal imports `@/helpers/...` became `@/modules/...`). Imports through `@venizia/ignis-helpers` are unaffected.

If you import from internal framework paths instead of `@venizia/ignis`, replace barrel imports with the specific file, for example `@/base/controllers` becomes `@/base/controllers/common/types`.

## Details

Set up authorization in three steps:

```typescript
// Step 1: global options
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  defaultDecision: 'deny',
  alwaysAllowRoles: ['999_super-admin'],
});

// Step 2: register the component
this.component(AuthorizeComponent);

// Step 3: register enforcers with their options
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

Add `authorize` to a route:

```typescript
this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },
    authorize: { action: AuthorizationActions.READ, resource: 'Article' },
  },
  handler: async (context) => { ... },
});
```

- **Check order.** A route with `SKIP_AUTHORIZATION` skips everything; otherwise the user must be authenticated (401), then role shortcuts and voters can decide, and finally the enforcer evaluates (403).
- **CRUD factory.** Use `authorize: { skip: true }` on a route to skip only authorization. Every write route (`create`, `updateById`, `updateBy`, `deleteById`, `deleteBy`) declares its own `authorize`; a read spec is refused on them since 0.4.2.
