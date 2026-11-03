---
title: Casbin Domain Matching Function - Wildcard/Pattern Domains in `g`
description: CasbinAuthorizationEnforcer can register a domain matching function so wildcard or pattern domains in grouping policies work.
packages: ['@venizia/ignis']
---

# Changelog - 2026-05-27

## Casbin Domain Matching Function Support

<Badge type="tip" text="New Feature" />

**In one line.** One policy line can now grant a role across every tenant, instead of one line per tenant.

## What changed

- **New `domainMatching` enforcer option.** An opt-in `{ roleDefinition, fn }` registers a domain matching function (`keyMatch`, `keyMatch2`, `keyMatch3`, `keyMatch4` or `regexMatch`) on a role definition. A stored `g, User_x, Role_y, *` then matches any domain, while `g, User_x, Role_y, Merchant_X` still matches only `Merchant_X`.
- **New `CasbinDomainMatchingFunctions` constant class.** It exposes the five functions plus `SCHEME_SET`, `isValid()` and the `TCasbinDomainMatchingFunction` type.
- **Fail-loud validation.** `configure()` throws if the configured `roleDefinition` is not declared in the Casbin model.
- **Survives reloads.** The function persists across every `loadFilteredPolicy` reload.

```typescript
options: {
  model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_MODEL },
  adapter,
  cached,
  normalizePayloadFn,
  domainMatching: { roleDefinition: 'g', fn: CasbinDomainMatchingFunctions.KEY_MATCH },
} satisfies ICasbinEnforcerOptions,
```

Your Casbin model's matcher must call `g` with the request domain and apply the matching function:

```ini
[matchers]
m = g(r.sub, p.sub, r.dom) && keyMatch(r.dom, p.dom) && r.obj == p.obj && r.act == p.act
```

## Who is affected

- **Multi-tenant apps using Casbin RBAC with domains.** No action needed. The option is off by default and domains compare as exact strings unless you opt in.
- **Apps where a user holds a role across many tenants.** Opting in cuts the user's policy line count from `permissions x domains` to `memberships + permissions`.

## Details

- The function is applied as `fn(requestDomain, policyDomain)`, so the wildcard must be on the stored policy side: `keyMatch("Merchant_X", "*")` is `true`.
- `KEY_MATCH` treats `*` as the only wildcard. `KEY_MATCH_2` adds `:param` segments, `KEY_MATCH_3` adds `{param}` segments, `KEY_MATCH_4` adds repeated-name equality checks, and `REGEX_MATCH` treats the policy value as a full regular expression.

> [!WARNING]
> With a domain model (`r = sub, dom, obj, act`), `normalizePayloadFn` must always return a `domain`. If it returns `undefined`, the enforcer falls back to the 3-argument `enforceSync` form, which mis-evaluates against a 4-argument model.
