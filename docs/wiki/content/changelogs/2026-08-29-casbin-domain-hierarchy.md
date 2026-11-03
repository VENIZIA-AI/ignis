---
title: Casbin Domain Hierarchy - Parent Domains Reach Their Children
description: A role assignment or domain membership declared at a parent domain now reaches its child domains too, the same way a grant already did, with no new configuration.
packages: ['@venizia/ignis']
---

# Changelog - 2026-08-29

## Casbin Domain Hierarchy

<Badge type="tip" text="New Feature" />

**In one line.** A role assigned, or a domain joined, at a parent domain now also reaches its child domains, the same reach a grant already had through `g3`.

## What changed

Nothing to configure. For every scoped (`isScoped: true`) model:

| Axis | Relation | Gains |
|---|---|---|
| `g` | Role assignment | A role assigned at a parent domain matches a request at any child domain. |
| `g3` | Grant | A grant declared at a parent domain applies at its child domains (unchanged). |
| `g2` | Membership | Joining a parent domain makes you a member of every child domain - what the `ANY_MEMBER` grant scope tests. |

- **New `DomainHierarchyRoleManager` and `MembershipRoleManager`** read the same `g3` domain-hierarchy edges the grant axis already used.
- **An app whose tenant hierarchy is business data** rather than `domain_inherits` rows can supply the same edges through `ScopedCasbinAdapter`'s `resolveDomainEdges` constructor hook. See the [Authorization API reference](/extensions/components/authorization/api).

## Who is affected

- **Every application using the scoped model with `domain_inherits` rows.** A role assignment or membership at a parent domain now reaches its children. Audit before relying on it (see Details).
- **Apps with no `domain_inherits` rows and no `resolveDomainEdges` hook.** No change.
- **Apps whose hierarchy lives on a business table.** Supply `resolveDomainEdges`.

## Details

**Freshness.** There is no separate cache or invalidation call. `g3` edges are ordinary per-principal policy lines, so they follow the existing per-user policy-cache invalidation. For a newly created child domain to be visible everywhere immediately:

1. Write the child domain's `join_domain` (or `domain_inherits`) row inside the same transaction that creates the domain.
2. Invalidate the affected principals' policy caches after the transaction commits, never before.
3. Invalidate every affected principal, not only the one who performed the action. Otherwise it works for one user and silently not for the rest.

- A `SYSTEM_WIDE` grant is untouched. A role whose grants are all `SYSTEM_WIDE` gains nothing.
- A role assignment with no domain was already a wildcard (`g, User, Role, *`), matching every domain. Prefer an explicit domain on new role assignments.
- To check exposure before relying on this against existing data, ask whether any role in the intersection of "domainless role assignment" and "membership at a parent domain" carries an `ANY_MEMBER` grant it should not. The membership change only touches the `ANY_MEMBER` branch of the matcher.

See the [Authorization component](/extensions/components/authorization/).
