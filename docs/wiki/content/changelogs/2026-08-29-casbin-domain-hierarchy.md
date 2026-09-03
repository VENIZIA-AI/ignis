---
title: Casbin Domain Hierarchy - Parent Domains Reach Their Children
description: A role assignment or a domain membership declared at a parent domain now reaches its child domains too, the same way a grant already did - all three casbin axes read the same g3 policy lines through one shared per-request overlay, no separate configuration required.
---

# Changelog - 2026-08-29

## Casbin Domain Hierarchy

<Badge type="tip" text="New Feature" />

**In one line.** A role assigned, or a domain joined, at a parent domain now also reaches its child domains - the same reach a grant already had through `g3`.

## The problem it solves

Only grants could reach a child domain from a parent, through the `domain_inherits` edges the `g3` relation already consulted. A role assignment or a domain membership matched only the exact domain stored on its row - assign a role at the parent organizer, and it stayed there, invisible to any child merchant.

## What changed

Nothing to configure. `g` (role assignment) and `g2` (membership) now read the same `g3` domain-hierarchy edges the grant axis already did, automatically, for every scoped (`isScoped: true`) model:

- **New `DomainHierarchyRoleManager`** backs `g3` directly, and a reversed instance plugs into casbin's own `DefaultRoleManager.addDomainHierarchy()` on `g`.
- **New `MembershipRoleManager`** backs `g2`.
- `CasbinAuthorizationEnforcer.registerMatchers()` builds one overlay `Map<child, Set<parent>>` per pooled enforcer and hands the same instance to all three role managers. Casbin's `buildRoleLinks()` feeds every `g3` policy line to the `g3` manager via `addLink`, which writes into that shared overlay; the reversed `g` instance and `MembershipRoleManager` on `g2` only ever read it - casbin never puts the `g`-axis manager in its own `rmMap`, so without sharing the map it would never see a `g3` edge at all.

`g3` edges themselves are unchanged: `ScopedCasbinAdapter`'s `queryPrincipalPolicies` already emits them from `domain_inherits` rows reachable from a principal's own domain closure, on every policy load. An app whose tenant hierarchy is business data rather than `domain_inherits` rows can supply the same edges through `ScopedCasbinAdapter`'s `resolveDomainEdges` constructor hook instead - see the [Authorization API reference](/extensions/components/authorization/api).

## What each axis gains

| Axis | Relation | Gains |
|---|---|---|
| `g` | Role assignment | A role assigned at a parent domain matches a request at any child domain. |
| `g3` | Grant | A grant declared at a parent domain applies at its child domains (unchanged - already true). |
| `g2` | Membership | Joining a parent domain makes you a member of every child domain - what the `ANY_MEMBER` grant scope tests. |

## How this stays fresh

There is no separate cache, TTL, or invalidation call for this. `g3` edges are ordinary per-principal policy lines: `ScopedCasbinAdapter` emits them on every user-cache miss, from a `domain_closure` seeded by the user's own `join_domain` rows. Freshness rides the existing per-user policy-cache invalidation path, which was already correct across every process (Redis-backed).

**The contract an application must meet to see a newly created child domain everywhere immediately:**

1. Write the child domain's `join_domain` (or `domain_inherits`) row inside the same transaction that creates the domain.
2. Invalidate the affected principals' policy caches after the transaction commits, never before.
3. Invalidate every affected principal, not only the one who performed the action - otherwise the feature works for one user and silently does not for the rest.

## Who is affected

- **Every existing application using the scoped model.** If your `domain_inherits` table already has rows, a role assignment or a membership at a parent domain now reaches its children too - audit before relying on it, see below.
- **Apps with no `domain_inherits` rows and no `resolveDomainEdges` hook.** No change - there are no `g3` edges to cascade through, so `g`, `g2`, and `g3` behave exactly as before.
- **Apps whose tenant hierarchy lives on a business table instead of `domain_inherits`.** Supply `resolveDomainEdges` on `ScopedCasbinAdapter`'s constructor.

## Details

- **A `SYSTEM_WIDE` grant is untouched.** It bypasses the domain clause in the matcher before membership or nesting are ever consulted, so a role whose grants are all `SYSTEM_WIDE` gains nothing from this. A global grant only says "not limited by domain" - it says nothing about whether an endpoint lets a caller act on another subject. That bound comes from the endpoint scoping itself to the authenticated caller, not from the domain clause.
- **A role assignment with no domain was already a wildcard** (`g, User, Role, *`), matching every domain regardless of hierarchy. Prefer an explicit domain on new role assignments.
- **Check exposure with the right question before relying on this against existing data.** "Does anyone have a domainless role assignment plus membership at a parent domain" measures shape, not exposure - measured on one production dataset, it returned 1254 users, of whom none were affected. The question that matters is "does any role in that intersection carry an `ANY_MEMBER` grant it should not", because the membership change only touches the `ANY_MEMBER` branch of the matcher. On the same dataset, that returned 8.

See the [Authorization component](/extensions/components/authorization/) for how enforcers are configured.

| File | Package |
|------|---------|
| `src/components/auth/authorize/role-managers/domain-hierarchy.ts` | core |
| `src/components/auth/authorize/role-managers/membership.ts` | core |
| `src/components/auth/authorize/role-managers/base.ts` | core |
| `src/components/auth/authorize/enforcers/casbin.enforcer.ts` | core |
| `src/components/auth/authorize/adapters/scoped-casbin.adapter.ts` | core |
