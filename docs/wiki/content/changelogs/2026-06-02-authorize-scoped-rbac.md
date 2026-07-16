---
title: Scoped RBAC Authorization - Edge-Table Model, Pooled Enforcer, Redis-Only Cache
description: Rework of the authorize module around a single PolicyDefinition edge table, a scoped Casbin model (g..g5), a per-request enforcer pool, and a Redis-only line cache. Removes DrizzleCasbinAdapter and the in-memory cache driver.
---

# Changelog - 2026-06-02

## Scoped RBAC Authorization

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** The `authorize` module is rebuilt around a single edge table and a scoped Casbin model that supports role, resource, action, and domain hierarchies, replacing the per-app adapter with a generic, configuration-driven one and closing a concurrency race in the enforcer.

## What changed

- **`ScopedCasbinAdapter`** - a generic, read-only `FilteredAdapter` that reads one principal's edges (role assignments, memberships, grants) plus the shared structural hierarchy from a single `PolicyDefinition` edge table. Configured via `IScopedCasbinEntities`; no subclassing required.
- **Scoped Casbin model** (`CASBIN_RBAC_DOMAIN_SCOPED_MODEL`) - `r = sub, dom, obj, act`, default-deny with explicit-deny-wins, and five grouping relations (`g` role, `g2` domain membership, `g3` domain hierarchy, `g4` resource hierarchy, `g5` action hierarchy). Domain scoping uses `SYSTEM_WIDE` and `ANY_MEMBER` sentinels.
- **`BaseFilteredAdapter<TFilter>` rewritten thin** - owns datasource/connector plumbing, the `isFiltered()` flag, and the no-op write methods; subclasses implement only `loadFilteredPolicy`.
- **Per-request enforcer pool** - each request borrows an enforcer from a pool, loads only that user's lines, and enforces - all inside one atomic `pool.use`. The pool destroys the enforcer on any error (fail-closed). This closes the shared-model concurrency race present in the previous design.
- **Redis-only line cache** - per-user Casbin lines are cached in Redis with a TTL, with single-flight dedup of concurrent cache misses. Corrupt entries are discarded and refetched rather than causing a 500. Optional `invalidateUserCache` / `rebuildUserCache` evict or rebuild a user's cached lines.
- **New `ICasbinEnforcerOptions` fields** - `isScoped?: boolean` (enables the 4-token scoped model), `poolSize?: number` (default 16), `poolAcquireTimeoutMs?: number` (default 5000, fails closed on timeout).

## Who is affected

- **Applications that subclassed `DrizzleCasbinAdapter`** - must migrate to `ScopedCasbinAdapter` or the new thin `BaseFilteredAdapter` (breaking, see below).
- **Applications using the in-memory Casbin cache driver** - must switch to Redis (breaking, see below).
- **Applications that built a custom `ICasbinPolicyFilter`** - the filter shape changed (breaking, see below).
- **Applications referencing `CasbinRuleVariants.GROUP` or `.POLICY`** - those members are removed (breaking, see below).
- **Applications using `IAuthorizationCacheInvalidator`** - removed; cache management is now optional methods on `IAuthorizationEnforcer` (breaking, see below).
- **Applications not using Casbin authorization at all** - no action needed.

## Breaking changes

> [!WARNING]
> Apps that subclassed `DrizzleCasbinAdapter`, used the in-memory cache driver, or referenced
> `CasbinRuleVariants.GROUP`/`.POLICY` must migrate. See the
> [Scoped RBAC Migration Guide](../guides/migrations/scoped-rbac-migration) for both supported migration paths with full before/after code.

### 1. `DrizzleCasbinAdapter` removed

`DrizzleCasbinAdapter` and `IDrizzleCasbinAdapterOptions` are gone. Use `ScopedCasbinAdapter` (generic, edge-table) or subclass the new thin `BaseFilteredAdapter`.

### 2. Filter shape changed

```typescript
// Before
interface ICasbinPolicyFilter { principalType: string; principalValue: string | number; }

// After
interface ICasbinPolicyFilter { principal: { type: string; id: IdType }; }
```

### 3. `CasbinRuleVariants` trimmed

```typescript
// Before: GROUP ('group'), POLICY ('policy'), SCHEME_SET, isValid all existed

// After: only Casbin prefixes remain
CasbinRuleVariants = { P, G, G2, G3, G4, G5 };
```

The database `variant` discriminator now lives on `AuthorizationPolicyVariants.*.action` (`grant`, `assign_role`, `join_domain`, `role_inherits`, `resource_inherits`, `action_inherits`, `domain_inherits`).

### 4. In-memory cache driver removed

```typescript
// Before
cached: { use: true, driver: CasbinEnforcerCachedDrivers.IN_MEMORY }

// After
cached: { use: false } | (ICasbinEnforcerCachedRedis & { use: true })
```

Provide Redis for caching, or `{ use: false }` for none.

### 5. `IAuthorizationCacheInvalidator` removed

`IAuthorizationCacheInvalidator` / `TAuthorizationCacheInvalidator` are gone. Cache management is now expressed as optional members of `IAuthorizationEnforcer` (`invalidateUserCache?`, `rebuildUserCache?`), which the registry feature-detects.

## Details

See the **[Scoped RBAC Migration Guide](../guides/migrations/scoped-rbac-migration)** for the two supported paths - bridging with no data migration, or adopting the scoped model - with exact before/after code for each.
