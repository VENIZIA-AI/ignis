---
title: Casbin Domain Hierarchy - Parent Domains Reach Their Children
description: A new domainHierarchy option lets a role assignment, a grant, or a domain membership declared at a parent domain also apply at its child domains, across all three casbin axes at once; off unless configured, and the matcher never changes.
---

# Changelog - 2026-08-29

## Casbin Domain Hierarchy

<Badge type="tip" text="New Feature" />

**In one line.** A new `domainHierarchy` option lets a role assigned, a grant declared, or a domain joined at a parent domain also reach its child domains - on all three casbin axes at once.

## The problem it solves

Only grants could reach a child domain from a parent, through the `domain_inherits` edges the `g3` relation already consulted. A role assignment or a domain membership matched only the exact domain stored on its row - assign a role at the parent organizer, and it stayed there, invisible to any child merchant.

```typescript
const domainHierarchyLoader = new DomainHierarchyLoader({ dataSource, entities });

AuthorizationEnforcerRegistry.getInstance().register({
  container: this,
  enforcers: [{
    enforcer: CasbinAuthorizationEnforcer,
    name: 'casbin',
    type: AuthorizationEnforcerTypes.CASBIN,
    options: {
      // ...
      domainHierarchy: {
        load: () => domainHierarchyLoader.load(),
      },
    } satisfies ICasbinEnforcerOptions,
  }],
});
```

Configure `domainHierarchy` once, and `g`, `g2`, and `g3` all gain the same parent-to-child reach.

## What changed

- **New `domainHierarchy` option** on `ICasbinEnforcerOptions` (`{ load, refreshMs?, maxStaleMs? }`, kernel `common/types.ts`).
- **Off unless configured.** Omitted, `g`/`g2`/`g3` keep their exact per-principal behavior, and `CASBIN_RBAC_DOMAIN_SCOPED_MODEL` is byte-identical - nothing changes for an existing application.
- **New `DomainHierarchyStore`** (`enforcers/domain-hierarchy.ts`) owns one shared domain tree per enforcer, warmed in `configure()` before the pool is built, and refreshed on a TTL (`refreshMs`, default 60 seconds).
- `warmup()` throws on a failed first load - the enforcer refuses to boot serving an empty tree.
- **New `DomainHierarchyRoleManager`** backs `g3` directly, and a reversed instance plugs into casbin's own `DefaultRoleManager.addDomainHierarchy()` on `g`. Those two and `MembershipRoleManager` on `g2` all share one overlay - see "How this stays fresh" below.
- **New `MembershipRoleManager`** backs `g2`.
- **New `DomainHierarchyLoader`** (`adapters/domain-hierarchy-loader.ts`) builds `load` from the same entity mapping `ScopedCasbinAdapter` takes; its bound `load` property is passed straight to `domainHierarchy.load`.
- `PolicyConnectorResolver` (`adapters/connector.ts`) extracts connector resolution that `BaseFilteredAdapter` already had, so the new loader shares it instead of duplicating it.
- **New `invalidateDomainHierarchy()`**, optional on `IAuthorizationEnforcer` next to `invalidateUserCache`/`rebuildUserCache`. Force-reloads the shared tree now, ignoring its TTL.
- **New `maxStaleMs`** on `domainHierarchy`. Bounds how long a failed reload may keep serving the previous snapshot.

## What each axis gains

| Axis | Relation | Gains |
|---|---|---|
| `g` | Role assignment | A role assigned at a parent domain matches a request at any child domain. |
| `g3` | Grant | A grant declared at a parent domain applies at its child domains. |
| `g2` | Membership | Joining a parent domain makes you a member of every child domain - what the `ANY_MEMBER` grant scope tests. |

## How this stays fresh

The shared tree is a completeness and performance layer with a TTL. It is **not** the source of freshness for a newly created domain - that travels on the existing per-user policy-cache invalidation path, which was already correct across every process.

`ScopedCasbinAdapter` still emits per-principal `g3` lines on every user-cache miss, built from a `domain_closure` seeded by the user's own `join_domain` rows (`queryPrincipalPolicies`). Those lines land in `DomainHierarchyRoleManager`'s overlay - and that overlay is shared by all three role managers - `g3`, the reversed instance on `g`, and `MembershipRoleManager` on `g2` - so a per-request edge satisfies every axis. None waits for the shared tree's TTL.

The symmetry matters. An axis reading only the shared graph goes stale while the others stay fresh, and the shape it breaks first is the one recommended here: a single `join_domain` row at the parent. Membership would deny a just-created child domain until the next reload while the role axis already allowed it - a failure that reads as "the user holds the role and is still refused".

Plainly: a newly created child domain is reachable as soon as the owning principals' policy caches are invalidated - no TTL wait, no cluster broadcast.

**The contract an application must meet to get that:**

1. Write the child domain's `join_domain` row inside the same transaction that creates the domain.
2. Invalidate the affected principals' policy caches after the transaction commits, never before.
3. Invalidate every affected principal, not only the one who performed the action - otherwise the feature works for one user and silently does not for the rest.

## Operating this in production

- **`invalidateDomainHierarchy()` refreshes only the process that receives the call.** It is not a cluster-wide broadcast. A multi-instance deployment needs one call per process (or a shorter `refreshMs`) to make a newly created or moved domain visible everywhere immediately.
- **`maxStaleMs` bounds how long a failed reload may keep serving the previous snapshot.** Left unset, a stalled reload keeps serving the last good tree indefinitely. Once `maxStaleMs` is exceeded with no successful reload, the store serves an **empty** graph instead of throwing: hierarchy-derived access stops, directly-assigned access keeps working, and no request errors. Throwing on the enforce hot path would turn a database blip into a total outage.
- **Leaving `maxStaleMs` unset is safe only while the domain tree is append-only** - a containment hierarchy where a domain's parent never changes. An application that can move a domain to a different parent must set `maxStaleMs`, because a stale tree would keep the former parent's grants alive.

## Who is affected

- **Every existing application.** No action needed. `domainHierarchy` is unset by default, so `g`/`g2`/`g3` keep their current behavior.
- **Apps that want a role, a grant, or a membership at a parent domain to reach its children.** Supply `domainHierarchy.load`, built with `DomainHierarchyLoader` or a custom function returning `{ child, parent }` edges.
- **Apps running more than one process.** Call `invalidateDomainHierarchy()` on every process, or accept the `refreshMs` TTL - it does not broadcast.
- **Apps whose domains can be reparented.** Set `maxStaleMs`; see "Operating this in production" above.
- **Apps enabling this against an existing dataset.** See below before turning it on.

## Details

- **A `SYSTEM_WIDE` grant is untouched.** It bypasses the domain clause in the matcher before membership or nesting are ever consulted, so a role whose grants are all `SYSTEM_WIDE` gains nothing from this option. A global grant only says "not limited by domain" - it says nothing about whether an endpoint lets a caller act on another subject. That bound comes from the endpoint scoping itself to the authenticated caller, not from the domain clause.
- **A role assignment with no domain was already a wildcard** (`g, User, Role, *`), matching every domain regardless of hierarchy. Prefer an explicit domain on new role assignments.
- **Check exposure with the right question before enabling this on existing data.** "Does anyone have a domainless role assignment plus membership at a parent domain" measures shape, not exposure - measured on one production dataset, it returned 1254 users, of whom none were affected. The question that matters is "does any role in that intersection carry an `ANY_MEMBER` grant it should not", because the membership change only touches the `ANY_MEMBER` branch of the matcher. On the same dataset, that returned 8.

See the [Authorization component](/extensions/components/authorization/) for how enforcers are configured.

| File | Package |
|------|---------|
| `src/base/auth/authorize/common/types.ts` | kernel |
| `src/components/auth/authorize/enforcers/domain-hierarchy.ts` | core |
| `src/components/auth/authorize/enforcers/domain-hierarchy-role-manager.ts` | core |
| `src/components/auth/authorize/enforcers/membership-role-manager.ts` | core |
| `src/components/auth/authorize/adapters/domain-hierarchy-loader.ts` | core |
| `src/components/auth/authorize/adapters/connector.ts` | core |
| `src/components/auth/authorize/enforcers/casbin.enforcer.ts` | core |
