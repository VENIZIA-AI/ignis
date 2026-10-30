---
title: Scoped RBAC Authorization - Edge-Table Model, Pooled Enforcer, Redis-Only Cache
description: The authorize module is rebuilt around one PolicyDefinition edge table, a scoped Casbin model, a per-request enforcer pool and a Redis-only cache; DrizzleCasbinAdapter and the in-memory cache driver are removed.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-06-02

## Scoped RBAC Authorization

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** Casbin authorization now runs on a generic, configuration-driven adapter with role, resource, action and domain hierarchies, and each request gets its own enforcer, which closes a race on the shared one.

## What changed

- **`ScopedCasbinAdapter`.** A generic read-only adapter that reads a principal's edges and the shared hierarchy from one `PolicyDefinition` edge table. Configure it with `IScopedCasbinEntities`; no subclassing.
- **Scoped model `CASBIN_RBAC_DOMAIN_SCOPED_MODEL`.** `r = sub, dom, obj, act`, default-deny with explicit-deny-wins, and five grouping relations: `g` role, `g2` domain membership, `g3` domain hierarchy, `g4` resource hierarchy, `g5` action hierarchy. Domain scoping uses the `SYSTEM_WIDE` and `ANY_MEMBER` sentinels.
- **Thin `BaseFilteredAdapter<TFilter>`.** Subclasses implement only `loadFilteredPolicy`.
- **Per-request enforcer pool.** Each request borrows its own enforcer, loads only that user's lines and enforces. On any error the enforcer is destroyed (fail-closed). Before, concurrent requests could corrupt policy state on one shared enforcer.
- **Redis-only line cache.** Per-user lines are cached with a TTL, and concurrent misses are deduplicated. A corrupt entry is discarded and refetched instead of causing a 500. Optional `invalidateUserCache` and `rebuildUserCache` evict or rebuild a user's lines.

Turn on the scoped model with these `ICasbinEnforcerOptions`:

| Option | Default | Meaning |
|---|---|---|
| `isScoped` | `false` | Enables the 4-token scoped model |
| `poolSize` | `16` | Enforcers held in the pool |
| `poolAcquireTimeoutMs` | `5000` | Wait for a pooled enforcer before failing closed |

## Who is affected

- **Apps that subclassed `DrizzleCasbinAdapter`, used the in-memory cache driver, built a custom `ICasbinPolicyFilter`, referenced `CasbinRuleVariants.GROUP` or `.POLICY`, or used `IAuthorizationCacheInvalidator`.** Must migrate (see breaking changes).
- **Apps not using Casbin authorization.** No action needed.

## Breaking changes

> [!WARNING]
> See the [Scoped RBAC Migration Guide](/guides/migrations/scoped-rbac-migration) for both supported migration paths with full before/after code.

1. **`DrizzleCasbinAdapter` removed.** `DrizzleCasbinAdapter` and `IDrizzleCasbinAdapterOptions` are gone. Use `ScopedCasbinAdapter` or subclass the new thin `BaseFilteredAdapter`.
2. **Filter shape changed.**

   ```typescript
   // Before
   interface ICasbinPolicyFilter { principalType: string; principalValue: string | number; }

   // After
   interface ICasbinPolicyFilter { principal: { type: string; id: IdType }; }
   ```

3. **`CasbinRuleVariants` trimmed.** Before, `GROUP`, `POLICY`, `SCHEME_SET` and `isValid` existed. Now only `CasbinRuleVariants = { P, G, G2, G3, G4, G5 }`. The database `variant` discriminator moves to `AuthorizationPolicyVariants.*.action` (`grant`, `assign_role`, `join_domain`, `role_inherits`, `resource_inherits`, `action_inherits`, `domain_inherits`).
4. **In-memory cache driver removed.**

   ```typescript
   // Before
   cached: { use: true, driver: CasbinEnforcerCachedDrivers.IN_MEMORY }

   // After
   cached: { use: false } | (ICasbinEnforcerCachedRedis & { use: true })
   ```

   Provide Redis for caching, or `{ use: false }` for none.
5. **`IAuthorizationCacheInvalidator` removed.** `IAuthorizationCacheInvalidator` and `TAuthorizationCacheInvalidator` are gone. Cache management is now the optional `invalidateUserCache?` and `rebuildUserCache?` members of `IAuthorizationEnforcer`.

## See also

- [Scoped RBAC Migration Guide](/guides/migrations/scoped-rbac-migration)
- [Authorization](/extensions/components/authorization/)
