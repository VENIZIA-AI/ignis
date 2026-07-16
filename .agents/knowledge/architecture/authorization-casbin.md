---
type: Architecture
title: Casbin authorization
description: How scoped RBAC is stored as graph edges, translated into Casbin lines by ScopedCasbinAdapter, and evaluated per request on a pooled enforcer.
resource: packages/core/src/components/auth/authorize
tags: [architecture, authorization, casbin, rbac, scoped]
---

Authorization is Casbin-based and **scoped** - the model is domain-aware (`sub, dom, obj, act`), so a grant can be narrowed to a tenant. Casbin is an optional peer dependency, imported dynamically and reported as a clear error when absent.

## Edges, not closures

The whole RBAC state is a graph. Nodes are User / Role / Permission / Domain; every row of the single `PolicyDefinition` table is **one edge** linking a `subject` (type + id) to a `target` (type + id), with a `variant` column saying what kind of edge it is. Nothing stores a precomputed transitive closure - closures are expanded at load time.

`AuthorizationPolicyVariants` maps each app-level edge type onto a Casbin rule prefix. `CasbinRuleVariants` numbers the grouping relations in **request-tuple order** (`sub -> dom -> obj -> act`) so the matcher reads left to right:

| Variant | DB `variant` | Casbin rule | Meaning |
| --- | --- | --- | --- |
| `GRANT` | `grant` | `p` | Permission to a User or Role, carrying action / effect / domain |
| `ASSIGN_ROLE` | `assign_role` | `g` | User holds a Role (domain-scoped, or `*` for every domain) |
| `ROLE_INHERITS` | `role_inherits` | `g` | Role inherits Role (DAG). Shares `g` with `ASSIGN_ROLE` so user -> role -> parent resolves in one lookup |
| `JOIN_DOMAIN` | `join_domain` | `g2` | User is a member of a Domain - the `dom` membership axis |
| `DOMAIN_INHERITS` | `domain_inherits` | `g3` | Domain nesting - the `dom` hierarchy axis |
| `RESOURCE_INHERITS` | `resource_inherits` | `g4` | Resource nesting - the `obj` axis |
| `ACTION_INHERITS` | `action_inherits` | `g5` | Action nesting - the `act` axis |

`GRANT`, `ASSIGN_ROLE`, and `JOIN_DOMAIN` are per-**user** edges. `ROLE_INHERITS`, `RESOURCE_INHERITS`, `ACTION_INHERITS`, and `DOMAIN_INHERITS` are shared **structural** edges - they describe the org, not a user, so they load identically for everyone.

`g4` + `g5` combine multiplicatively: a `manage Order` grant covers a `read OrderItem` request. Dotted resource nesting (`Order.findById` inside `Order`) needs **no edge at all** - it is handled by the registered `objectMatch` function, so `g4` is only for non-standard nesting.

## The two special domain scopes

`AuthorizationDomainScopes`:

- **`ANY_MEMBER`** - the grant applies in every domain the subject has joined, checked through the `join_domain` / `g2` relation.
- **`SYSTEM_WIDE`** - the grant applies everywhere, bypassing membership. Super-admin only.

`SYSTEM_WIDE` is also the fallback in `evaluate()`: in scoped mode a request with no resolvable domain still enforces **with** a domain, because falling through to the 3-argument path would shift arguments against the 4-token model and silently misjudge.

## The adapter situation

`ScopedCasbinAdapter` is the canonical adapter. It is read-only and filtered: `loadFilteredPolicy(model, { principal })` fires the per-principal queries (role assignments, memberships, direct grants) and `loadStructuralTrees()` in parallel, then expands the **role closure** from the loaded `role_inherits` edges and fetches the inherited grants for it.

`BaseFilteredAdapter` is deliberately thin - it owns only the connector plumbing, a `query()` helper, `loadLines()`, and no-op write methods. Its `query()` exists because Drizzle's `execute()` result shape differs per driver (`node-postgres` yields `{ rows }`, `postgres-js` yields the row list itself), so adapters must never read `.rows` directly; `readResultRows()` normalizes it. There is no `DrizzleCasbinAdapter` in source.

## Evaluation is per-request on a pooled enforcer

This is the part most likely to be remembered wrong. **There is no shared serving model.** `CasbinAuthorizationEnforcer` holds a `BasePoolHelper<Enforcer>` (default size 16, 5s acquire timeout). Pooled enforcers are created **without an adapter** - no DB load at warmup. Inside a single `pool.use()` callback the borrowed enforcer is `clearPolicy`'d, loaded with *this* user's lines, `buildRoleLinks`'d, and `enforceExSync`'d atomically; the pool destroys the enforcer on any error (fail-closed). The historical time-of-check/time-of-use race on a shared model is **gone** - do not report it against current source.

Line extraction also never touches a serving enforcer: `extractUserLines()` builds an **isolated throwaway** enforcer with the adapter, so a concurrent request cannot contaminate what gets cached. `extractLinesFrom()` serializes every p-type and g-type (not just `p`/`g`), which is what makes a cached payload complete for the scoped model.

Optional Redis caching keys lines per user via `keyFn`; concurrent misses for the same key collapse onto one extraction through `pendingLineFetches` (best-effort - two misses can both extract, which is benign since per-user lines are identical). A corrupted cache entry is discarded and refetched, never a 500. `invalidateUserCache()` and `rebuildUserCache()` are the on-demand hooks.

`configure()` runs a matcher smoke test (`assertMatcherCompilesSync`), because Casbin compiles the matcher lazily on first enforce - without it, a syntax error or an unregistered function would only surface on the first real request.

## The request path

`authorize({ spec, enforcerName })` wraps `AuthorizationProvider`. Per request: skip flag -> require an authenticated user (401 otherwise) -> `alwaysAllowRoles` / `spec.allowedRoles` bypass -> voters (`ALLOW` short-circuits, `DENY` throws 403, `ABSTAIN` continues) -> **if no enforcers are registered, skip authorization entirely** -> resolve the enforcer from `AuthorizationEnforcerRegistry` -> resolve the request domain (only when `spec.domain` or a configured `domainResolver` is in play, to avoid an unnecessary DB hit) -> build rules -> evaluate. A `DENY` logs the deciding policy rule, or `<none - default-deny>` when nothing matched.

## Related

- [Authentication](/architecture/authentication.md)
- [Component Model](/architecture/component-model.md)
- [DataSource Hierarchy](/architecture/datasource-hierarchy.md)
- [vert Example](/examples/vert.md)
