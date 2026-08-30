---
title: Authorization
description: Enforcer-based RBAC/ABAC authorization with Casbin, a multi-tenant domain-scoped model, voters, and role shortcuts
difficulty: advanced
---

# Authorization

`AuthorizeComponent` decides whether an authenticated request is allowed to proceed. It evaluates role shortcuts, custom voters, and a Casbin RBAC enforcer, in that order, through the `authorize()` middleware. The middleware runs after authentication. Casbin's optional domain-scoped model adds multi-tenant grants on top.

> [!TIP]
> New to this component? Start with [Getting Started](./getting-started) - it builds the mental model (a graph of edges, not a rule table), then seeds one grant and protects one route end to end before you read the reference material below.

## In one example

The recommended setup: scoped Casbin RBAC backed by one `PolicyDefinition` edge table, then a protected route.

```typescript
import {
  AuthorizeBindingKeys, AuthorizeComponent, AuthorizationDecisions, AuthorizationEnforcerRegistry,
  AuthorizationEnforcerTypes, CasbinAuthorizationEnforcer, CasbinEnforcerModelDrivers,
  ScopedCasbinAdapter, CASBIN_RBAC_DOMAIN_SCOPED_MODEL, BaseApplication, IAuthorizeOptions,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure() {
    // 1. Global options
    this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
      defaultDecision: AuthorizationDecisions.DENY,
      alwaysAllowRoles: ['999_super-admin'],
    });

    // 2. Component (validates options, binds alwaysAllowRoles)
    this.component(AuthorizeComponent);

    // 3. Enforcer, registered by class + name + type + co-located options
    const adapter = new ScopedCasbinAdapter({
      dataSource, // a BasePostgresDataSource instance
      entities: {
        policyDefinition: { tableName: 'PolicyDefinition', schemaName: 'identity' },
        permission: { tableName: 'Permission', schemaName: 'identity' },
        principals: { user: 'User', role: 'Role' },
        domainTypes: ['Merchant'],
        softDelete: { use: true, columnName: 'deleted_at' },
      },
    });

    AuthorizationEnforcerRegistry.getInstance().register({
      container: this,
      enforcers: [{
        enforcer: CasbinAuthorizationEnforcer,
        name: 'casbin',
        type: AuthorizationEnforcerTypes.CASBIN,
        options: {
          model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL },
          isScoped: true,
          adapter,
          cached: { use: false },
        },
      }],
    });
  }
}
```

```typescript
// Inside a controller's binding() - a route protected by authentication + authorization
const DELETE_ARTICLE_CONFIG = {
  path: '/articles/{id}',
  method: 'delete',
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  authorize: { action: AuthorizationActions.DELETE, resource: 'Article' },
  responses: jsonResponse({ description: 'Deleted article', schema: ArticleSchema }),
} as const;
```

## How it works

- **Enforcer-based and pluggable.** `authorize({ spec })` returns Hono middleware built by `AuthorizationProvider`, which resolves an `IAuthorizationEnforcer` from `AuthorizationEnforcerRegistry` by name (default: the first registered). Swap `CasbinAuthorizationEnforcer` for a custom class without touching route configs.
- **Runs after authentication.** The middleware reads `Authentication.CURRENT_USER` from the Hono context. `AuthenticateComponent` must run first, and the route needs an `authenticate` config alongside `authorize`.
- **No enforcers registered = no-op.** If `AuthorizationEnforcerRegistry.hasEnforcers()` is `false`, the middleware calls `next()` and skips authorization entirely. That's useful during incremental rollout, but dangerous if you forget to register an enforcer in production.
- **Casbin's scoped RBAC model is the recommended engine.** Combine `CASBIN_RBAC_DOMAIN_SCOPED_MODEL`, `isScoped: true`, and `ScopedCasbinAdapter` to read one principal's policy edges from a single `PolicyDefinition` table. See [RBAC with domains](./usage#rbac-with-domains-multi-tenant) for multi-tenant grant scoping.
- **Per-request enforcers, cached lines.** Each Casbin evaluation borrows an isolated enforcer from an internal pool, loads that user's policy lines into it, then evaluates. The datasource query runs only on a cache miss, or every time if `cached.use: false`.

**Pipeline (7 steps, short-circuits marked)**

| # | Step | Short-circuits when |
|---|------|----------------------|
| 1 | `Authorization.SKIP_AUTHORIZATION` check | Set -> `next()` |
| 2 | Read `Authentication.CURRENT_USER` | Missing -> 401 |
| 3 | Role shortcuts (`alwaysAllowRoles` + `allowedRoles`) | Match -> `next()` |
| 4 | Voters (per-route) | `ALLOW`/`DENY` -> `next()` / 403 |
| 5 | Resolve enforcer | None registered -> `next()` |
| 6 | Build/cache rules (+ resolve domain, if any) | - |
| 7 | `enforcer.evaluate()` | `DENY`/`ABSTAIN`-as-deny -> 403 |

## Common tasks

**Secure a route.** Add `authorize: { action, resource }` next to `authenticate` in a route config or `@get`/`@post` decorator.

```typescript
authorize: { action: AuthorizationActions.READ, resource: 'Article' }
```

**Bypass the enforcer for trusted roles.** Both skip straight to `next()` once a matching role is found.

| Option | Scope |
|---|---|
| `alwaysAllowRoles` | Global, set in `IAuthorizeOptions` |
| `allowedRoles` | Per-route, set on the spec |

```typescript
authorize: { action: AuthorizationActions.DELETE, resource: 'Article', allowedRoles: [AuthorizationRoles.ADMIN.identifier] }
```

**Add custom logic before the enforcer.** A voter returns `ALLOW`/`DENY`/`ABSTAIN`; the first non-`ABSTAIN` decision wins.

```typescript
const ownerVoter: TAuthorizationVoter = async ({ user, context }) =>
  (await articleService.findById({ id: context.req.param('id') }))?.authorId === user.userId
    ? AuthorizationDecisions.ALLOW
    : AuthorizationDecisions.ABSTAIN;
```

**Scope a grant to a tenant.** Declare where the domain comes from per route (or globally via `IAuthorizeOptions.domainResolver`).

```typescript
authorize: { action: 'read', resource: 'Order', domain: { from: 'param', key: 'merchantId', type: 'Merchant' } }
```

**Reference a model instead of a hardcoded string.** `@model({ settings: { authorize: { principal } } })` auto-populates `Model.AUTHORIZATION_SUBJECT`.

```typescript
authorize: { action: AuthorizationActions.READ, resource: Article.AUTHORIZATION_SUBJECT }
```

## See also

- [Usage & Examples](./usage) - securing routes, voters, CRUD factory integration, domain scoping in depth
- [API Reference](./api) - architecture, enforcer internals, provider pipeline, registry, adapters
- [Error Reference](./errors) - every error message and how to fix it
- [Authentication](../authentication/) - runs before authorization, populates `Authentication.CURRENT_USER`
- [Components Overview](/guides/core-concepts/components) - component system basics
- [Persistent Models](/guides/core-concepts/persistent/models#authorization-settings) - declaring `AUTHORIZATION_SUBJECT` on a model
- [Security Guidelines](/best-practices/security-guidelines) - authorization best practices

**Files:**

- [`packages/core-server/src/components/auth/authorize/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/auth/authorize/component.ts) - `AuthorizeComponent`
- [`packages/core-server/src/components/auth/authorize/common/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/auth/authorize/common) - constants, binding keys, types, policy/permission builders
- [`packages/core-server/src/components/auth/authorize/providers/authorization.provider.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/auth/authorize/providers/authorization.provider.ts) - `AuthorizationProvider` (the 7-step pipeline)
- [`packages/core-server/src/components/auth/authorize/enforcers/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/auth/authorize/enforcers) - `CasbinAuthorizationEnforcer`, `AuthorizationEnforcerRegistry`, `CASBIN_RBAC_DOMAIN_SCOPED_MODEL`
- [`packages/core-server/src/components/auth/authorize/adapters/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/auth/authorize/adapters) - `BaseFilteredAdapter`, `ScopedCasbinAdapter`
- [`packages/core-server/src/components/auth/authorize/models/authorization-role.model.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/auth/authorize/models/authorization-role.model.ts) - `AuthorizationRole`
- [`packages/core-server/src/base/metadata/persistents.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/metadata/persistents.ts) - `@model` auto-populating `AUTHORIZATION_SUBJECT` from `settings.authorize.principal`
