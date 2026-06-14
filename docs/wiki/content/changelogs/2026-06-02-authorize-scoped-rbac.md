---
title: Scoped RBAC Authorization - Edge-Table Model, Pooled Enforcer, Redis-Only Cache
description: Rework of the authorize module around a single PolicyDefinition edge table, a scoped Casbin model (g..g5), a per-request enforcer pool, and a Redis-only line cache. Removes DrizzleCasbinAdapter and the in-memory cache driver.
---

# Changelog - 2026-06-02

## Scoped RBAC Authorization

The `authorize` module was reworked around a single **edge table** (`PolicyDefinition`) plus a
**scoped Casbin model** that supports role / resource / action / domain hierarchies and domain
membership. The bespoke per-app adapter logic is replaced by a generic, configuration-driven
`ScopedCasbinAdapter`, and enforcement now runs on a **per-request enforcer pool** with a
**Redis-only** per-user line cache.

## Overview

- **`ScopedCasbinAdapter`** - a generic read-only `FilteredAdapter` that reads one principal's edges
  (role assignments → `g`, memberships → `g2`, grants → `p`) plus the shared structural hierarchy
  (`role_inherits` → `g`, `domain_inherits` → `g3`, `resource_inherits` → `g4`, `action_inherits` →
  `g5`) from the `PolicyDefinition` edge table, and turns them into Casbin lines. Configured via
  `IScopedCasbinEntities`; no subclassing required.
- **Scoped model** (`CASBIN_RBAC_DOMAIN_SCOPED_MODEL`) - `r = sub, dom, obj, act`, allow-and-deny
  effect (default-DENY, explicit deny wins), with grouping relations numbered in request-tuple order:
  `g` (role) · `g2` (domain membership) · `g3` (domain hierarchy) · `g4` (resource hierarchy, via
  `objectMatch`) · `g5` (action hierarchy). Domain scoping uses the `SYSTEM_WIDE` and `ANY_MEMBER`
  sentinels.
- **`BaseFilteredAdapter<TFilter>`** - rewritten thin: owns the datasource/connector plumbing, the
  `isFiltered()` flag, the no-op write methods, and a `loadLines` helper. Subclasses implement only
  `loadFilteredPolicy`.
- **Pooled enforcer** - each request borrows an enforcer from a `BasePoolHelper`, loads only that
  user's lines, `buildRoleLinks`, and `enforceSync` - all atomically inside one `pool.use`. The pool
  destroys the enforcer on any error (fail-closed). This eliminates the shared-model concurrency race.
- **Redis line cache** - per-user Casbin lines are cached in Redis (TTL via `PX`), with single-flight
  dedup of concurrent misses. Corrupt entries are discarded and refetched (never 500). Optional
  `invalidateUserCache` / `rebuildUserCache` evict/rebuild a user's lines.

## Breaking Changes

> [!WARNING]
> Apps that subclassed `DrizzleCasbinAdapter`, used the in-memory cache driver, or referenced
> `CasbinRuleVariants.GROUP/.POLICY` must migrate. See the
> [Scoped RBAC Migration Guide](../guides/migrations/scoped-rbac-migration).

### 1. `DrizzleCasbinAdapter` removed

`DrizzleCasbinAdapter` and `IDrizzleCasbinAdapterOptions` are gone. Use `ScopedCasbinAdapter` (generic,
edge-table) or subclass the new thin `BaseFilteredAdapter`.

### 2. Filter shape changed

```ts
// Before
interface ICasbinPolicyFilter { principalType: string; principalValue: string | number; }
// After
interface ICasbinPolicyFilter { principal: { type: string; id: IdType }; }
```

### 3. `CasbinRuleVariants` trimmed

`GROUP` (`'group'`) and `POLICY` (`'policy'`) - plus `SCHEME_SET`/`isValid` - were removed.
`CasbinRuleVariants` now holds **only** Casbin prefixes: `P, G, G2, G3, G4, G5`. The DB `variant`
discriminator now lives on `AuthorizationPolicyVariants.*.action` (`grant`, `assign_role`,
`join_domain`, `role_inherits`, `resource_inherits`, `action_inherits`, `domain_inherits`).

### 4. In-memory cache driver removed

`CasbinEnforcerCachedDrivers.IN_MEMORY` is gone. `cached` is now
`{ use: false } | (ICasbinEnforcerCachedRedis & { use: true })`. Provide Redis for caching, or
`{ use: false }` for none.

### 5. `IAuthorizationCacheInvalidator` removed

`IAuthorizationCacheInvalidator` / `TAuthorizationCacheInvalidator` are removed. Cache management is now
expressed as **optional** members of `IAuthorizationEnforcer` (`invalidateUserCache?`,
`rebuildUserCache?`), which the registry feature-detects.

## New `ICasbinEnforcerOptions` fields

- `isScoped?: boolean` - enable the scoped model: 4-token `(sub, dom, obj, act)` requests, with
  `keyMatch` on `g` and `objectMatch` (on `g4`) auto-registered.
- `poolSize?: number` (default 16) - number of pooled enforcers.
- `poolAcquireTimeoutMs?: number` (default 5000) - max wait for a free enforcer before failing closed.

## Migration

See **[Scoped RBAC Migration Guide](../guides/migrations/scoped-rbac-migration)** for the two supported
paths (bridge with no data migration vs. adopt the scoped model) with exact before/after code.
