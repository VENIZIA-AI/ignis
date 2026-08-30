---
type: Architecture
title: Casbin authorization
description: How scoped RBAC is stored as graph edges, translated into Casbin lines by ScopedCasbinAdapter, and evaluated per request on a pooled enforcer.
resource: packages/kernel/src/base/auth/authorize
tags: [architecture, authorization, casbin, rbac, scoped]
---

Authorization is Casbin-based and **scoped** - the model is domain-aware (`sub, dom, obj, act`), so a grant can be narrowed to a tenant. Casbin is an optional peer dependency, imported dynamically and reported as a clear error when absent.

## Where the code lives

The tree is split across two packages. The engine-free seam lives in `@venizia/ignis-kernel` at `packages/kernel/src/base/auth/authorize`: all of `common` (`AuthorizationPolicyVariants`, `CasbinRuleVariants`, `AuthorizationDomainScopes`, `AuthorizeBindingKeys`), the `authorize()` middleware, `AuthorizationProvider` and `resolveRequestDomain`, `AuthorizationEnforcerRegistry`, the `AuthorizationRole` model, and the builders (`GrantBuilder`, `AuthorizationPermissionBuilder`, `AuthorizationPolicyBuilder`). `casbin` is an optional peer of kernel and only ever type-imported there - `common/types.ts` imports `type Adapter` and nothing else.

The Drizzle- and Casbin-bound half stays in core at `packages/core-server/src/components/auth/authorize`: `BaseFilteredAdapter`, `ScopedCasbinAdapter`, `AuthorizeComponent`, `CasbinAuthorizationEnforcer`, `ResourceRoleManager`, and `CASBIN_RBAC_DOMAIN_SCOPED_MODEL`. Core's barrel re-exports the kernel barrel, so a `@venizia/ignis-core` import still resolves every symbol on either side of the split. Unqualified paths below are core-relative.

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

The `variant` column's TypeScript type is closed to these seven values by default. An app can store
its own edge kind in the same table - `ScopedCasbinAdapter` never selects an undeclared variant, so
it is purely the app's data - by declaring it via `extraPolicyDefinitionColumns({ extraVariants: [...] })`
in `packages/core-server/src/components/auth/models/entities/policy-definition.model.ts`. `effect`
does not get the same treatment: its value is read by Casbin's own effect evaluator, not merely
filtered on, so an undeclared value there is a correctness risk, not a harmless unselected row.

`g4` + `g5` combine multiplicatively: a `manage Order` grant covers a `read OrderItem` request. Dotted resource nesting (`Order.findById` inside `Order`) needs **no edge at all** - it is handled by the registered `objectMatch` function, so `g4` is only for non-standard nesting.

`g4` is served by a dedicated `ResourceRoleManager` (`role-managers/resource.ts`), not `addNamedMatchingFunc`: `addMatchingFunc` sets Casbin's `hasPattern`, which disables `DefaultRoleManager`'s O(1) fast path on *every* link check, not just `g4` lookups. `ResourceRoleManager` seeds its walk from **every stored prefix ancestor** of a dotted code (`a.b.c` -> `a.b` -> `a`, not only the deepest). Its contract differs from the replaced `objectMatch` matching function in three ways:

- The dot rule (a dotted code belongs to its prefix) applies only to the **request object**, never to a stored node name. The replaced function also auto-linked a stored dotted node to its prefix, but only when that prefix already existed in its temporary map at check time - a result that depended on database row order, not a stable contract. The new behavior is deterministic and narrower in exactly that case.
- A stored `'*'` node is reachable from any request object, mirroring `objectMatch(anything, '*')`.
- The old `maxHierarchyLevel = 10` depth ceiling no longer applies - the walk is unbounded and cycle-safe.

## Policy effect: deny overrides allow

The model's `[policy_effect]` is `some(where (p.eft == allow)) && !some(where (p.eft == deny))`: at least one matching `allow` row is required, and **any** matching `deny` row overrides it, regardless of how many `allow` rows also match. This is undocumented elsewhere and consumers depend on it for carve-outs (grant broadly, then deny a narrower case).

## The two special domain scopes

`AuthorizationDomainScopes`:

- **`ANY_MEMBER`** - the grant applies in every domain the subject has joined, checked through the `join_domain` / `g2` relation.
- **`SYSTEM_WIDE`** - the grant applies everywhere, bypassing membership. Super-admin only.

`SYSTEM_WIDE` is also the fallback in `evaluate()`: in scoped mode a request with no resolvable domain still enforces **with** a domain, because falling through to the 3-argument path would shift arguments against the 4-token model and silently misjudge.

## The adapter situation

`ScopedCasbinAdapter` is the canonical adapter. It is read-only and filtered. `loadFilteredPolicy(model, { principal })` issues **two** statements concurrently, neither waiting on the other (an opt-in third source, `resolveDomainEdges`, joins in after the first resolves - see "Per-principal domain edges" below):

- `queryPrincipalPolicies` - one statement covering everything scoped to the principal: its own `assign_role` / `join_domain` / `grant` rows (`kind: 'direct'`), the `role_inherits` edges reachable from its roles (`kind: 'roleEdge'`), the grants of that role closure (`kind: 'roleGrant'`), and the `domain_inherits` edges reachable from its domains (`kind: 'domainEdge'`). Two `WITH RECURSIVE` CTEs share one clause: `role_closure` (unchanged) and `domain_closure`, which seeds from the principal's `join_domain` rows and walks **up** the parent chain over `domain_inherits`. Both recursive terms use `UNION`, not `UNION ALL` - the de-duplication is what terminates a cyclic graph. Only `role_inherits` edges reachable from the principal's roles, and only `domain_inherits` edges whose **child** is inside `domain_closure`, are emitted - narrower than emitting the whole tree to every user, and behavior-preserving, since an edge outside the closure could never be traversed by the matcher.
- `queryEdgePolicies` - the two code-fixed structural trees, `resource_inherits` (`g4`) and `action_inherits` (`g5`). Both stay load-all: a few hundred rows, constant regardless of tenant count. `domain_inherits` (`g3`) used to be a third branch here, loaded whole for every user; it moved into `queryPrincipalPolicies` because, unlike resource/action, the domain tree grows with the number of domains (many merchants under few organizers), and loading it whole through this per-principal path stopped scaling. See "Domain hierarchy edges" below for how those `g3` lines then reach `g` and `g2` as well.

The permission join in `queryPrincipalPolicies` is a `LEFT JOIN`: a grant whose target does not resolve (missing or soft-deleted `Permission` row) is logged and skipped by the shared `buildGrantLines`, rather than vanishing from the result set silently. `buildGrantLines` also still drops a grant row with a null `action` (it cannot emit a valid `p` line without one), logging an error naming the subject and object rather than dropping it silently - a dropped row is a permission hole a caller cannot otherwise see.

### No cache

**There is no cache in the adapter.** Extraction re-reads both statements on every `loadFilteredPolicy()` call. A short-lived structural cache existed briefly earlier on this branch and was never released - see the [2026-07-20 changelog](/changelogs/2026-07-20-casbin-single-wave-extraction) for the removed API surface. Adding a cache back is the wrong answer to extraction cost - the framework authors these queries, so it owns saying what they need, and what they need is indexes on `PolicyDefinition` the framework does not create (the consumer owns its schema):

- `(variant, subject_type, subject_id)` - the anchor term of both CTEs (`role_closure`'s seed, `domain_closure`'s seed) and the `direct` branch.
- `(variant, subject_id)` - the `role_closure` recursive term's join and the role-grant branch.
- `(variant, subject_type, subject_id)` again - `domain_closure`'s recursive term and the `domainEdge` branch both join on the `(subject_type, subject_id)` pair, not `subject_id` alone, because a domain node's identity is `(type, id)`.
- `(variant)`, or per-variant partial indexes - `queryEdgePolicies`' two branches, which filter on `variant` alone.

Measured with `EXPLAIN (ANALYZE, BUFFERS)` against a real Postgres database: the grant branch's `(subject_type, subject_id)` scan and the permission join's primary-key lookup are already efficient; without the anchor/recursive index above, the CTE's recursive term falls back to a sequential scan, because nothing indexes `variant`. A query the framework writes and an index it never mentions is the seam that produced the production incident this adapter's read path descends from.

`BaseFilteredAdapter` is deliberately thin - it owns only the connector plumbing, a `query()` helper, `loadLines()`, and no-op write methods. Its `query()` exists because Drizzle's `execute()` result shape differs per driver (`node-postgres` yields `{ rows }`, `postgres-js` yields the row list itself), so adapters must never read `.rows` directly; `readResultRows()` normalizes it. There is no `DrizzleCasbinAdapter` in source.

The `connector` getter resolves `dataSource.getConnector?.() ?? dataSource.connector`, throwing a named `[BaseFilteredAdapter]` framework error when a datasource exposes neither - a cold (not-yet-wired) datasource used to fail with a bare `TypeError` instead. `ICasbinPolicySource` declares both `getConnector?()` (preferred - lazily wires the driver, survives pool rotation) and `connector?` (back-compat, a pre-wired connector) as optional.

### Subset grants (custom rows)

A grant row can express an arbitrary subset of a subject's operations instead of a full tier:
`action = 'custom'`, target = a **subject-level resource node** (a `Permission` row whose `method`
is the `*` sentinel), `metadata: { ops: [...] }`. `ops` holds **method names**, not full permission
codes - the subject comes from the target node, so `ops: ['find']` against node `Order` resolves to
`Order.find`. `AuthorizationActions.CUSTOM` is a grant-mode marker, deliberately absent from
`LATTICE`.

`ScopedCasbinAdapter` expands each custom row into one `p` line per operation, each carrying that
operation's **catalogued** action, never the `custom` sentinel, so the emitted lines are
byte-identical to what equivalent per-operation grant rows produce - nothing downstream can
distinguish the two encodings. Expansion costs one batched catalog query (`queryOperationCatalog`)
per extraction, and none when no custom rows are present. Reading is **opt-in**: without
`entities.policyDefinition.metadata.columnName`, the adapter never selects `metadata`, and a custom
row is logged and skipped. `rejectCustomRow` names every rejection reason (unmapped
`metadata.columnName`, unusable `ops`, ambiguous `action`/`metadata` pairing, a target that is not a
resource node); an individual unresolvable operation name is logged and skipped separately by
`expandCustomGrants`, without dropping the row's other valid operations.

`GrantBuilder.planGrant` (`packages/kernel/src/base/auth/authorize/builders/grant.builder.ts`) is the write side and mirrors the expansion. A custom row is
a last resort: an `ops` selection collapses into tier grants wherever a tier is fully covered -
`manage` only when the subject has at least one operation in each of `read`, `write`, and `execute`,
since otherwise `manage` would cover a future operation in the empty tier and silently pre-authorize
it. Partial coverage never collapses, and a single leftover operation becomes a per-operation row
rather than a one-operation custom row. `exact: true` opts out of collapsing entirely. `planGrant`
throws on an unknown operation while the reader logs and skips - a write is one deliberate act by a
caller who can be corrected, a read is a bulk operation over data that may already be inconsistent,
where one bad row must not deny a user their remaining permissions.

The per-request cost budget: `evaluate()` on a ~1000-line payload must stay under 50ms (measured ~2ms; the guard is loose on purpose to avoid CI flakes), guarded by `scoped-enforce-parity.test.ts`.

## Evaluation is per-request on a pooled enforcer

This is the part most likely to be remembered wrong. **There is no shared serving model.** `CasbinAuthorizationEnforcer` holds a `BasePoolHelper<Enforcer>` (default size 16, 5s acquire timeout). Pooled enforcers are created **without an adapter** - no DB load at warmup. Inside a single `pool.use()` callback the borrowed enforcer is `clearPolicy`'d, loaded with *this* user's lines, `buildRoleLinks`'d, and `enforceExSync`'d atomically; the pool destroys the enforcer on any error (fail-closed). The historical time-of-check/time-of-use race on a shared model is **gone** - do not report it against current source.

Line extraction also never touches a serving enforcer: `PolicyLineCodec.extractUserLines()` (`enforcers/policy-line-codec.ts`) builds an **isolated throwaway** enforcer with the adapter, so a concurrent request cannot contaminate what gets cached. `PolicyLineCodec.extractLinesFrom()` serializes every p-type and g-type (not just `p`/`g`), which is what makes a cached payload complete for the scoped model. `CasbinAuthorizationEnforcer` only resolves the model and forwards to the codec.

Optional Redis caching keys lines per user via `keyFn`, delegated to a `UserPolicyLineCache` (`enforcers/user-policy-line-cache.ts`) that `CasbinAuthorizationEnforcer` holds one of, lazily, per enforcer instance. Concurrent misses for the same key collapse onto one extraction through its `pendingLineFetches` map (best-effort - two misses can both extract, which is benign since per-user lines are identical). A corrupted cache entry is discarded and refetched, never a 500. `invalidateUserCache()` and `rebuildUserCache()` on `CasbinAuthorizationEnforcer` are the on-demand hooks; they delegate to the cache's `invalidate()`/`rebuild()`.

`configure()` runs a matcher smoke test (`assertMatcherCompilesSync`), because Casbin compiles the matcher lazily on first enforce - without it, a syntax error or an unregistered function would only surface on the first real request.

## Domain hierarchy edges reach all three axes through one overlay

A role held, or a grant declared, at a parent domain reaching every domain beneath it is expressed **once**: as `g3` policy lines in a principal's own line set. There is no separate shared tree, TTL, or per-process cache for this - it rides the same per-user policy-line path (and cache invalidation) as every other edge in this system. **The matcher does not change** - `CASBIN_RBAC_DOMAIN_SCOPED_MODEL` stays byte-identical; this is handled entirely at the role-manager layer beneath it.

Two sources feed `g3` lines into a principal's line set, and an application can use either or both:

- **The `DOMAIN_EDGE` branch of `queryPrincipalPolicies`** (see "The adapter situation" above) - `domain_inherits` rows reachable from the principal's own domain closure, walked in the same recursive CTE that seeds `domain_closure`. This suits a hierarchy that IS authorization data, stored in `PolicyDefinition` alongside every other edge.
- **`ScopedCasbinAdapter`'s `resolveDomainEdges` hook**, configured on the adapter's constructor (not the enforcer - the enforcer never constructs the adapter):

  ```ts
  new ScopedCasbinAdapter({
    dataSource,
    entities,
    resolveDomainEdges: async ({ principal, domains }) => [{ child, parent }, ...],
  });
  ```

  `domains` is the principal's own domain closure, reconstructed from rows `queryPrincipalPolicies` already fetched (the `join_domain` seed plus both ends of every `domainEdge` row) rather than a third query. This suits a hierarchy the app already owns as a plain foreign key on a business table (a tenant tree) - it is read live on every cache miss, never duplicated into `domain_inherits`. A throwing hook is caught, logged, and treated as no edges for that one load - the rows already gathered still load normally. This is the fail-secure direction: a missing `g3` edge only narrows what `g`/`g2`/`g3` reach, never widens it. A hook edge duplicating a real `domain_inherits` row is harmless - both become `g3` lines, and `DomainHierarchyRoleManager.addLink` stores parents in a `Set`, so the duplicate `addLink` call is a no-op. The hook cannot join `queryPrincipalPolicies`'s wave (it needs that query's rows to compute `domains`) but does not wait on the independent `queryEdgePolicies` either - both resolve concurrently once the closure is known.

Either way, `loadFilteredPolicy` emits the same `g3, <child>, <parent>` line shape, so nothing downstream can tell which source produced a given edge.

### One overlay `Map`, three role managers

`registerMatchers()` builds one overlay `Map<child, Set<parent>>` per pooled enforcer and hands the **same instance** to all three role managers whenever the model is scoped (`isScoped: true`) - this wiring is unconditional, not a separate opt-in:

| Axis | Role manager | Gains |
|---|---|---|
| `g` (role assignment) | `DomainHierarchyRoleManager`, `reversed: true`, plugged into casbin's own `DefaultRoleManager.addDomainHierarchy()` | A role assigned at a parent domain matches a request at any child domain. |
| `g3` (grant) | `DomainHierarchyRoleManager` | A grant declared at a parent domain applies at its child domains. |
| `g2` (membership) | `MembershipRoleManager` | Joining a parent domain makes you a member of every child - what the `ANY_MEMBER` grant scope tests. |

Casbin's `buildRoleLinks()` feeds every `g3` policy line to the `g3` role manager via `addLink`, which mutates the shared overlay in place. Casbin never puts the `g`-axis manager in its own `rmMap`, so without sharing the same `Map` it would never receive an `addLink` call at all - the reversed instance on `g` and `MembershipRoleManager` on `g2` only ever *read* the overlay the `g3` instance writes. `BaseRoleManager.collectAncestors` is the one ancestor walk both hierarchy-aware managers use, over the overlay alone - there is no backing graph to fall back to. `clear()` empties the overlay every `buildRoleLinks` cycle (once per request, since a pooled enforcer is reused across principals), and it is repopulated from whatever `g3` lines that request's line set carries.

Because these edges are ordinary per-principal, per-request state, freshness is whatever the per-user policy-line cache already guarantees (Redis-backed today, correct across every process) - there is no separate TTL, staleness ceiling, or `invalidateDomainHierarchy()`-style hook to reason about. Write the child domain's `join_domain` (or `domain_inherits`) row inside the same transaction that creates it, invalidate the affected principals' policy caches after that transaction commits, and invalidate every affected principal, not only the actor - the same contract the per-user cache already asks for everywhere else.

### Widening - audit before relying on it

- **`SYSTEM_WIDE` is untouched.** It bypasses the domain clause in the matcher before membership or nesting are consulted, so a role whose grants are all `SYSTEM_WIDE` gains nothing. More generally, a global grant says "not limited by domain" - it says nothing about whether the endpoint lets a caller act on another subject. What bounds that is the endpoint scoping itself to the authenticated caller.
- **A role assignment with no domain is already a wildcard** (`g, <User>, <Role>, *`), which makes the role clause always true and leaves membership as the only remaining gate - unaffected by this change, since a wildcard already matches everywhere. Prefer an explicit domain on new role assignments. Checking exposure before adding `g3` edges to an existing dataset means asking which roles in a wildcard-plus-parent-membership intersection carry an `ANY_MEMBER` grant, not just counting the intersection itself - the intersection alone measures shape and reads far scarier than the real exposure.

## The request path

`authorize({ spec, enforcerName })` wraps `AuthorizationProvider`. Per request: skip flag -> require an authenticated user (401 otherwise) -> `alwaysAllowRoles` / `spec.allowedRoles` bypass -> voters (`ALLOW` short-circuits, `DENY` throws 403, `ABSTAIN` continues) -> **if no enforcers are registered, this fails closed**: `defaultDecision: 'allow'` proceeds (logged as a warning), anything else - including unset, which defaults to `deny` - throws `ENFORCER_NOT_REGISTERED` (403), naming the missing enforcer rather than a generic denial -> resolve the enforcer from `AuthorizationEnforcerRegistry` -> resolve the request domain (only when `spec.domain` or a configured `domainResolver` is in play, to avoid an unnecessary DB hit) -> build rules -> evaluate. A `DENY` logs the deciding policy rule, or `<none - default-deny>` when nothing matched.

## Related

- [Authentication](/architecture/authentication.md)
- [Component Model](/architecture/component-model.md)
- [DataSource Hierarchy](/architecture/datasource-hierarchy.md)
- [vert Example](/examples/vert.md)
