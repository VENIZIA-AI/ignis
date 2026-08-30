---
title: Authorization Getting Started
description: The mental model behind IGNIS authorization, then one grant seeded and enforced end to end
difficulty: beginner
---

# Authorization Getting Started

Every authorization question IGNIS answers - can this user do that, here - comes down to one thing: can you reach an `allow` edge by walking a graph from the user. This page builds that picture first, then seeds one real grant and watches one route go from 401 to 403 to 200.

## The graph, not the rule table

Forget rules for a moment. IGNIS authorization state is one graph. The nodes are four kinds of thing: `User`, `Role`, `Permission`, `Domain`. Every row in the single `PolicyDefinition` table is one edge between two nodes, and its `variant` column names what kind of edge it is - a role assignment, a domain membership, a permission grant, or one of three "inherits" edges that let one node stand in for a family of others.

A request is a tuple: who is asking (`subject`), where (`domain`), on what (`resource`), to do what (`action`). Casbin decides a request by walking the graph along all four of those axes at once. If it can reach an `allow` edge on every axis, and no `deny` edge also matches, the request passes. Nothing is precomputed - the walk runs fresh on every request, over the edges that user actually holds.

So what do `g`, `g2`, `g3`, `g4`, `g5` mean? Each one names the walk along one axis of that tuple - not a separate language to memorize.

| Relation | Axis | What it walks |
|---|---|---|
| `g` | subject | User holds Role, Role inherits Role |
| `g2` | domain (membership) | User belongs to Domain |
| `g3` | domain (nesting) | Domain contains Domain |
| `g4` | resource | Resource covers Resource |
| `g5` | action | Action covers Action |

`p` is not a walk - it is the edge you are trying to reach. A `p` line is a grant: an action, an effect (`allow` or `deny`), and a domain, attached to a User or a Role.

That is the whole model. The rest of this page makes it concrete: real tables, one real grant, one real request.

## Before you touch authorization

Authorization runs after authentication and only ever reads what authentication already put on the request. It needs two things from your authenticated user: `principalType` (which node type the user is - almost always `'user'`) and a `userId`. Neither is a dedicated field on `IAuthUser`; both are plain properties your authentication layer adds to the token payload.

Read the [Authentication component's entity column helpers](../authentication/usage#entity-column-helpers) before continuing. They define the `User`, `Role`, `Permission`, and `PolicyDefinition` columns this page builds on, and skipping them is the single most common reason authorization "does nothing": without `user.principalType`, the enforcer throws a 400 one step before it would even reach a 403.

## The three tables

Authorization reads three tables directly: `Role`, `Permission`, and `PolicyDefinition`. It never reads `User` - a request only ever carries `principalType` and `userId`, not a database row.

**`Role`**, via `extraRoleColumns()`:

| Column | Type | Meaning |
|---|---|---|
| `identifier` | text, unique | The casbin role name, for example `900_admin` |
| `name` | text | Human-readable label |
| `priority` | integer | Higher outranks lower; backs `AuthorizationRole` comparisons |
| `status` | text | Role lifecycle, defaults to `RoleStatuses.ACTIVATED` |
| `description` | text, nullable | Optional |

**`Permission`**, via `extraPermissionColumns()`:

| Column | Type | Meaning |
|---|---|---|
| `code` | text, unique | The resource string a route's `authorize.resource` matches, for example `configuration` |
| `subject` | text | Groups permissions by resource family, for example `Order` |
| `method` | text | For example `GET`; used by subset grants |
| `action` | text | For example `read` |
| `scope` | text | For example `global` |
| `parentId` | text or integer | Optional resource nesting |

**`PolicyDefinition`**, via `extraPolicyDefinitionColumns({ idType: 'string' })` - the edge table:

| Column | Type | Meaning |
|---|---|---|
| `variant` | text | Which of the seven edge kinds this row is |
| `subjectType`, `subjectId` | text | The edge's source node, for example `user` + a user id |
| `targetType`, `targetId` | text | The edge's destination node |
| `action` | text, nullable | Set only on `grant` rows |
| `effect` | text, nullable | `allow` or `deny`, set only on `grant` rows |
| `domain` | text, nullable | The casbin domain token - see the note below |
| `metadata` | jsonb, nullable | Only subset ("custom") grants use it |

`variant` must be one of exactly seven values, owned by `AuthorizationPolicyVariants`: `grant`, `assign_role`, `role_inherits`, `join_domain`, `domain_inherits`, `resource_inherits`, `action_inherits`. Nothing validates this column on read. A typo or a wrong value does not error - the row just never matches any query, and the grant it was meant to carry silently does not exist.

`domain` has the same trap. It stores a full casbin token, `<Type>_<id>` - for example `Organization_3fa85f64-5717-4562-b3fc-2c963f66afa6` - never a bare id. Get `variant` right and `domain` wrong, and every domain-scoped check for that row still fails. The next section shows the one way to avoid both mistakes at once.

## Register the component

This assumes a Postgres datasource is already registered - see [DataSources](/guides/core-concepts/persistent/datasources) if it is not yet. Adjust the import path and binding key to your own datasource class name.

```typescript
import {
  AuthorizeBindingKeys, AuthorizeComponent, AuthorizationDecisions, AuthorizationEnforcerRegistry,
  AuthorizationEnforcerTypes, CasbinAuthorizationEnforcer, CasbinEnforcerModelDrivers,
  ScopedCasbinAdapter, CASBIN_RBAC_DOMAIN_SCOPED_MODEL, BaseApplication, IAuthorizeOptions,
} from '@venizia/ignis';
import { PostgresDataSource } from './datasources/postgres.datasource';
import { Organization, Permission, PolicyDefinition, Role } from './models/entities';

export class Application extends BaseApplication {
  preConfigure() {
    const dataSource = this.get<PostgresDataSource>({ key: 'datasources.PostgresDataSource' });

    this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
      defaultDecision: AuthorizationDecisions.DENY,
      alwaysAllowRoles: ['999_super-admin'],
    });

    this.component(AuthorizeComponent);

    const adapter = new ScopedCasbinAdapter({
      dataSource,
      entities: {
        policyDefinition: { tableName: PolicyDefinition.name },
        permission: { tableName: Permission.name },
        principals: { user: 'user', role: Role.name },
        domainTypes: [Organization.name],
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

`entities.principals.user` must equal the exact `principalType` string your authentication layer puts on the token - `'user'` here. `entities.principals.role` must equal your `Role` entity's `.name`; it builds the casbin prefix for role-scoped lines (`Role_<id>`). `cached.use: false` re-reads policy rows on every request - fine while you are getting this working. The [RBAC with domains guide](./usage#rbac-with-domains-multi-tenant) covers adding a Redis cache once it matters.

## Seed exactly one grant

Build every `PolicyDefinition` row through `AuthorizationPolicyBuilder`. Never write `variant` or `domain` by hand - the builder cannot produce a wrong `variant`, and its `serializeDomain` step is what turns a typed `{ type, id }` domain into the `<Type>_<id>` token from the section above.

A grant needs three things to already exist: the user (from sign-up), one `Organization` row (the tenant), and one `Permission` row - say `code: 'configuration'`, `action: 'read'`. Seed those however you already seed reference data. Then seed the grant itself:

```typescript
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { AuthorizationActions, AuthorizationDecisions, AuthorizationPolicyBuilder } from '@venizia/ignis';

const pool = new Pool({ /* your connection */ });

const grant = AuthorizationPolicyBuilder.grant({
  subject: { type: 'user', id: userId },
  permission: { type: 'Permission', id: permissionId },
  action: AuthorizationActions.READ,
  effect: AuthorizationDecisions.ALLOW,
  domain: { type: 'Organization', id: organizationId },
});

await pool.query(
  `INSERT INTO "PolicyDefinition"
     (id, variant, subject_type, subject_id, target_type, target_id, action, effect, domain)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
  [randomUUID(), grant.variant, grant.subjectType, grant.subjectId, grant.targetType, grant.targetId, grant.action, grant.effect, grant.domain],
);
```

That one row is enough - no role, no role assignment. The scoped model's role, domain, resource, and action axes all fall back to a self-link when a request matches a stored value exactly, so a grant made directly to the user's own `subject` clears every axis on its own. `grant.domain` now reads `Organization_<organizationId>`, never the bare id.

`examples/vert/scripts/seed-user-policies.ts` runs this same builder call for seven personas at once, some with a role assignment added and some without - read it once you need more than one grant.

## Protect one route

```typescript
// Inside a controller's binding()
const READ_CONFIGURATIONS_CONFIG = {
  path: '/authz-example/configurations',
  method: 'get',
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  authorize: {
    action: AuthorizationActions.READ,
    resource: 'configuration',
    domain: { from: 'header', key: 'x-organization-id', type: 'Organization' },
  },
  responses: jsonResponse({ description: 'Configurations', schema: ConfigurationsSchema }),
} as const;

this.defineRoute({
  configs: READ_CONFIGURATIONS_CONFIG,
  handler: context => context.json({ data: ['app.name=My App'] }),
});
```

`domain: { from: 'header', ... }` reads the tenant id straight off a request header and turns it into the same `Organization_<id>` token the grant stores - no `domainResolver` needed yet. Now sign in as usual (see [Authentication Usage](../authentication/usage)) and call the route with three different tokens:

```bash
# No token at all
curl -i http://localhost:3000/api/authz-example/configurations
# -> 401: no authenticated user

# A signed-in user with zero PolicyDefinition rows
curl -i http://localhost:3000/api/authz-example/configurations \
  -H "Authorization: Bearer $TOKEN_WITHOUT_GRANT"
# -> 403: authenticated, but nothing to reach an allow edge

# The user from the previous section, with their organization's id
curl -i http://localhost:3000/api/authz-example/configurations \
  -H "Authorization: Bearer $TOKEN_WITH_GRANT" \
  -H "x-organization-id: $ORGANIZATION_ID"
# -> 200
```

`examples/vert` runs this exact scenario for real, with real ports and real tokens: `scripts/seed-authz-test-data.ts` and `scripts/seed-user-policies.ts` seed seven personas, and `scripts/test-authorization.sh` curls all of them - cases C1, C2, and C3 are the three requests above.

## What just happened

The 200 request walked the [seven-step pipeline](./#how-it-works) like this:

1. `Authorization.SKIP_AUTHORIZATION` was not set - continue.
2. `Authentication.CURRENT_USER` was present, with `principalType: 'user'` - continue.
3. No `alwaysAllowRoles` or `allowedRoles` matched - continue.
4. No voters were registered - continue.
5. The `casbin` enforcer resolved, the only one registered.
6. The `x-organization-id` header resolved to `Organization_<id>`. `ScopedCasbinAdapter` read the user's own rows from `PolicyDefinition` and built one `p` line from the grant you seeded.
7. `enforcer.evaluate()` matched that line on every axis - `g` and `g3` by self-link, since the grant names the user and the domain directly; `objectMatch` and `g5` by exact string equality on `configuration` and `read` - and returned `allow`.

The 403 request stopped at the same step 7, on the same enforcer, with no line to match: that user's `PolicyDefinition` rows were empty, so the rules built in step 6 had nothing in them. The 401 request never got past step 2 - there was no user to check anything against.

## Where to go next

- [Usage & Examples](./usage) - securing gRPC routes, voters, role shortcuts, CRUD factory integration, and domain scoping with a global `domainResolver`
- [API Reference](./api) - every option, binding key, and enforcer internal
- [Error Reference](./errors) - what each error means and how to fix it
- `examples/vert/src/controllers/authorization-example/` - the full controller these routes are drawn from
