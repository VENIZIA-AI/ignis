---
title: Casbin Domain Matching Function - Wildcard/Pattern Domains in `g`
description: CasbinAuthorizationEnforcer can now register a domain matching function (keyMatch, etc.) so wildcard/pattern domains in grouping policies work - enabling the canonical RBAC-with-domains model at scale
---

# Changelog - 2026-05-27

## Casbin Domain Matching Function Support

<Badge type="tip" text="New Feature" />

**In one line.** `CasbinAuthorizationEnforcer` can now match wildcard or pattern domains in role-grouping policies, so one policy line can grant a role across every tenant instead of one line per tenant.

## What changed

- **New `domainMatching` enforcer option.** Opt-in `{ roleDefinition, fn }` config registers a Casbin domain matching function (`keyMatch`, `keyMatch2`, `keyMatch3`, `keyMatch4`, or `regexMatch`) on a role definition, so a stored `g, User_x, Role_y, *` matches a request in **any** domain, while `g, User_x, Role_y, Merchant_X` still matches only `Merchant_X`.
- **New `CasbinDomainMatchingFunctions` constant class.** Exposes the five supported functions plus `SCHEME_SET`, `isValid()`, and the `TCasbinDomainMatchingFunction` type.
- **Fail-loud validation.** `configure()` throws if the configured `roleDefinition` is not declared in the Casbin model, instead of silently no-opping - which would leave global wildcards permanently unmatched with no signal.
- **Survives reloads.** The matching function is registered once on the enforcer's role manager, so it persists across every `loadFilteredPolicy` reload.

## Who is affected

- **Multi-tenant apps using Casbin RBAC with domains.** No action needed - the option is off by default and domains keep comparing as exact strings unless you opt in.
- **Apps where a user holds a role across many tenants.** Opting in collapses that user's materialized policy line count from `permissions x domains` to `memberships + permissions`, since role permissions can now be written domain-agnostic (`p.dom = "*"`).

## Details

Enable it on the enforcer registration:

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

This requires a Casbin model whose matcher invokes `g` with the request domain and calls the matching function against it, for example:

```ini
[matchers]
m = g(r.sub, p.sub, r.dom) && keyMatch(r.dom, p.dom) && r.obj == p.obj && r.act == p.act
```

<details>
<summary>Available matching functions</summary>

| Function | Value | Notes |
|----------|-------|-------|
| `CasbinDomainMatchingFunctions.KEY_MATCH` | `'keyMatch'` | `*` is the only wildcard; exact compare otherwise. Recommended for `Merchant_<uuid>`-style domains |
| `CasbinDomainMatchingFunctions.KEY_MATCH_2` | `'keyMatch2'` | Adds URL-path `:param` segment matching |
| `CasbinDomainMatchingFunctions.KEY_MATCH_3` | `'keyMatch3'` | Adds `{param}` segment matching |
| `CasbinDomainMatchingFunctions.KEY_MATCH_4` | `'keyMatch4'` | `{param}` with repeated-name equality checks |
| `CasbinDomainMatchingFunctions.REGEX_MATCH` | `'regexMatch'` | Treats the stored/policy value as a full regular expression |

</details>

> [!NOTE]
> The matching function is applied as `fn(requestDomain, policyDomain)` - the wildcard must live on the **stored/policy** side. `keyMatch("Merchant_X", "*")` is `true`; `keyMatch("Merchant_X", "Merchant_Y")` is `false`.

> [!WARNING]
> When using a domain model (`r = sub, dom, obj, act`), `normalizePayloadFn` must always return a `domain`. If it returns `undefined`, the enforcer falls back to the 3-argument `enforceSync` form, which mis-evaluates against a 4-argument model.

| File | Package |
|------|---------|
| `src/components/auth/authorize/common/constants.ts` | core |
| `src/components/auth/authorize/common/types.ts` | core |
| `src/components/auth/authorize/enforcers/casbin.enforcer.ts` | core |
