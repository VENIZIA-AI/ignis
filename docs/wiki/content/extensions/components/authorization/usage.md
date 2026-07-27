---
title: Authorization Usage
description: Securing REST and gRPC routes, voters, role shortcuts, CRUD factory integration, custom enforcers, and multi-tenant domain scoping
difficulty: advanced
---

# Authorization Usage

Task-oriented examples for the Authorization component. See the [Overview](./) for initial setup and the [API Reference](./api) for every option and class.

## Find what you need

| You want to | Go to |
|---|---|
| Add `authorize` to a REST or gRPC route | [Securing routes](#securing-routes) |
| Call `authorize()` outside a route config | [Using the standalone authorize() function](#using-the-standalone-authorize-function) |
| Add custom allow/deny logic before the enforcer | [Voters](#voters) |
| Bypass the enforcer for trusted roles | [Role-based shortcuts](#role-based-shortcuts) |
| Wire authorization into generated CRUD routes | [CRUD factory integration](#crud-factory-integration) |
| Skip authorization for one request at runtime | [Dynamic skip authorization](#dynamic-skip-authorization) |
| Read the resolved user, rules, or domain in a handler | [Accessing context variables](#accessing-context-variables) |
| Replace Casbin with your own enforcer | [Custom enforcer](#custom-enforcer) |
| Store policies in a schema `ScopedCasbinAdapter` doesn't fit | [Custom filtered adapter](#custom-filtered-adapter) |
| Compare roles by priority | [AuthorizationRole comparison](#authorizationrole-comparison) |
| Reference a model instead of a hardcoded resource string | [Model-Based Resource References](#model-based-resource-references) |
| Scope grants to a tenant (multi-tenant apps) | [RBAC with domains](#rbac-with-domains-multi-tenant) |

## Securing routes

**Imperative route.** Add `authorize` to `defineRoute()`'s `configs`, next to `authenticate`.

```typescript
import { BaseRestController, Authentication, AuthorizationActions } from '@venizia/ignis';

class ArticleController extends BaseRestController {
  binding() {
    this.defineRoute({
      configs: {
        path: '/{id}',
        method: 'delete',
        authenticate: { strategies: [Authentication.STRATEGY_JWT] },
        authorize: {
          action: AuthorizationActions.DELETE,
          resource: 'Article',
          conditions: { ownerId: 'currentUser' }, // available to voters/custom enforcers - the built-in Casbin enforcer ignores it
        },
        responses: jsonResponse({ description: 'Deleted article', schema: ArticleSchema }),
      },
      handler: async context => {
        const { id } = context.req.valid('param');
        return context.json(await this.articleService.deleteById({ id }));
      },
    });
  }
}
```

**Decorator-based route.** Same `authorize` field inside `@get`/`@post`/etc. `configs`.

```typescript
import { controller, get, post, AuthorizationActions, AuthorizationRoles } from '@venizia/ignis';

@controller({ path: '/articles' })
class ArticleController extends BaseRestController {
  @post({
    configs: {
      path: '/',
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      authorize: {
        action: AuthorizationActions.CREATE,
        resource: 'Article',
        allowedRoles: ['editor', AuthorizationRoles.ADMIN.identifier],
      },
      request: { body: jsonContent({ schema: CreateArticleSchema }) },
      responses: jsonResponse({ description: 'Created article', schema: ArticleSchema }),
    },
  })
  async create(opts: { context: TRouteContext }) {
    // Runs if the user has 'create:Article' permission OR the 'editor'/'900_admin' role
  }
}
```

**Require multiple specs.** Pass an array - each spec becomes its own middleware, and all must pass.

```typescript
authorize: [
  { action: AuthorizationActions.UPDATE, resource: 'User' },
  { action: AuthorizationActions.UPDATE, resource: 'Admin' },
]
```

> [!NOTE]
> When several specs run on the same route, rules are built once, via `enforcer.buildRules()`, and cached on `Authorization.RULES` for the rest of the request. The second spec reuses them instead of rebuilding.

**gRPC route.** Same `authorize` field, inside RPC metadata. `AbstractGrpcController.buildRpcMiddlewares()` injects it in the same order as REST: authenticate, then authorize.

```typescript
@unary({
  configs: {
    name: 'deleteUser',
    authenticate: { strategies: ['jwt'] },
    authorize: { action: AuthorizationActions.DELETE, resource: 'user' },
  },
})
async deleteUser(opts: { request: DeleteUserRequest; context: TRouteContext }) { ... }
```

See [gRPC Controllers](/guides/core-concepts/grpc-controllers) for the full decorator/`defineRoute` gRPC surface.

## Using the standalone `authorize()` function

`authorize({ spec, enforcerName? })` returns a plain Hono `MiddlewareHandler`. Use it outside route configs - for example, when you wire a Hono sub-app directly.

```typescript
import { authorize, authenticate, Authentication, AuthorizationActions } from '@venizia/ignis';

app.delete(
  '/articles/:id',
  authenticate({ strategies: [Authentication.STRATEGY_JWT] }),
  authorize({ spec: { action: AuthorizationActions.DELETE, resource: 'Article' } }),
  c => c.json({ deleted: true }),
);
```

**Target a specific enforcer.** Omit `enforcerName` to use the first one registered.

```typescript
authorize({
  spec: { action: AuthorizationActions.READ, resource: 'Report' },
  enforcerName: 'my-custom',
});
```

## Voters

Voters run **before** the enforcer (pipeline step 4) and are evaluated in order - the first non-`ABSTAIN` decision wins.

| Decision | Effect |
|----------|--------|
| `AuthorizationDecisions.ALLOW` | Grants access immediately - skips remaining voters and the enforcer |
| `AuthorizationDecisions.DENY` | Denies access immediately - throws 403 |
| `AuthorizationDecisions.ABSTAIN` | No opinion - falls through to the next voter, then the enforcer |

```typescript
import { AuthorizationActions, AuthorizationDecisions, TAuthorizationVoter } from '@venizia/ignis';

const ownerVoter: TAuthorizationVoter = async ({ user, action, resource, context }) => {
  if (action !== AuthorizationActions.UPDATE && action !== AuthorizationActions.DELETE) {
    return AuthorizationDecisions.ABSTAIN;
  }

  const article = await articleService.findById({ id: context.req.param('id') });
  if (!article) {
    return AuthorizationDecisions.ABSTAIN;
  }

  return article.authorId === user.userId ? AuthorizationDecisions.ALLOW : AuthorizationDecisions.ABSTAIN;
};

authorize: {
  action: AuthorizationActions.UPDATE,
  resource: 'Article',
  voters: [ownerVoter, adminOverrideVoter], // sequential; first non-ABSTAIN wins
}
```

> [!TIP]
> Default to `ABSTAIN` when a voter has no strong opinion. Only return `DENY` when the request should be blocked regardless of any other check. It short-circuits everything, including a later `ALLOW` voter.

## Role-based shortcuts

**Global bypass.** Roles in `alwaysAllowRoles` (bound via `IAuthorizeOptions`) skip all authorization checks on every route.

```typescript
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  defaultDecision: 'deny',
  alwaysAllowRoles: [AuthorizationRoles.SUPER_ADMIN.identifier, 'system'],
});
```

**Per-route bypass.** Roles in a spec's `allowedRoles` skip the enforcer for that route only.

```typescript
authorize: { action: AuthorizationActions.DELETE, resource: 'Article', allowedRoles: [AuthorizationRoles.ADMIN.identifier, 'moderator'] }
```

**Role formats accepted.** `extractUserRoles()` reads `user.roles` and normalizes every entry to a string, trying `identifier` first, then `name`, then `String(id)`.

| `user.roles` shape | Extracted as |
|---|---|
| `['admin', 'user']` | Used as-is |
| `[{ id: 1, identifier: '900_admin', priority: 900 }]` | `'900_admin'` (preferred - matches `AuthorizationRole.identifier`) |
| `[{ id: 1, name: 'admin' }]` | `'admin'` |
| `[{ id: 1 }]` | `'1'` |

## CRUD factory integration

**Apply to every generated route.** Set `authorize` at the controller level in `defineCrudController`.

```typescript
import { AuthorizationActions } from '@venizia/ignis';

ControllerFactory.defineCrudController({
  entity: Article,
  repository: { name: 'ArticleRepository' },
  controller: { name: 'ArticleController', basePath: '/articles' },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  authorize: { action: AuthorizationActions.READ, resource: 'Article' },
});
```

**Override per endpoint.** `routes.<endpoint>.authorize` takes precedence over the controller-level spec.

```typescript
routes: {
  find: { authenticate: { skip: true } },                                   // public read - skips BOTH checks
  count: { authorize: { skip: true } },                                     // authenticated, no authorization
  create: { authorize: { action: AuthorizationActions.CREATE, resource: 'Article' } },
  deleteById: {
    authorize: {
      action: AuthorizationActions.DELETE,
      resource: 'Article',
      allowedRoles: [AuthorizationRoles.ADMIN.identifier],
    },
  },
}
```

**Priority, in order:**

1. `authenticate: { skip: true }` - skips both authentication AND authorization
2. `authorize: { skip: true }` - skips authorization only (authentication still runs)
3. Per-route `authorize` spec - overrides the controller-level spec
4. No per-route config - inherits the controller-level `authorize`

Per-route config is typed `TRouteAuthorizeConfig = { skip: true } | IAuthorizationSpec | IAuthorizationSpec[]`. See the [API Reference](./api#crud-factory-authorization) for the full resolver signature.

## Dynamic skip authorization

Set `Authorization.SKIP_AUTHORIZATION` from an earlier middleware to bypass authorization for that one request (pipeline step 1). This is useful for trusted service-to-service calls.

```typescript
import { Authorization } from '@venizia/ignis';
import { createMiddleware } from 'hono/factory';

const conditionalAuthzMiddleware = createMiddleware(async (c, next) => {
  if (c.req.header('X-Internal-Service') === 'trusted-key') {
    c.set(Authorization.SKIP_AUTHORIZATION, true);
  }
  return next();
});
```

## Accessing context variables

```typescript
import { Authorization, Authentication } from '@venizia/ignis';

const user = c.get(Authentication.CURRENT_USER);           // IAuthUser
const rules = c.get(Authorization.RULES);                  // unknown - shape depends on the enforcer
const isSkipped = c.get(Authorization.SKIP_AUTHORIZATION);  // boolean
const domain = c.get(Authorization.DOMAIN);                // "<Type>_<id>" | "SYSTEM_WIDE" - set only when domain scoping is in play

c.set(Authorization.SKIP_AUTHORIZATION, true);
c.set(Authorization.RULES, null); // force a rebuild later in the SAME request
```

> [!TIP]
> Rules are cached per-request only - every new HTTP request starts with an empty cache. `c.set(Authorization.RULES, null)` only matters if you need to force a rebuild mid-request, for example after mutating the user's roles inline.

## Custom enforcer

Implement `IAuthorizationEnforcer` to replace or supplement Casbin.

```typescript
import {
  IAuthorizationEnforcer, IAuthorizationRequest, IAuthUser, TAuthorizationDecision,
  AuthorizationDecisions, TContext,
} from '@venizia/ignis';
import { BaseHelper, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env } from 'hono';

type MyRules = Map<string, Set<string>>;

class MyCustomEnforcer extends BaseHelper implements IAuthorizationEnforcer<Env, string, string, MyRules> {
  name = 'my-custom';

  constructor() {
    super({ scope: MyCustomEnforcer.name });
  }

  async configure(): Promise<void> {
    // One-time initialization - called by the registry on first resolveEnforcer()
  }

  async buildRules(opts: { user: { principalType: string } & IAuthUser; context: TContext }): Promise<MyRules> {
    return new Map(); // build from DB, config, etc.
  }

  async evaluate(opts: { rules: MyRules; request: IAuthorizationRequest; context: TContext }): Promise<TAuthorizationDecision> {
    const actions = opts.rules.get(opts.request.resource);
    return actions?.has(opts.request.action) ? AuthorizationDecisions.ALLOW : AuthorizationDecisions.DENY;
  }
}
```

Register it the same way as the Casbin enforcer, with `type: AuthorizationEnforcerTypes.CUSTOM`:

```typescript
AuthorizationEnforcerRegistry.getInstance().register({
  container: this,
  enforcers: [{
    enforcer: MyCustomEnforcer,
    name: 'my-custom',
    type: AuthorizationEnforcerTypes.CUSTOM,
    options: { /* your enforcer-specific options, if any */ },
  }],
});
```

> [!NOTE]
> A custom enforcer can inject its own options via `@inject({ key: AuthorizeBindingKeys.enforcerOptions('my-custom') })` in the constructor, exactly like `CasbinAuthorizationEnforcer` does.

## Custom filtered adapter

Use the ready-made [`ScopedCasbinAdapter`](./api#scopedcasbinadapter) for most apps - it reads one edge table and needs no subclassing. Write a custom adapter only when your storage model differs.

`BaseFilteredAdapter` provides:

- Datasource/connector plumbing
- `isFiltered()`
- The no-op write methods
- A `loadLines` helper

A subclass implements only `loadFilteredPolicy`: query your store for ONE principal's policies and turn them into casbin lines.

```typescript
import { BaseFilteredAdapter, ICasbinPolicyFilter, type ICasbinPolicySource } from '@venizia/ignis';
import type { Model } from 'casbin';

class MyCustomAdapter extends BaseFilteredAdapter<ICasbinPolicyFilter> {
  constructor(opts: { dataSource: ICasbinPolicySource }) {
    super({ scope: MyCustomAdapter.name, dataSource: opts.dataSource });
  }

  async loadFilteredPolicy(model: Model, filter: ICasbinPolicyFilter): Promise<void> {
    const { type, id } = filter.principal;

    // 1. Query your store for THIS principal's policies (this.connector is provided by the base).
    // 2. Build casbin lines as plain strings, e.g. `p, User_${id}, Order, read, allow` or `g, User_${id}, Role_42, *`.
    const lines: string[] = await this.buildLinesFor({ type, id });

    // 3. Load them into the model with the base helper.
    await this.loadLines({ model, lines });
  }

  private async buildLinesFor(principal: { type: string; id: unknown }): Promise<string[]> {
    return []; // ...your queries via this.connector...
  }
}
```

The base has no template-method query hooks or line formatters - a subclass owns its own queries and line construction. See `ScopedCasbinAdapter` for a full reference implementation (role closure, structural trees, soft-delete, schema-qualified SQL).

## AuthorizationRole comparison

`AuthorizationRole` gives priority-based role comparison; identifiers are `{paddedPriority}{delimiter}{name}`.

```typescript
import { AuthorizationRole, AuthorizationRoles } from '@venizia/ignis';

AuthorizationRoles.SUPER_ADMIN.identifier;  // '999_super-admin'
AuthorizationRoles.ADMIN.identifier;        // '900_admin'

AuthorizationRoles.SUPER_ADMIN.isHigherThan({ target: AuthorizationRoles.ADMIN }); // true (999 > 900)
AuthorizationRoles.GUEST.isLowerThan({ target: AuthorizationRoles.USER });         // true (1 < 10)

const moderator = AuthorizationRole.build({ name: 'moderator', priority: 500 });
moderator.identifier; // '500_moderator'

const customRole = AuthorizationRole.build({ name: 'editor', priority: 100, delimiter: '-' });
customRole.identifier; // '100-editor'
```

## Model-Based Resource References

Instead of hardcoding resource strings, declare `authorize.principal` on the model - `@model` auto-populates the static `AUTHORIZATION_SUBJECT` from it.

```typescript
import { BasePostgresEntity, model, generateIdColumnDefs } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: { authorize: { principal: 'article' } },
})
export class Article extends BasePostgresEntity<typeof Article.schema> {
  static override schema = pgTable('Article', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    title: text('title').notNull(),
  });
}

// Article.AUTHORIZATION_SUBJECT === 'article'
```

```typescript
import { AuthorizationActions } from '@venizia/ignis';
import { Article } from '../models/entities/article.model';

authorize: {
  action: AuthorizationActions.READ,
  resource: Article.AUTHORIZATION_SUBJECT, // instead of the string literal 'article'
}
```

**Query every declared principal at runtime** - for example, to seed Casbin policies.

```typescript
import { MetadataRegistry } from '@venizia/ignis';

const registry = MetadataRegistry.getInstance();

registry.getAuthorizeModelPrincipals({ format: 'array' });
// ['article', 'user', 'configuration']

registry.getAuthorizeModelPrincipals({ format: 'record' });
// { Article: 'article', User: 'user', Configuration: 'configuration' }

registry.getAuthorizeModelSettings({ format: 'array' });
// [{ name: 'Article', authorize: { principal: 'article' }, entry: IModelRegistryEntry }]
```

> [!TIP]
> Declaring `authorize.principal` on the model makes it the single source of truth for the authorization subject. Route configs and policy setup no longer duplicate the string. See the [Persistent Models guide](/guides/core-concepts/persistent/models#authorization-settings) for the full `@model` settings surface.

## RBAC with domains (multi-tenant)

Some apps hand out roles **scoped to a specific tenant**. A user might be `owner` in Merchant A, only `viewer` in Merchant B, and hold a global role everywhere too. Casbin's [RBAC with domains](https://casbin.apache.org/docs/rbac-with-domains/) pattern keeps that policy **linear**: `memberships + permissions`, not a `permissions x tenants` cross-product. At 30 tenants and 700 permissions, that's roughly 730 lines instead of 21,000.

You have two ways to get there:

| Approach | Setup | Matchers |
|---|---|---|
| **Scoped model (recommended)** | `isScoped: true` + `ScopedCasbinAdapter` + `CASBIN_RBAC_DOMAIN_SCOPED_MODEL`. Supply the domain per route via `spec.domain`, or globally via `domainResolver`. | Registered for you |
| **Manual flat model (lower-level)** | Keep a flat `g + p` model. See [The flat model](#the-flat-model). | Register `domainMatching` and `normalizePayloadFn` yourself |

### Scoped model + per-route domain (recommended)

Register the enforcer with `isScoped: true` (see the [Overview](./#in-one-example)), then tell each route where to read its domain from. `IAuthorizationSpec.domain` accepts a **declarative source** or a **resolver function**.

```typescript
import type { IAuthorizationDomainSource, TAuthorizationDomainResolver } from '@venizia/ignis';

// (a) Declarative - read the domain id from a request param/header/query/context var:
authorize({
  spec: { action: 'read', resource: 'Order', domain: { from: 'param', key: 'merchantId', type: 'Merchant' } }, // -> "Merchant_<param>"
});

// (b) Resolver - compute { type, id } yourself (return null -> SYSTEM_WIDE):
authorize({
  spec: {
    action: 'read',
    resource: 'Order',
    domain: ({ context }) => {
      const merchantId = resolveActiveMerchant({ context });
      return merchantId ? { type: 'Merchant', id: merchantId } : null;
    },
  },
});
```

- **Precedence** (`resolveRequestDomain`): `spec.domain` (resolver, then declarative) -> the global `IAuthorizeOptions.domainResolver` -> `SYSTEM_WIDE`.
- **Where it lands.** The resolved value is stashed on `Authorization.DOMAIN` and passed to the enforcer as `request.domain`.
- **No domain = super-admin scope.** A route with no domain source at all enforces `SYSTEM_WIDE` in scoped mode.

**Global fallback** - apply the same resolver to every route that doesn't set `spec.domain`:

```typescript
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  defaultDecision: 'deny',
  domainResolver: ({ context }) => {
    const id = resolveActiveMerchant({ context });
    return id ? { type: 'Merchant', id } : null;
  },
});
```

### The flat model

```ini
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act, eft

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub, r.dom) && keyMatch(r.dom, p.dom) && r.obj == p.obj && r.act == p.act
```

- `g = _, _, _` - the membership relation is **domain-aware** (subject, role, domain).
- `g(r.sub, p.sub, r.dom)` - the registered domain matching function decides whether the request domain matches the stored membership domain. This is what makes `*` a wildcard.
- `keyMatch(r.dom, p.dom)` - a **built-in** matcher (no registration needed) that lets a permission with `p.dom = "*"` match any request domain.

**Register the domain matching function.** Pass `domainMatching` in the enforcer options - it registers once during `configure()`.

```typescript
import {
  AuthorizationEnforcerRegistry, AuthorizationEnforcerTypes, CasbinAuthorizationEnforcer,
  CasbinDomainMatchingFunctions, CasbinEnforcerModelDrivers, type ICasbinEnforcerOptions,
} from '@venizia/ignis';

AuthorizationEnforcerRegistry.getInstance().register({
  container: this,
  enforcers: [{
    enforcer: CasbinAuthorizationEnforcer,
    name: 'casbin',
    type: AuthorizationEnforcerTypes.CASBIN,
    options: {
      model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: theFlatModelConfAbove }, // your own .conf text - not a framework export
      adapter,
      cached,
      // For a domain model, normalizePayloadFn MUST always return a `domain`.
      normalizePayloadFn: ({ user, action, resource, context }) => ({
        subject: `User_${user.userId}`,
        domain: `Merchant_${resolveActiveMerchant({ context })}`,
        resource,
        action,
      }),
      domainMatching: { roleDefinition: 'g', fn: CasbinDomainMatchingFunctions.KEY_MATCH },
    } satisfies ICasbinEnforcerOptions,
  }],
});
```

> [!NOTE]
> `domainMatching` is opt-in. When omitted, domains are compared as exact strings and behavior is unchanged. The enforcer calls Casbin's `addNamedDomainMatchingFunc(roleDefinition, Util.keyMatchFunc)` internally - never call it directly.

**Choosing the matching function.** `keyMatch` is the safe default for opaque domain identifiers like `Merchant_<uuid>`. It treats only `*` as special and never splits on `/` or `:`, so it cannot accidentally match one tenant against another. Use the others only for structured path-style domains.

| Function | Adds |
|---|---|
| `CasbinDomainMatchingFunctions.KEY_MATCH` | Nothing beyond `*` (recommended default) |
| `CasbinDomainMatchingFunctions.KEY_MATCH_2` | URL-path `:param` segments |
| `CasbinDomainMatchingFunctions.KEY_MATCH_3` | `{param}` segments |
| `CasbinDomainMatchingFunctions.KEY_MATCH_4` | `{param}` segments with repeated-name equality checks |
| `CasbinDomainMatchingFunctions.REGEX_MATCH` | Full regular-expression matching on the stored value |

**Policy lines and outcomes**, using the flat model above with `keyMatch` registered on `g`. Each row calls `enforceSync(subject, domain, resource, action)`:

| Case | Policy lines | Request | Outcome |
|------|--------------|---------|---------|
| Scoped role (owner in a tenant) | `g, User_u, Role_owner, Merchant_A`<br/>`p, Role_owner, *, Material.find, read, allow` | `(User_u, Merchant_A, Material.find, read)` | allow |
| Scoped role - isolation | (same as above) | `(User_u, Merchant_B, Material.find, read)` | deny (`g` domain doesn't match) |
| Multi-tenant role | `g, User_u, Role_owner, Merchant_A`<br/>`g, User_u, Role_owner, Merchant_B`<br/>`p, Role_owner, *, Material.find, read, allow` | `(User_u, Merchant_B, Material.find, read)` | allow (one `g` line per tenant; a single `p` line) |
| Global role (for example, guest/onboarding) | `g, User_u, Role_guest, *`<br/>`p, Role_guest, *, Organizer.onBoarding, create, allow` | `(User_u, Merchant_anything, Organizer.onBoarding, create)` | allow (wildcard `g` domain) |
| Direct user permission (scoped) | `p, User_u, Merchant_A, Report.read, read, allow` | `(User_u, Merchant_A, Report.read, read)` | allow (reflexive `g(u,u,dom)` + `keyMatch`) |
| Direct user permission - isolation | (same as above) | `(User_u, Merchant_B, Report.read, read)` | deny |
| Deny override | `p, Role_x, *, Secret.read, read, deny`<br/>`p, Role_y, *, Secret.read, read, allow` | any domain where the user has both roles | deny (`!some(p.eft == deny)`) |

> [!IMPORTANT]
> The matching function is applied as `fn(requestDomain, policyDomain)` - the wildcard belongs on the **stored** side. Store only `*` or exact domain values (never `Merchant_*`) to keep tenant isolation guaranteed.

**Misconfiguration is caught early.** If `roleDefinition` is not declared under `[role_definition]` in the model, `configure()` throws at boot. Without that check, Casbin would silently register the function as a no-op, leaving wildcard domains permanently unmatched - global roles would be silently denied.

```typescript
// model declares `g` only
domainMatching: { roleDefinition: 'g2', fn: CasbinDomainMatchingFunctions.KEY_MATCH };
// throws: Role definition "g2" is not declared in the Casbin model. Declare it under
// [role_definition] (e.g. `g = _, _, _`) before enabling domainMatching.
```

## See also

- [Setup & Configuration](./) - binding keys, options interfaces, and initial setup
- [API Reference](./api) - architecture, enforcer internals, provider, registry, and adapters
- [Error Reference](./errors) - error messages and troubleshooting
- [Persistent Models](/guides/core-concepts/persistent/models#authorization-settings) - `@model` authorization settings
- [gRPC Controllers](/guides/core-concepts/grpc-controllers) - full gRPC decorator/route surface
