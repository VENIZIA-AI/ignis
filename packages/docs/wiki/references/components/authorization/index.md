# Authorization -- Setup & Configuration <Badge type="warning" text="Experimental" />

> Enforcer-based authorization with RBAC, ABAC, voters, and optional Casbin integration

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `AuthorizeComponent` |
| **Runtimes** | Both |

### Key Components

| Component | Purpose |
|-----------|---------|
| **AuthorizeComponent** | Main component registering enforcer and authorization bindings |
| **AuthorizationEnforcerRegistry** | Singleton managing registered enforcers (mirrors `AuthenticationStrategyRegistry`) |
| **DefaultAuthorizationEnforcer** | Built-in zero-dependency RBAC/ABAC enforcer |
| **CasbinAuthorizationEnforcer** | Casbin-backed enforcer (optional `casbin` peer dep) |
| **AuthorizationProvider** | IProvider producing the `authorize()` middleware factory |
| **authorize** | Standalone function wrapping `AuthorizationProvider.value()` |
| **AuthorizationRole** | Value object for role identity with priority-based comparison |
| **AbilityBuilder** | Fluent API for defining allow/deny permission rules |

### Authorization Flow (8 Steps)

| Step | Action | Short-circuits? |
|------|--------|-----------------|
| 1 | Check `Authorization.SKIP_AUTHORIZATION` flag | Yes -- skip all |
| 2 | Get authenticated user from context | Yes -- 403 if missing |
| 3 | Check `alwaysAllowRoles` (global) | Yes -- allow if matched |
| 4 | Check `allowedRoles` (per-route) | Yes -- allow if matched |
| 5 | Execute `voters` (per-route) | Yes -- DENY/ALLOW short-circuits |
| 6 | Resolve enforcer (by name or default) | No |
| 7 | Build or retrieve cached abilities | No |
| 8 | Evaluate permission via enforcer | Yes -- 403 if denied |

### Authorization Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `Authorization.ABILITIES` | `'authorization.abilities'` | Context key for cached abilities |
| `Authorization.SKIP_AUTHORIZATION` | `'authorization.skip'` | Context key to dynamically skip authorization |
| `Authorization.AUTHORIZATION_ENFORCER` | `'authorization.enforcer'` | Binding key prefix for enforcers |

### Authorization Actions

| Constant | Value | Description |
|----------|-------|-------------|
| `AuthorizationActions.CREATE` | `'create'` | Create action |
| `AuthorizationActions.READ` | `'read'` | Read action |
| `AuthorizationActions.UPDATE` | `'update'` | Update action |
| `AuthorizationActions.DELETE` | `'delete'` | Delete action |
| `AuthorizationActions.EXECUTE` | `'execute'` | Execute action |
| `AuthorizationActions.MANAGE` | `'manage'` | Wildcard -- matches all actions |

### Authorization Decisions

| Constant | Value | Description |
|----------|-------|-------------|
| `AuthorizationDecisions.ALLOW` | `'allow'` | Grant access |
| `AuthorizationDecisions.DENY` | `'deny'` | Deny access (takes precedence over allow) |
| `AuthorizationDecisions.ABSTAIN` | `'abstain'` | No opinion -- fall through to next check |

### Built-in Roles

| Constant | Identifier | Priority | Description |
|----------|------------|----------|-------------|
| `AuthorizationRoles.SUPER_ADMIN` | `'999_super-admin'` | 999 | Highest privilege |
| `AuthorizationRoles.ADMIN` | `'900_admin'` | 900 | Administrator |
| `AuthorizationRoles.USER` | `'010_user'` | 10 | Regular user |
| `AuthorizationRoles.GUEST` | `'001_guest'` | 1 | Guest user |
| `AuthorizationRoles.UNKNOWN_USER` | `'000_unknown-user'` | 0 | Unauthenticated fallback |

#### Import Paths

```typescript
import {
  AuthorizeComponent,
  AuthorizeBindingKeys,
  Authorization,
  AuthorizationActions,
  AuthorizationDecisions,
  AuthorizationRoles,
  AuthorizationEnforcerRegistry,
  DefaultAuthorizationEnforcer,
  CasbinAuthorizationEnforcer,
  AuthorizationProvider,
  AuthorizationRole,
  AbilityBuilder,
  authorize,
} from '@venizia/ignis';

import type {
  IAuthorizeOptions,
  IAuthorizationSpec,
  IAuthorizationEnforcer,
  IAuthorizationRole,
  IPermissionRule,
  IAbilityBuilder,
  TAuthorizationConditions,
  TAuthorizationAction,
  TAuthorizationDecision,
  TPermissionEffect,
  TAuthorizationVoter,
  TAuthorizeFn,
} from '@venizia/ignis';
```

## Setup

### Step 1: Bind Configuration

Bind `IAuthorizeOptions` in your application's `preConfigure()`.

### Default Enforcer (Static Rules)

```typescript
import {
  AuthorizeBindingKeys,
  DefaultAuthorizationEnforcer,
  AuthorizationActions,
  AuthorizationDecisions,
  AuthorizationRoles,
  IAuthorizeOptions,
} from '@venizia/ignis';

this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: DefaultAuthorizationEnforcer,
  defaultDecision: AuthorizationDecisions.DENY,
  alwaysAllowRoles: [AuthorizationRoles.SUPER_ADMIN.name],
  defineAbilitiesFor: ({ user, builder }) => {
    const roles = (user as any).roles ?? [];
    const roleNames = roles.map((r: any) => r.identifier ?? r.name ?? '');

    if (roleNames.includes(AuthorizationRoles.ADMIN.name)) {
      builder.allow({ action: AuthorizationActions.MANAGE, resource: 'all' });
    } else {
      builder.allow({ action: AuthorizationActions.READ, resource: 'Article' });
      builder.allow({ action: AuthorizationActions.CREATE, resource: 'Comment' });
      builder.deny({ action: AuthorizationActions.DELETE, resource: 'Article' });
    }
  },
});
```

### Default Enforcer (DB-Driven Rules)

```typescript
import {
  AuthorizeBindingKeys,
  DefaultAuthorizationEnforcer,
  AuthorizationDecisions,
  AuthorizationRoles,
  IAuthorizeOptions,
} from '@venizia/ignis';

this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: DefaultAuthorizationEnforcer,
  defaultDecision: AuthorizationDecisions.DENY,
  alwaysAllowRoles: [AuthorizationRoles.SUPER_ADMIN.name],
  loadPermissions: async ({ user, context }) => {
    const permissionService = this.get<PermissionService>({
      key: 'services.PermissionService',
    });
    return permissionService.getPermissionsForUser({ userId: user.userId });
  },
});
```

### Casbin Enforcer

```typescript
import {
  AuthorizeBindingKeys,
  CasbinAuthorizationEnforcer,
  AuthorizationRoles,
  IAuthorizeOptions,
} from '@venizia/ignis';

this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: CasbinAuthorizationEnforcer,
  alwaysAllowRoles: [AuthorizationRoles.SUPER_ADMIN.name],
  casbinOptions: {
    model: '/path/to/model.conf',
    adapter: new FileAdapter('/path/to/policy.csv'),
    useFilteredPolicy: true,
  },
  normalizePayloadFn: ({ user, action, resource }) => ({
    subject: `user_${user.userId}`,
    resource,
    action,
  }),
});
```

### Step 2: Register Component

```typescript
import {
  AuthorizeComponent,
  AuthorizationEnforcerRegistry,
  DefaultAuthorizationEnforcer,
  BaseApplication,
  ValueOrPromise,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // Step 1: Bind options (see above)

    // Step 2: Register the component
    this.component(AuthorizeComponent);
  }
}
```

> [!NOTE]
> Unlike authentication, you don't need to manually call `AuthorizationEnforcerRegistry.register()` -- the `AuthorizeComponent` handles enforcer registration automatically during its `binding()` phase based on the `enforcer` class in your options.

> [!IMPORTANT]
> Authorization depends on authentication. Register `AuthenticateComponent` **before** `AuthorizeComponent` so that `Authentication.CURRENT_USER` is populated before authorization checks run.

## Configuration

### IAuthorizeOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enforcer` | `TClass<IAuthorizationEnforcer>` | -- | **Required.** Enforcer class to use |
| `defaultDecision` | `TAuthorizationDecision` | `undefined` | Default when no rules match (`'allow'` or `'deny'`) |
| `alwaysAllowRoles` | `string[]` | `[]` | Roles that bypass all authorization checks (global) |
| `defineAbilitiesFor` | `(opts) => void` | -- | Static ability builder callback (Default enforcer) |
| `loadPermissions` | `(opts) => Promise<IPermissionRule[]>` | -- | DB-driven permission loader (Default enforcer) |
| `normalizePayloadFn` | `(opts) => { subject, resource, action }` | -- | Normalize subject/resource/action before evaluation |
| `casbinOptions` | `object` | -- | Casbin-specific configuration (Casbin enforcer only) |

> [!WARNING]
> When using the Default enforcer, provide either `defineAbilitiesFor` (static rules) or `loadPermissions` (DB-driven rules). If neither is provided, the enforcer logs a warning and returns an empty ability set, which means the `defaultDecision` determines all outcomes.

#### IAuthorizeOptions -- Full Interface

```typescript
interface IAuthorizeOptions {
  enforcer: TClass<IAuthorizationEnforcer>;
  defaultDecision?: TAuthorizationDecision;
  alwaysAllowRoles?: string[];

  defineAbilitiesFor?: (opts: { user: IAuthUser; builder: IAbilityBuilder }) => void;

  loadPermissions?: (opts: {
    user: IAuthUser;
    context: TContext;
  }) => ValueOrPromise<IPermissionRule[]>;

  normalizePayloadFn?: (opts: { user: IAuthUser; action: string; resource: string }) => {
    subject: string;
    resource: string;
    action: string;
  };

  casbinOptions?: {
    model: string;
    adapter?: unknown;
    useFilteredPolicy?: boolean;
  };
}
```

### Casbin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | -- | Path to Casbin model `.conf` file |
| `adapter` | `unknown` | -- | Casbin adapter instance (e.g., `FileAdapter`, `SequelizeAdapter`) |
| `useFilteredPolicy` | `boolean` | `false` | Load only policies relevant to the current user |

### IAuthorizationSpec (Route-level)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `action` | `string` | -- | **Required.** Action being performed (e.g., `'read'`, `'create'`) |
| `resource` | `string` | -- | **Required.** Resource being accessed (e.g., `'Article'`, `'User'`) |
| `conditions` | `TAuthorizationConditions` | -- | Key-value conditions for ABAC (strict equality) |
| `allowedRoles` | `string[]` | -- | Roles that bypass enforcer for this specific route |
| `voters` | `TAuthorizationVoter[]` | -- | Custom voter functions for this specific route |

#### IAuthorizationSpec -- Full Interface

```typescript
interface IAuthorizationSpec<E extends Env = Env> {
  action: string;
  resource: string;
  conditions?: TAuthorizationConditions;
  allowedRoles?: string[];
  voters?: TAuthorizationVoter<E>[];
}
```

### IPermissionRule

| Field | Type | Description |
|-------|------|-------------|
| `action` | `string` | Action this rule applies to |
| `resource` | `string` | Resource this rule applies to |
| `effect` | `TPermissionEffect` | `'allow'` or `'deny'` |
| `conditions` | `TAuthorizationConditions` | Optional ABAC conditions |

#### IPermissionRule -- Full Interface

```typescript
interface IPermissionRule {
  action: string;
  resource: string;
  effect: TPermissionEffect;
  conditions?: TAuthorizationConditions;
}
```

## Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/authorize/options` | `AuthorizeBindingKeys.OPTIONS` | `IAuthorizeOptions` | Yes | -- |
| `@app/authorize/enforcer` | `AuthorizeBindingKeys.ENFORCER` | `string` | No | -- |
| `@app/authorize/always-allow-roles` | `AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES` | `string[]` | No | -- |
| `@app/authorize/normalize-payload-fn` | `AuthorizeBindingKeys.NORMALIZE_PAYLOAD_FN` | `Function` | No | -- |

> [!NOTE]
> `ALWAYS_ALLOW_ROLES` and `NORMALIZE_PAYLOAD_FN` are automatically bound by the component if present in the options. You rarely need to bind them manually.

### Context Variables

These values are set on the Hono `Context` during authorization and can be accessed via `context.get()`:

| Key | Constant | Type | Description |
|-----|----------|------|-------------|
| `authorization.abilities` | `Authorization.ABILITIES` | `unknown` | Cached abilities built by the enforcer. Type depends on enforcer. |
| `authorization.skip` | `Authorization.SKIP_AUTHORIZATION` | `boolean` | Set to `true` to dynamically skip authorization |

### Utility Classes

#### AuthorizationActions

```typescript
class AuthorizationActions {
  static readonly CREATE = 'create';
  static readonly READ = 'read';
  static readonly UPDATE = 'update';
  static readonly DELETE = 'delete';
  static readonly EXECUTE = 'execute';
  static readonly MANAGE = 'manage';
  static readonly SCHEME_SET: Set<string>;
  static isValid(input: string): boolean;
}
type TAuthorizationAction = TConstValue<typeof AuthorizationActions>;
```

#### AuthorizationDecisions

```typescript
class AuthorizationDecisions {
  static readonly ALLOW = 'allow';
  static readonly DENY = 'deny';
  static readonly ABSTAIN = 'abstain';
  static readonly SCHEME_SET: Set<string>;
  static isValid(input: string): boolean;
}
type TAuthorizationDecision = TConstValue<typeof AuthorizationDecisions>;
type TPermissionEffect = 'allow' | 'deny';
```

#### AuthorizationRoles

```typescript
class AuthorizationRoles {
  static readonly SUPER_ADMIN: AuthorizationRole; // 999_super-admin
  static readonly ADMIN: AuthorizationRole;        // 900_admin
  static readonly USER: AuthorizationRole;         // 010_user
  static readonly GUEST: AuthorizationRole;        // 001_guest
  static readonly UNKNOWN_USER: AuthorizationRole; // 000_unknown-user
  static readonly SCHEME_SET: Set<string>;
  static isValid(input: string): boolean;
}
```

## Relationship with Authentication

Authorization runs **after** authentication in the middleware chain. The `AbstractController.getRouteConfigs()` method ensures the correct ordering:

1. Authentication middleware is injected first (from `authenticate` config)
2. Authorization middleware is injected second (from `authorize` config)
3. Custom middleware is injected last (from `middleware` config)

This means `Authentication.CURRENT_USER` is always available when the authorization middleware executes.

### Per-Route Configuration in CRUD Factory

CRUD factory routes support both authentication and authorization configuration:

```typescript
ControllerFactory.defineCrudController({
  entity: Article,
  repository: { name: 'ArticleRepository' },
  controller: {
    name: 'ArticleController',
    basePath: '/articles',
  },
  authenticate: { strategies: [Authentication.STRATEGY_JWT], mode: AuthenticationModes.ANY },
  authorize: { action: AuthorizationActions.READ, resource: 'Article' },
  routes: {
    // Skip both auth for public read
    find: { authenticate: { skip: true } },
    // Override authorization for delete
    deleteById: {
      authorize: { action: AuthorizationActions.DELETE, resource: 'Article' },
    },
    // Skip only authorization
    count: { authorize: { skip: true } },
  },
});
```

**Priority rules:**
1. `authenticate: { skip: true }` -- skips both authentication AND authorization
2. `authorize: { skip: true }` -- skips only authorization (authentication still runs)
3. Per-route `authorize` overrides controller-level `authorize`
4. No per-route config -- inherits controller-level config

## See Also

- [Usage & Examples](./usage) -- Securing routes, voters, ABAC patterns, and CRUD integration
- [API Reference](./api) -- Architecture, enforcer internals, provider, and registry
- [Error Reference](./errors) -- Error messages and troubleshooting

- **Related Components:**
  - [Authentication](../authentication/) -- Authentication system (runs before authorization)
  - [All Components](../index) -- Built-in components list

- **References:**
  - [Controllers](/references/base/controllers) -- Route configuration with auth
  - [Middlewares](/references/base/middlewares) -- Custom middleware integration

- **Best Practices:**
  - [Security Guidelines](/best-practices/security-guidelines) -- Authorization best practices
