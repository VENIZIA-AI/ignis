# Authorization -- Usage & Examples <Badge type="warning" text="Experimental" />

> Securing routes, voters, ABAC patterns, CRUD factory integration, and custom enforcers. See [Setup & Configuration](./) for initial setup.

## Securing Routes

### Imperative Route (defineRoute)

Use the `authorize` field in route configs to declare authorization requirements:

```typescript
import {
  BaseController,
  Authentication,
  AuthorizationActions,
} from '@venizia/ignis';

class ArticleController extends BaseController {
  binding() {
    // Read requires 'read' action on 'Article' resource
    this.defineRoute({
      configs: {
        path: '/',
        method: 'get',
        authenticate: { strategies: [Authentication.STRATEGY_JWT] },
        authorize: {
          action: AuthorizationActions.READ,
          resource: 'Article',
        },
        responses: jsonResponse({
          description: 'List of articles',
          schema: z.array(ArticleSchema),
        }),
      },
      handler: async (context) => {
        const articles = await this.articleService.findAll();
        return context.json(articles);
      },
    });

    // Delete requires 'delete' action with owner condition (ABAC)
    this.defineRoute({
      configs: {
        path: '/{id}',
        method: 'delete',
        authenticate: { strategies: [Authentication.STRATEGY_JWT] },
        authorize: {
          action: AuthorizationActions.DELETE,
          resource: 'Article',
          conditions: { ownerId: 'currentUser' },
        },
        responses: jsonResponse({
          description: 'Deleted article',
          schema: ArticleSchema,
        }),
      },
      handler: async (context) => {
        const { id } = context.req.valid('param');
        const result = await this.articleService.deleteById({ id });
        return context.json(result);
      },
    });
  }
}
```

### Multiple Authorization Specs

Pass an array of `IAuthorizationSpec` to require **all** specs to pass:

```typescript
import { Authentication, AuthorizationActions } from '@venizia/ignis';

this.defineRoute({
  configs: {
    path: '/admin/users/{id}',
    method: 'patch',
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },
    authorize: [
      { action: AuthorizationActions.UPDATE, resource: 'User' },
      { action: AuthorizationActions.MANAGE, resource: 'Admin' },
    ],
    responses: jsonResponse({
      description: 'Updated user',
      schema: UserSchema,
    }),
  },
  handler: async (context) => {
    // Both 'update:User' AND 'manage:Admin' must pass
  },
});
```

### Decorator-Based Route

Use the `authorize` field alongside `authenticate` in decorator configs:

```typescript
import { controller, get, post, AuthorizationActions, AuthorizationRoles } from '@venizia/ignis';

@controller({ path: '/articles' })
class ArticleController extends BaseController {
  @get({
    configs: {
      path: '/',
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      authorize: { action: AuthorizationActions.READ, resource: 'Article' },
      responses: jsonResponse({ description: 'Articles', schema: z.array(ArticleSchema) }),
    },
  })
  async findAll(opts: { context: TRouteContext }) {
    // Handler runs only if authorized
  }

  @post({
    configs: {
      path: '/',
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      authorize: {
        action: AuthorizationActions.CREATE,
        resource: 'Article',
        allowedRoles: ['editor', AuthorizationRoles.ADMIN.name],
      },
      request: { body: jsonContent({ schema: CreateArticleSchema }) },
      responses: jsonResponse({ description: 'Created article', schema: ArticleSchema }),
    },
  })
  async create(opts: { context: TRouteContext }) {
    // Handler runs if user has 'create:Article' permission OR 'editor'/'admin' role
  }
}
```

## Using the `authorize()` Standalone Function

The `authorize()` function is a convenience wrapper around `AuthorizationProvider`. It returns a Hono `MiddlewareHandler`:

```typescript
import { authorize, authenticate, Authentication, AuthorizationActions } from '@venizia/ignis';

// Use as Hono middleware directly
app.delete(
  '/articles/:id',
  authenticate({ strategies: [Authentication.STRATEGY_JWT] }),
  authorize({ spec: { action: AuthorizationActions.DELETE, resource: 'Article' } }),
  (c) => {
    const user = c.get(Authentication.CURRENT_USER);
    return c.json({ deleted: true });
  },
);
```

## Voters

Voters provide custom authorization logic that runs **before** the enforcer. Each voter returns one of three decisions:

| Decision | Effect |
|----------|--------|
| `AuthorizationDecisions.ALLOW` | Immediately grants access (skips enforcer) |
| `AuthorizationDecisions.DENY` | Immediately denies access (throws 403) |
| `AuthorizationDecisions.ABSTAIN` | No opinion -- continues to next voter or enforcer |

### Basic Voter Example

```typescript
import {
  AuthorizationActions,
  AuthorizationDecisions,
  TAuthorizationVoter,
} from '@venizia/ignis';

const ownerVoter: TAuthorizationVoter = async ({ user, action, resource, context }) => {
  if (action !== AuthorizationActions.UPDATE && action !== AuthorizationActions.DELETE) {
    return AuthorizationDecisions.ABSTAIN;
  }

  const articleId = context.req.param('id');
  const article = await articleService.findById({ id: articleId });

  if (!article) {
    return AuthorizationDecisions.ABSTAIN;
  }

  if (article.authorId === user.userId) {
    return AuthorizationDecisions.ALLOW;
  }

  return AuthorizationDecisions.ABSTAIN; // Let enforcer decide
};
```

### Using Voters in Routes

```typescript
this.defineRoute({
  configs: {
    path: '/{id}',
    method: 'patch',
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },
    authorize: {
      action: AuthorizationActions.UPDATE,
      resource: 'Article',
      voters: [ownerVoter],
    },
    // ...
  },
  handler: async (context) => {
    // Runs if: owner (voter ALLOW) OR enforcer permits
  },
});
```

### Multiple Voters

Voters are evaluated sequentially. The first non-ABSTAIN decision wins:

```typescript
authorize: {
  action: AuthorizationActions.UPDATE,
  resource: 'Article',
  voters: [ownerVoter, adminOverrideVoter, timeWindowVoter],
}
```

**Evaluation flow:**
1. `ownerVoter` returns `ABSTAIN` -- continue
2. `adminOverrideVoter` returns `ALLOW` -- **access granted** (skips remaining voters and enforcer)

> [!TIP]
> Use `ABSTAIN` as the default return when a voter doesn't have a strong opinion. Only return `DENY` when you're certain the request should be blocked regardless of other checks.

## ABAC (Attribute-Based Access Control)

### Defining Conditional Rules

Use `conditions` on both `IPermissionRule` and `IAuthorizationSpec` for attribute-based access:

```typescript
// In defineAbilitiesFor:
defineAbilitiesFor: ({ user, builder }) => {
  // Allow users to update their own articles
  builder.allow({
    action: AuthorizationActions.UPDATE,
    resource: 'Article',
    conditions: { ownerId: user.userId },
  });

  // Deny deleting published articles
  builder.deny({
    action: AuthorizationActions.DELETE,
    resource: 'Article',
    conditions: { status: 'published' },
  });
},
```

### Route-level Conditions

```typescript
authorize: {
  action: AuthorizationActions.UPDATE,
  resource: 'Article',
  conditions: { department: 'engineering' },
}
```

### How Condition Matching Works

Conditions use strict equality (`===`) matching:

1. **No conditions on rule** -- rule matches all requests (wildcard)
2. **Rule has conditions, request doesn't** -- no match (rule is more specific than request)
3. **Both have conditions** -- every rule condition key must match the request condition value

```typescript
// Rule: { action: 'update', resource: 'Article', conditions: { ownerId: '123' } }
// Request conditions: { ownerId: '123' }           → MATCH
// Request conditions: { ownerId: '456' }           → NO MATCH
// Request conditions: { ownerId: '123', dept: 'x' } → MATCH (superset OK)
// Request conditions: undefined                      → NO MATCH
```

## Role-Based Shortcuts

### Global `alwaysAllowRoles`

Roles listed in `alwaysAllowRoles` bypass **all** authorization checks globally:

```typescript
import { AuthorizationRoles } from '@venizia/ignis';

this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: DefaultAuthorizationEnforcer,
  alwaysAllowRoles: [AuthorizationRoles.SUPER_ADMIN.name, 'system'],
  // ...
});
```

### Per-Route `allowedRoles`

Roles listed in `allowedRoles` on a specific `IAuthorizationSpec` bypass the enforcer for that route only:

```typescript
authorize: {
  action: AuthorizationActions.DELETE,
  resource: 'Article',
  allowedRoles: [AuthorizationRoles.ADMIN.name, 'moderator'],
}
```

### Role Extraction

The authorization middleware extracts roles from the authenticated user's `roles` field. It supports multiple formats:

```typescript
// String array
roles: ['admin', 'user']

// Object array with identifier
roles: [{ id: 1, identifier: 'admin', priority: 900 }]

// Object array with name fallback
roles: [{ id: 1, name: 'admin' }]

// Object array with id-only fallback
roles: [{ id: 1 }]
```

Extraction priority: `identifier` > `name` > `String(id)`

## CRUD Factory Integration

### Controller-Level Authorization

Apply authorization to all CRUD routes:

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

### Per-Route Overrides

Override authorization per CRUD endpoint:

```typescript
import { AuthorizationActions, AuthorizationRoles } from '@venizia/ignis';

ControllerFactory.defineCrudController({
  entity: Article,
  repository: { name: 'ArticleRepository' },
  controller: { name: 'ArticleController', basePath: '/articles' },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  authorize: { action: AuthorizationActions.READ, resource: 'Article' },
  routes: {
    // Public read -- skip both auth
    find: { authenticate: { skip: true } },
    count: { authenticate: { skip: true } },

    // Custom authorization for write operations
    create: {
      authorize: { action: AuthorizationActions.CREATE, resource: 'Article' },
    },
    updateById: {
      authorize: { action: AuthorizationActions.UPDATE, resource: 'Article' },
    },

    // Skip only authorization (still requires auth)
    findOne: { authorize: { skip: true } },

    // Strict delete with custom roles
    deleteById: {
      authorize: {
        action: AuthorizationActions.DELETE,
        resource: 'Article',
        allowedRoles: [AuthorizationRoles.ADMIN.name],
      },
    },
  },
});
```

### Priority Resolution (Factory Routes)

The `defineControllerRouteConfigs` function resolves authorization with this priority:

1. **`authenticate: { skip: true }`** -- skips both authentication and authorization
2. **`authorize: { skip: true }`** -- skips authorization only
3. **Per-route `authorize` spec** -- overrides controller-level
4. **Controller-level `authorize`** -- default for all routes

## Using the AbilityBuilder

The `AbilityBuilder` provides a fluent API for defining permission rules:

```typescript
import { AbilityBuilder, AuthorizationActions, AuthorizationDecisions } from '@venizia/ignis';

const builder = new AbilityBuilder();

// Allow read on all resources
builder.allow({ action: AuthorizationActions.READ, resource: 'all' });

// Allow create on specific resource
builder.allow({ action: AuthorizationActions.CREATE, resource: 'Article' });

// Deny delete with conditions
builder.deny({
  action: AuthorizationActions.DELETE,
  resource: 'Article',
  conditions: { status: 'published' },
});

const rules = builder.build();
// [
//   { action: 'read', resource: 'all', effect: 'allow' },
//   { action: 'create', resource: 'Article', effect: 'allow' },
//   { action: 'delete', resource: 'Article', effect: 'deny', conditions: { status: 'published' } },
// ]
```

### Rule Evaluation Order

The Default enforcer evaluates rules with these semantics:

1. **Find matching rules** -- filter by action, resource, and conditions
2. **Deny takes precedence** -- if any matching rule has `effect: 'deny'`, access is denied
3. **Allow check** -- if any matching rule has `effect: 'allow'`, access is granted
4. **No match** -- falls back to `defaultDecision`

### Wildcard Matching

| Pattern | Meaning |
|---------|---------|
| `action: 'manage'` | Matches **any** action |
| `resource: 'all'` | Matches **any** resource |
| No conditions | Matches **any** request conditions |

```typescript
// This single rule allows everything
builder.allow({ action: AuthorizationActions.MANAGE, resource: 'all' });
```

## Dynamic Skip Authorization

Use `Authorization.SKIP_AUTHORIZATION` to dynamically bypass authorization in middleware:

```typescript
import { Authorization } from '@venizia/ignis';
import { createMiddleware } from 'hono/factory';

const conditionalAuthzMiddleware = createMiddleware(async (c, next) => {
  // Skip authorization for internal service-to-service calls
  if (c.req.header('X-Internal-Service') === 'trusted-key') {
    c.set(Authorization.SKIP_AUTHORIZATION, true);
  }
  return next();
});
```

## Ability Caching

The authorization middleware caches abilities on the Hono context to avoid rebuilding them on every request. This is especially useful when multiple authorization specs are applied to the same route:

```typescript
// First spec triggers buildAbilities() → result cached on context
authorize: [
  { action: AuthorizationActions.READ, resource: 'Article' },
  { action: AuthorizationActions.READ, resource: 'Comment' },
]
// Second spec reuses cached abilities → no rebuild
```

> [!TIP]
> Ability caching happens per-request. Each new HTTP request starts with an empty cache. If you need to invalidate cached abilities mid-request (e.g., after role change), set `context.set(Authorization.ABILITIES, null)`.

## Custom Enforcer

Create a custom enforcer by implementing `IAuthorizationEnforcer`:

```typescript
import {
  IAuthorizationEnforcer,
  IAuthUser,
  TAuthorizationConditions,
  TContext,
} from '@venizia/ignis';
import { BaseHelper } from '@venizia/ignis-helpers';

type MyAbilities = Map<string, Set<string>>;

class MyCustomEnforcer extends BaseHelper implements IAuthorizationEnforcer<MyAbilities> {
  name = 'my-custom';

  constructor(private options: IAuthorizeOptions) {
    super({ scope: MyCustomEnforcer.name });
  }

  async buildAbilities(opts: { user: IAuthUser; context: TContext }): Promise<MyAbilities> {
    const abilities = new Map<string, Set<string>>();
    // Build your abilities map
    return abilities;
  }

  evaluate(opts: {
    abilities: MyAbilities;
    action: string;
    resource: string;
    conditions?: TAuthorizationConditions;
  }): boolean {
    const { abilities, action, resource } = opts;
    const resourceActions = abilities.get(resource);
    return resourceActions?.has(action) ?? false;
  }
}
```

Then use it in your options:

```typescript
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: MyCustomEnforcer,
  // ...
});
```

## Hono Context Extension

The Authorization module extends Hono's `ContextVariableMap` to provide type-safe access to authorization data:

```typescript
declare module 'hono' {
  interface ContextVariableMap {
    [Authorization.ABILITIES]: unknown;
    [Authorization.SKIP_AUTHORIZATION]: boolean;
  }
}
```

This enables type-safe access in route handlers and middleware:

```typescript
// Read cached abilities (type depends on enforcer)
const abilities = c.get(Authorization.ABILITIES);

// Skip authorization for this request
c.set(Authorization.SKIP_AUTHORIZATION, true);
```

## See Also

- [Setup & Configuration](./) -- Binding keys, options interfaces, and initial setup
- [API Reference](./api) -- Architecture, enforcer internals, provider, and registry
- [Error Reference](./errors) -- Error messages and troubleshooting
