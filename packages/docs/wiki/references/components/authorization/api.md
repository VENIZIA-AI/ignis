# Authorization -- API Reference <Badge type="warning" text="Experimental" />

> Architecture, enforcer internals, provider, registry, and middleware pipeline. See [Setup & Configuration](./) for initial setup.

## Architecture

```
  ┌──────────────────────────────────────────────────────────┐
  │                     Application                          │
  │                                                          │
  │  preConfigure()                                          │
  │    ├── bind IAuthorizeOptions to AuthorizeBindingKeys    │
  │    └── this.component(AuthorizeComponent)                │
  └──────────────────────┬───────────────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────────────┐
  │              AuthorizeComponent.binding()                 │
  │                                                          │
  │  1. Resolve IAuthorizeOptions from container             │
  │  2. Validate enforcer class is present                   │
  │  3. Instantiate enforcer → get name                      │
  │  4. Register enforcer with EnforcerRegistry              │
  │  5. Bind alwaysAllowRoles (if provided)                  │
  │  6. Bind normalizePayloadFn (if provided)                │
  └──────────────────────┬───────────────────────────────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
  ┌────────────────┐ ┌───────────┐ ┌────────────────────┐
  │  Enforcer      │ │ Provider  │ │  Middleware         │
  │  Registry      │ │           │ │  (authorize fn)     │
  │  (singleton)   │ │           │ │                     │
  └───────┬────────┘ └─────┬─────┘ └────────┬───────────┘
          │                │                 │
          ▼                ▼                 ▼
  ┌────────────────┐ ┌──────────────┐ ┌────────────────────┐
  │  Default       │ │ Authorization│ │  Request Pipeline   │
  │  Enforcer      │ │ Provider     │ │                     │
  │  (RBAC/ABAC)   │ │ (IProvider)  │ │  1. Skip check      │
  ├────────────────┤ └──────────────┘ │  2. User check       │
  │  Casbin        │                  │  3. alwaysAllowRoles │
  │  Enforcer      │                  │  4. allowedRoles     │
  │  (optional)    │                  │  5. Voters           │
  └────────────────┘                  │  6. Resolve enforcer │
                                      │  7. Build abilities  │
                                      │  8. Evaluate         │
                                      └────────────────────┘
```

### Tech Stack

| Technology | Purpose |
|------------|---------|
| **Hono middleware** | Route-level authorization via `createMiddleware` from `hono/factory` |
| **`casbin`** (optional) | External policy engine for Casbin enforcer. Peer dependency -- not bundled. |
| **`@venizia/ignis-helpers`** | `BaseHelper` base class, `getError` for error creation, `HTTP` result codes |
| **`@venizia/ignis-inversion`** | `IProvider` interface, `BindingScopes` for singleton registration |

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Enforcer-based** | Pluggable architecture -- swap between built-in RBAC and Casbin without changing route configs |
| **Deny-first** | Deny rules always take precedence over allow rules (matching CASL/Casbin semantics) |
| **Voter pattern** | Custom logic that short-circuits before the enforcer (Spring Security inspiration) |
| **Ability caching** | Built abilities cached on Hono context per-request -- avoids rebuilding for multi-spec routes |
| **Registry singleton** | Mirrors `AuthenticationStrategyRegistry` pattern -- consistent with the codebase |
| **Abstract base** | `AbstractAuthRegistry<T>` shared between authentication and authorization registries |

## Component Lifecycle

The `AuthorizeComponent` executes during its `binding()` method:

| Step | Action | Failure |
|------|--------|---------|
| 1 | Resolve `IAuthorizeOptions` from container | Skip silently (logs debug) if not bound |
| 2 | Validate `enforcer` class exists | Throws `[AuthorizeComponent] enforcer class is required` |
| 3 | Instantiate enforcer to read `name` | -- |
| 4 | Register enforcer with `AuthorizationEnforcerRegistry` | -- |
| 5 | Bind `alwaysAllowRoles` (if present) | -- |
| 6 | Bind `normalizePayloadFn` (if present) | -- |

> [!NOTE]
> Unlike `AuthenticateComponent`, the `AuthorizeComponent` is optional. If no `IAuthorizeOptions` is bound, the component silently skips setup. This means you can register the component unconditionally and only enable authorization by binding options.

## Enforcer Registry

<code v-pre>AuthorizationEnforcerRegistry</code> is a **singleton** that manages registered enforcers. It extends `AbstractAuthRegistry<IAuthorizationEnforcer>`.

### Class Hierarchy

```
BaseHelper
  └── AbstractAuthRegistry<TItem>
        ├── AuthenticationStrategyRegistry  (authenticate)
        └── AuthorizationEnforcerRegistry   (authorize)
```

### API

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `getInstance()` | `static` | `AuthorizationEnforcerRegistry` | Returns the singleton instance |
| `register` | <code v-pre>(opts: { container: Container; enforcers: Array<{ enforcer: TClass; name: string }> }) => this</code> | `this` | Registers enforcers as singletons in the DI container |
| `getDefaultEnforcerName` | `() => string` | `string` | Returns the first registered enforcer's name |
| `resolveEnforcer` | `(opts: { name: string }) => IAuthorizationEnforcer` | `IAuthorizationEnforcer` | Resolves an enforcer instance from the container |
| `resolveAndConfigureEnforcer` | `(opts: { name: string }) => Promise<IAuthorizationEnforcer>` | `IAuthorizationEnforcer` | Resolves and calls `configure()` (once) on the enforcer |
| `resolveOptions` | `() => IAuthorizeOptions \| undefined` | `IAuthorizeOptions \| undefined` | Finds `IAuthorizeOptions` from any registered container |
| `getKey` | `(opts: { name: string }) => string` | `string` | Returns binding key: `authorization.enforcer.{name}` |

**Registration:**
```typescript
AuthorizationEnforcerRegistry.getInstance().register({
  container: this,
  enforcers: [
    { enforcer: DefaultAuthorizationEnforcer, name: 'default' },
  ],
});
```

> [!NOTE]
> `register()` returns `this`, enabling method chaining. Enforcers are registered as singletons with binding key `authorization.enforcer.{name}`.

**Configure-once pattern:**
```typescript
// The registry tracks which enforcers have been configured
const enforcer = await registry.resolveAndConfigureEnforcer({ name: 'casbin' });
// First call: resolves + calls configure()
// Second call: resolves only (configure already called)
```

## AbstractAuthRegistry

Shared base class for both authentication and authorization registries:

```typescript
abstract class AbstractAuthRegistry<TItem> extends BaseHelper {
  protected descriptors: Map<string, TRegistryDescriptor<TItem>>;

  protected abstract getBindingPrefix(): string;

  getKey(opts: { name: string }): string;           // prefix.name
  getDefaultName(): string;                          // first registered name
  protected registerDescriptor(opts): void;          // bind as singleton
  protected resolveDescriptor(opts): TItem;          // resolve from container
}
```

| Method | Description |
|--------|-------------|
| `getKey` | Builds binding key from prefix + name. Throws if name is empty. |
| `getDefaultName` | Returns the first registered descriptor's name. Throws if none registered. |
| `registerDescriptor` | Stores metadata in Map and binds class as singleton in DI container |
| `resolveDescriptor` | Resolves instance from DI container by name |

## Default Enforcer

`DefaultAuthorizationEnforcer` provides zero-dependency RBAC/ABAC authorization.

### Class

```typescript
class DefaultAuthorizationEnforcer
  extends BaseHelper
  implements IAuthorizationEnforcer<IPermissionRule[]>
{
  name = 'default';

  constructor(
    @inject({ key: AuthorizeBindingKeys.OPTIONS })
    private options: IAuthorizeOptions,
  ) { ... }

  async buildAbilities(opts: { user: IAuthUser; context: TContext }): Promise<IPermissionRule[]>;
  evaluate(opts: { abilities: IPermissionRule[]; action; resource; conditions? }): boolean;
}
```

### buildAbilities

Builds permission rules from one of two sources (in priority order):

| Priority | Source | Type |
|----------|--------|------|
| 1 | `options.loadPermissions()` | Async -- DB-driven |
| 2 | `options.defineAbilitiesFor()` | Sync -- static builder |

If neither is provided, returns `[]` and logs a warning.

### evaluate

Evaluates whether the action/resource/conditions are permitted by the built abilities:

```
1. Filter rules → matchesAction AND matchesResource AND matchesConditions
2. If no matching rules → return (defaultDecision === 'allow')
3. If any matching rule has effect='deny' → return false
4. If any matching rule has effect='allow' → return true
5. Otherwise → return (defaultDecision === 'allow')
```

### Private Matching Methods

| Method | Logic |
|--------|-------|
| `matchesAction` | `'manage'` matches all. Otherwise strict equality. |
| `matchesResource` | `'all'` matches all. Otherwise strict equality. |
| `matchesConditions` | No rule conditions → always match. Rule has conditions but request doesn't → no match. Both have conditions → every rule condition key must equal the request condition value. |

## Casbin Enforcer

`CasbinAuthorizationEnforcer` wraps the `casbin` library (optional peer dependency).

### Class

```typescript
class CasbinAuthorizationEnforcer
  extends BaseHelper
  implements IAuthorizationEnforcer<IAuthUser>
{
  name = 'casbin';

  constructor(
    @inject({ key: AuthorizeBindingKeys.OPTIONS })
    private options: IAuthorizeOptions,
  ) { ... }

  async configure(): Promise<void>;
  async buildAbilities(opts: { user: IAuthUser; context: TContext }): Promise<IAuthUser>;
  evaluate(opts: { abilities: IAuthUser; action; resource; conditions? }): boolean;
}
```

### configure

Called once by the registry on first use:

1. Dynamically imports `casbin` (throws if not installed)
2. Validates `casbinOptions` is present
3. Creates enforcer via `casbin.newEnforcer(model, adapter)`

### buildAbilities

Returns the `IAuthUser` directly (Casbin evaluates policies internally). If `useFilteredPolicy` is enabled, loads only policies matching the current user and their roles:

```typescript
// Filter format: user_{userId} and role_{identifier} for each role
const filters = [`user_${user.userId}`, `role_admin`, `role_editor`];
await this.enforcer.loadFilteredPolicy({ p: filters });
```

### evaluate

Delegates to Casbin's `enforceSync()`:

```typescript
// Default subject: user_{userId}
// With normalizePayloadFn: custom subject/resource/action
this.enforcer.enforceSync(subject, resource, action);
```

## Authorization Provider

`AuthorizationProvider` implements `IProvider<TAuthorizeFn>` and produces the middleware factory.

### Class

```typescript
class AuthorizationProvider extends BaseHelper implements IProvider<TAuthorizeFn> {
  value(): TAuthorizeFn;
  private createAuthorizeMiddleware(opts): MiddlewareHandler;
  private extractUserRoles(opts: { user: IAuthUser }): string[];
}
```

### Middleware Pipeline (8 Steps)

The `createAuthorizeMiddleware` method creates a Hono middleware with this evaluation order:

```typescript
// Step 1: Skip check
if (context.get(Authorization.SKIP_AUTHORIZATION)) → next()

// Step 2: User check
const user = context.get(Authentication.CURRENT_USER)
if (!user) → throw 403

// Step 3: alwaysAllowRoles (from IAuthorizeOptions)
if (userRoles.some(r => alwaysAllowRoles.includes(r))) → next()

// Step 4: allowedRoles (from IAuthorizationSpec)
if (userRoles.some(r => spec.allowedRoles.includes(r))) → next()

// Step 5: Voters (from IAuthorizationSpec)
for (voter of spec.voters) {
  if (DENY) → throw 403
  if (ALLOW) → next()
  // ABSTAIN → continue
}

// Step 6: Resolve enforcer
const enforcer = await registry.resolveAndConfigureEnforcer({ name })

// Step 7: Build/cache abilities
let abilities = context.get(Authorization.ABILITIES)
if (!abilities) {
  abilities = await enforcer.buildAbilities({ user, context })
  context.set(Authorization.ABILITIES, abilities)
}

// Step 8: Evaluate
if (!enforcer.evaluate({ abilities, action, resource, conditions })) → throw 403

// All checks passed
await next()
```

### Role Extraction

The `extractUserRoles` method handles multiple role formats:

```typescript
private extractUserRoles(opts: { user: IAuthUser }): string[] {
  const roles = user.roles;  // May be string[] or object[]

  return roles.map(r => {
    if (typeof r === 'string') return r;
    return r.identifier ?? r.name ?? String(r.id ?? '');
  });
}
```

## Standalone `authorize()` Function

```typescript
const authorizationProvider = new AuthorizationProvider();
const authorizeFn = authorizationProvider.value();

export const authorize = (opts: { spec: IAuthorizationSpec; enforcerName?: string }) => {
  return authorizeFn(opts);
};
```

This is the primary export for creating authorization middleware. It creates a singleton `AuthorizationProvider` instance at module load time.

## AuthorizationRole Model

Value object representing a role with priority-based comparison:

```typescript
class AuthorizationRole implements IAuthorizationRole {
  readonly name: string;
  readonly priority: number;
  readonly delimiter: string;  // default '_'

  static build(opts: { name; priority; delimiter? }): AuthorizationRole;

  get identifier(): string;  // e.g., '999_super-admin'

  compare(opts: { target }): number;     // this.priority - target.priority
  isHigherThan(opts: { target }): boolean;
  isLowerThan(opts: { target }): boolean;
  isEqualTo(opts: { target }): boolean;
}
```

### Identifier Format

The identifier is generated as `{paddedPriority}_{name}`:

```typescript
// Priority 999, name 'super-admin' → '999_super-admin'
// Priority 10, name 'user' → '010_user'
// Priority 1, name 'guest' → '001_guest'
```

### Comparison

Roles are compared by priority (higher number = higher privilege):

```typescript
AuthorizationRoles.SUPER_ADMIN.isHigherThan({ target: AuthorizationRoles.ADMIN }); // true
AuthorizationRoles.GUEST.isLowerThan({ target: AuthorizationRoles.USER }); // true
```

## Controller Integration

### How Authorization Middleware is Injected

The `AbstractController.getRouteConfigs()` method handles middleware injection order:

```typescript
getRouteConfigs<RouteConfig extends IAuthRouteConfig>(opts: { configs: RouteConfig }) {
  const { authenticate = {}, authorize, ...restConfig } = configs;
  const mws = [];

  // 1. Authenticate middleware (first)
  if (strategies.length > 0) {
    mws.push(authenticateFn({ strategies, mode }));
  }

  // 2. Authorize middleware (second) — supports single or array
  if (authorize) {
    const specs = Array.isArray(authorize) ? authorize : [authorize];
    for (const spec of specs) {
      mws.push(authorizeFn({ spec }));
    }
  }

  // 3. Custom middleware (last)
  if (restConfig.middleware) { ... }

  return createRoute({ ...restConfig, middleware: mws, ... });
}
```

### IAuthRouteConfig

Extended route config that supports both authentication and authorization:

```typescript
interface IAuthRouteConfig extends HonoRouteConfig {
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}
```

## IAuthorizationEnforcer Interface

The core enforcer contract:

```typescript
interface IAuthorizationEnforcer<TAbilities = unknown> {
  /** Unique enforcer name (e.g., 'default', 'casbin') */
  name: string;

  /** Optional async initialization (called once by registry) */
  configure?(): ValueOrPromise<void>;

  /** Build abilities for the authenticated user */
  buildAbilities(opts: {
    user: IAuthUser;
    context: TContext;
  }): ValueOrPromise<TAbilities>;

  /** Evaluate whether the action is permitted */
  evaluate(opts: {
    abilities: TAbilities;
    action: string;
    resource: string;
    conditions?: TAuthorizationConditions;
  }): boolean;
}
```

### Abilities Type Parameter

The `TAbilities` generic controls what `buildAbilities` returns and `evaluate` receives:

| Enforcer | TAbilities | Description |
|----------|------------|-------------|
| `DefaultAuthorizationEnforcer` | `IPermissionRule[]` | Array of allow/deny rules |
| `CasbinAuthorizationEnforcer` | `IAuthUser` | User object (Casbin evaluates internally) |
| Custom | Any type | Your custom abilities structure |

## See Also

- [Setup & Configuration](./) -- Binding keys, options interfaces, and initial setup
- [Usage & Examples](./usage) -- Securing routes, voters, ABAC patterns, and CRUD integration
- [Error Reference](./errors) -- Error messages and troubleshooting
