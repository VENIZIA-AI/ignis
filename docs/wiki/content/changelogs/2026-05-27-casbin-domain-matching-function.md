---
title: Casbin Domain Matching Function - Wildcard/Pattern Domains in `g`
description: CasbinAuthorizationEnforcer can now register a domain matching function (keyMatch, etc.) so wildcard/pattern domains in grouping policies work - enabling the canonical RBAC-with-domains model at scale
---

# Changelog - 2026-05-27

## Casbin Domain Matching Function Support

`CasbinAuthorizationEnforcer` gained an opt-in `domainMatching` option that registers a Casbin **domain matching function** (`keyMatch`, `keyMatch2`, `keyMatch3`, `keyMatch4`, or `regexMatch`) on a named role definition. This lets the **domain slot** of a grouping (`g`) policy use a wildcard or pattern instead of an exact string - so a stored `g, User_x, Role_y, *` matches a request in **any** domain (a global role), while `g, User_x, Role_y, Merchant_X` still matches only `Merchant_X` (tenant isolation preserved).

This unlocks the canonical [Casbin "RBAC with domains"](https://casbin.apache.org/docs/rbac-with-domains/) + [pattern](https://casbin.apache.org/docs/rbac-with-pattern/) model, where multi-tenant scoping lives on the domain-aware membership relation `g` and role permissions stay domain-agnostic (`p.dom = "*"`). That keeps a user's materialized policy line count **linear** (`memberships + permissions`) instead of the `permissions × domains` cross-product that previously made high-merchant users pathologically slow to enforce.

## Overview

- **New option `ICasbinEnforcerOptions.domainMatching`**: `{ roleDefinition, fn }` - opt-in, registered during `configure()`
- **New constant class `CasbinDomainMatchingFunctions`**: `keyMatch` / `keyMatch2` / `keyMatch3` / `keyMatch4` / `regexMatch`, with `SCHEME_SET` + `isValid()` + the `TCasbinDomainMatchingFunction` type alias
- **Fail-loud guard**: if the configured `roleDefinition` is not declared in the model, `configure()` throws instead of letting Casbin silently no-op (which would make global wildcards silently fail)
- **Survives per-request reloads**: the function is registered once on the enforcer's role manager and persists across every `loadFilteredPolicy` reload (the role manager is created once at construction, not per request)

## No Breaking Changes

The option is optional and off by default. When `domainMatching` is **unset**, the enforcer behaves exactly as before - domains are compared as exact strings. Existing applications require no changes.

## New Features

### `domainMatching` enforcer option

**File:** `packages/core/src/components/auth/authorize/enforcers/casbin.enforcer.ts`

**Problem:** Casbin's `g = _, _, _` role definition compares the domain slot with **exact string equality** unless a domain matching function is registered. The framework never exposed a way to register one, so a grouping policy like `g, User_x, Role_y, *` would only match a request whose domain was literally `"*"` - there was no way to express a global (all-domains) role on the membership relation, forcing per-domain scoping onto the permission (`p`) lines and an `M × P` policy explosion.

**Solution:** A new opt-in option registers the matching function on the named role definition after the enforcer is created (covering all cache drivers) and before any policy is loaded:

```typescript
import {
  AuthorizationEnforcerRegistry,
  CasbinDomainMatchingFunctions,
  CasbinEnforcerModelDrivers,
  type ICasbinEnforcerOptions,
} from '@venizia/ignis';

AuthorizationEnforcerRegistry.getInstance().register({
  container: this,
  enforcers: [
    {
      enforcer: CasbinAuthorizationEnforcer,
      name: 'casbin',
      type: AuthorizationEnforcerTypes.CASBIN,
      options: {
        model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_MODEL },
        adapter,
        cached,
        normalizePayloadFn,
        // Register keyMatch on the `g` role definition so wildcard domains work:
        domainMatching: { roleDefinition: 'g', fn: CasbinDomainMatchingFunctions.KEY_MATCH },
      } satisfies ICasbinEnforcerOptions,
    },
  ],
});
```

This requires a Casbin model whose role definition is domain-aware and whose matcher invokes `g` with the request domain, for example:

```ini
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act, eft

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub, r.dom) && keyMatch(r.dom, p.dom) && r.obj == p.obj && r.act == p.act
```

**Benefits:**
- Global/cross-domain roles via a single grouping line (`g, User_x, Role_y, *`) - same mechanism as scoped roles, just a wildcard domain
- Role permissions can be emitted domain-agnostic (`p, Role_y, *, …`), collapsing the per-user line count from `M × P` to `M + P`
- Backward compatible (opt-in; unset ⇒ exact-string domains)
- Tenant isolation preserved: only `*` (full wildcard) and exact domain values are ever matched, and `keyMatch` treats only `*` specially - it never splits on `/` or `:`, so it cannot accidentally match one tenant identifier against another

> [!NOTE]
> The matching function is applied to the domain argument as `fn(requestDomain, policyDomain)` - the wildcard must live on the **stored/policy** side. `keyMatch("Merchant_X", "*")` is `true`; `keyMatch("Merchant_X", "Merchant_Y")` is `false`.

### `CasbinDomainMatchingFunctions` constant class

**File:** `packages/core/src/components/auth/authorize/common/constants.ts`

Follows the framework's standard constant-class pattern (`static readonly` members + `SCHEME_SET` + `isValid()`), with the companion type alias `TCasbinDomainMatchingFunction = TConstValue<typeof CasbinDomainMatchingFunctions>`. Values map 1:1 to Casbin's `Util.*Func` exports.

| Constant | Value | Notes |
|----------|-------|-------|
| `CasbinDomainMatchingFunctions.KEY_MATCH` | `'keyMatch'` | `*` is the only wildcard; exact compare otherwise. Recommended for `Merchant_<uuid>`-style domains |
| `CasbinDomainMatchingFunctions.KEY_MATCH_2` | `'keyMatch2'` | Adds URL-path `:param` segment matching |
| `CasbinDomainMatchingFunctions.KEY_MATCH_3` | `'keyMatch3'` | Adds `{param}` segment matching |
| `CasbinDomainMatchingFunctions.KEY_MATCH_4` | `'keyMatch4'` | `{param}` with repeated-name equality checks |
| `CasbinDomainMatchingFunctions.REGEX_MATCH` | `'regexMatch'` | Treats the stored/policy value as a full regular expression |

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/auth/authorize/common/constants.ts` | Added `CasbinDomainMatchingFunctions` constant class + `TCasbinDomainMatchingFunction` type alias |
| `src/components/auth/authorize/common/types.ts` | Added optional `domainMatching?: { roleDefinition; fn }` to `ICasbinEnforcerOptions` |
| `src/components/auth/authorize/enforcers/casbin.enforcer.ts` | Registers the domain matching function in `configure()` (`registerDomainMatchingFunction`); fail-loud guard for a missing role definition; documented the 3-arg vs 4-arg `enforceSync` domain contract |
| `src/__tests__/authorize/casbin-domain-matching.test.ts` | New suite: wildcard match, scoped isolation, backward-compat (unset ⇒ exact), redis-reload survival, end-to-end `buildRules → loadFilteredPolicy → evaluate`, invalid-func guard, missing-roleDefinition guard |

## Notes

> [!WARNING]
> When using a **domain** model (`r = sub, dom, obj, act`), `normalizePayloadFn` must always return a `domain`. If it returns `undefined`, the enforcer falls back to the 3-argument `enforceSync` form, which only fits a non-domain model (`r = sub, obj, act`) - against a 4-argument model the request columns shift and silently mis-evaluate.

> [!TIP]
> If `domainMatching.roleDefinition` is not declared under `[role_definition]` in the model, `configure()` throws a clear error. Casbin would otherwise register the function as a silent no-op, leaving wildcard domains permanently unmatched (global roles denied) with no signal.
