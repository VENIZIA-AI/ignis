# Migrating to the Scoped RBAC Authorization (ignis ≥ scoped-rbac release)

> **Audience:** the team/agent maintaining **nx-seller** (and any app that wrote a custom
> `DrizzleCasbinAdapter` subclass). This is a hand-off spec describing exactly what breaks when you
> upgrade `@venizia/ignis` to the scoped-RBAC release and the two supported migration paths.

---

## 0. TL;DR

The ignis `authorize` module was reworked around a single **edge table** + a **scoped Casbin model**.
As part of that, several symbols nx-seller depends on were **removed or changed**. Upgrading ignis
**will not compile** until you act on the breakages in §2.

You have two paths:

| Path | Effort | When |
|------|--------|------|
| **B - Bridge** (re-base your custom adapter on `BaseFilteredAdapter`, keep your flat model) | Low - code only, **no data migration** | Do this first to unblock the upgrade |
| **A - Adopt scoped** (delete your custom adapter, use `ScopedCasbinAdapter` + scoped model) | High - needs a **data migration** | The intended long-term target |

Both are described below with exact before/after.

---

## 1. What changed in ignis

| Area | Before | After |
|------|--------|-------|
| Adapter base | `DrizzleCasbinAdapter` (concrete, app subclassed it) | **removed.** New: thin `BaseFilteredAdapter<TFilter>` + a ready-made generic `ScopedCasbinAdapter` |
| Adapter options | `IDrizzleCasbinAdapterOptions` | **removed.** `BaseFilteredAdapter` takes `{ scope, dataSource }`; `ScopedCasbinAdapter` takes `{ dataSource, entities }` |
| Filter shape | `{ principalType, principalValue }` (flat) | `{ principal: { type, id } }` (`ICasbinPolicyFilter`) |
| `CasbinRuleVariants` | `P, G, GROUP('group'), POLICY('policy')` + `SCHEME_SET`/`isValid` | trimmed to **casbin prefixes only**: `P, G, G2, G3, G4, G5`. `GROUP`/`POLICY` **removed** |
| DB `variant` discriminator | lived on `CasbinRuleVariants.GROUP/.POLICY` | now `AuthorizationPolicyVariants.*.action` (`grant`, `assign_role`, `join_domain`, `role_inherits`, `resource_inherits`, `action_inherits`, `domain_inherits`) |
| Cache drivers | `redis` **and** `in-memory` | **redis only.** `CasbinEnforcerCachedDrivers.IN_MEMORY` removed; `cached` is now `{ use: false } \| (ICasbinEnforcerCachedRedis & { use: true })` |
| Cache invalidation interface | `IAuthorizationCacheInvalidator` / `TAuthorizationCacheInvalidator` | **removed.** `invalidateUserCache?`/`rebuildUserCache?` are now **optional** members of `IAuthorizationEnforcer` (feature-detected by the registry) |
| Enforcer model | shared single enforcer | **pool** of per-request enforcers (`BasePoolHelper`); policy loaded per request, fail-closed |
| Scoped option | n/a | new `isScoped?: boolean` on `ICasbinEnforcerOptions` |

> **Note:** the old `CasbinRuleVariants.GROUP = 'group'` and `.POLICY = 'policy'`. Your
> `PolicyDefinition.variant` column currently stores the strings **`'group'`** and **`'policy'`**.
> Confirm with: `SELECT DISTINCT variant FROM identity."PolicyDefinition";`

---

## 2. What breaks in nx-seller (exact references)

When you bump ignis, these stop compiling/working:

1. **`packages/core-server/src/security/application-casbin-adapter.ts`**
   - `extends DrizzleCasbinAdapter` → class removed.
   - `import { DrizzleCasbinAdapter, IDrizzleCasbinAdapterOptions, ICasbinPolicyFilter } from '@venizia/ignis'` → first two removed; `ICasbinPolicyFilter` still exists but its **shape changed**.
   - `filter.principalValue` / `filter.principalType` → now `filter.principal.id` / `filter.principal.type`.
   - `CasbinRuleVariants.GROUP` / `CasbinRuleVariants.POLICY` → removed.
   - `this.entities.role.principalType` / `this.entities.permission.principalType` → `entities` no longer provided by the base.

2. **`packages/core-server/src/repositories/public/policy-definition.repository.ts`**
   - Many `eq(pd.variant, CasbinRuleVariants.GROUP)` / `.POLICY` → constant removed. This file is the
     biggest single breakage surface outside the adapter.

3. **`packages/core-server/src/application/verifier.ts`** (enforcer registration)
   - The Redis-absent fallback uses `CasbinEnforcerCachedDrivers.IN_MEMORY` → removed. You must pick
     Redis or `{ use: false }`.

4. Any seed/migration writing `variant = 'group' | 'policy'` keeps working at the DB level (those are
   plain strings), but the **constants** that produced them are gone.

---

## 3. Path B - Bridge (recommended first step, no data migration)

Goal: compile against new ignis with **identical runtime behavior** - keep your flat `CASBIN_RBAC_MODEL`,
your `group`/`policy` variant values, and all bespoke logic (global roles, HQ-owner expansion).

### 3.1 Define your own variant constants

`CasbinRuleVariants.GROUP/.POLICY` are gone from ignis, but your DB still stores `'group'`/`'policy'`.
Own these strings locally so you are decoupled from ignis's casbin-prefix enum:

```ts
// packages/core-server/src/security/policy-variant.ts
export class PolicyDefinitionVariant {
  /** user→role assignment + user→merchant membership rows. */
  static readonly GROUP = 'group';
  /** permission grant rows (role→perm, user→perm). */
  static readonly POLICY = 'policy';
}
```

Then replace every `CasbinRuleVariants.GROUP` → `PolicyDefinitionVariant.GROUP` and
`CasbinRuleVariants.POLICY` → `PolicyDefinitionVariant.POLICY` in
`application-casbin-adapter.ts` **and** `policy-definition.repository.ts`.
Keep using `CasbinRuleVariants.G` / `.P` for the **emitted casbin lines** (those still exist).

### 3.2 Re-base `ApplicationCasbinAdapter` on `BaseFilteredAdapter`

```ts
// BEFORE
import {
  DrizzleCasbinAdapter,
  type IDrizzleCasbinAdapterOptions,
  type ICasbinPolicyFilter,
} from '@venizia/ignis';

export class ApplicationCasbinAdapter extends DrizzleCasbinAdapter {
  private readonly appDataSource: IDrizzleCasbinAdapterOptions['dataSource'];
  constructor(opts: IDrizzleCasbinAdapterOptions) {
    super(opts);
    this.appDataSource = opts.dataSource;
  }
  // ... used this.entities.role.principalType, filter.principalValue, etc.
}
```

```ts
// AFTER
import { BaseFilteredAdapter, type ICasbinPolicyFilter } from '@venizia/ignis';
import type { IDataSource } from '@venizia/ignis';

interface IAppCasbinEntities {
  role: { principalType: string };
  permission: { principalType: string };
}

export class ApplicationCasbinAdapter extends BaseFilteredAdapter {
  private readonly entities: IAppCasbinEntities;

  constructor(opts: { dataSource: IDataSource; entities: IAppCasbinEntities }) {
    super({ scope: ApplicationCasbinAdapter.name, dataSource: opts.dataSource });
    this.entities = opts.entities;
  }

  // `this.connector` is provided by BaseFilteredAdapter (replaces this.appConnector).

  override async loadFilteredPolicy(model: Model, filter: ICasbinPolicyFilter): Promise<void> {
    const userId = filter.principal.id;          // was filter.principalValue
    const principalType = filter.principal.type; // was filter.principalType
    // ... unchanged bespoke logic ...
    // Instead of `Helper.loadPolicyLine(line, model)` per line you may use:
    //   await this.loadLines({ model, lines });
  }
}
```

Key swaps inside the class:
- `this.appConnector` → `this.connector` (from `BaseFilteredAdapter`).
- `filter.principalValue` → `filter.principal.id`; `filter.principalType` → `filter.principal.type`.
- `this.entities.role.principalType` / `this.entities.permission.principalType` → from your own
  `entities` (pass the same values you pass today; drop the `tableName`/`policyDefinition` parts the
  base used to require - you import the Drizzle tables directly already).
- `CasbinRuleVariants.GROUP/.POLICY` → `PolicyDefinitionVariant.GROUP/.POLICY` (§3.1).

### 3.3 Fix the cache fallback in `verifier.ts`

```ts
// BEFORE - in-memory fallback (driver removed)
const cached: ICasbinEnforcerOptions['cached'] = redis
  ? { use: true, driver: CasbinEnforcerCachedDrivers.REDIS, options: { ... } }
  : { use: true, driver: CasbinEnforcerCachedDrivers.IN_MEMORY, options: { expiresIn: 5*60*1000 } };

// AFTER - Redis or no cache
const cached: ICasbinEnforcerOptions['cached'] = redis
  ? { use: true, driver: CasbinEnforcerCachedDrivers.REDIS, options: { connection: redis, expiresIn: 5*60*1000, keyFn: ({ user }) => `casbin:${user.principalType}:${user.userId}` } }
  : { use: false };
```

> **Decide:** in prod, **always provide Redis** - without it every request rebuilds the policy from the
> DB (no per-user cache). The pool still protects you from the concurrency race, but you lose the line cache.

### 3.4 Adapter construction (`verifier.ts`)

Drop the `policyDefinition`/`tableName` entries the old base required; pass only what your re-based
class declares:

```ts
const adapter = new ApplicationCasbinAdapter({
  dataSource: this.get<PostgresCoreDataSource>({ /* unchanged */ }),
  entities: {
    role: { principalType: Role.AUTHORIZATION_SUBJECT! },
    permission: { principalType: Permission.AUTHORIZATION_SUBJECT! },
  },
});
```

Everything else in the registration (`CASBIN_RBAC_MODEL`, `domainMatching`, `normalizePayloadFn`)
stays. **Result: behavior identical, compiles on new ignis, zero data migration.**

---

## 4. Path A - Adopt the scoped model (target state)

This deletes `ApplicationCasbinAdapter` entirely and uses the generic `ScopedCasbinAdapter`. The
bespoke logic moves from **code** into **data (edges)**. Do this once Path B has unblocked you.

### 4.1 Register the generic adapter + scoped model

```ts
import {
  ScopedCasbinAdapter,
  CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
  CasbinEnforcerModelDrivers,
} from '@venizia/ignis';

const adapter = new ScopedCasbinAdapter({
  dataSource: this.get<PostgresCoreDataSource>({ /* ... */ }),
  entities: {
    policyDefinition: { tableName: PolicyDefinition.TABLE_NAME, schemaName: 'identity' },
    permission: { tableName: Permission.TABLE_NAME, schemaName: 'identity' },
    principals: { user: 'User', role: 'Role' },     // casbin name prefixes
    domainTypes: ['Merchant', 'Organizer'],          // domain types you scope on
    softDelete: { use: true, columnName: 'deleted_at' },
  },
});

// In the enforcer options:
//   model:   { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL }
//   isScoped: true
//   adapter, cached
//   ❌ remove domainMatching      (isScoped auto-registers keyMatch on g + objectMatch on g4)
//   ❌ remove normalizePayloadFn  (scoped mode uses the default (sub,dom,obj,act) payload;
//                                  pass the request domain via the provider's domain resolver instead)
```

### 4.2 Data migration - the `variant` column

The scoped adapter filters on `AuthorizationPolicyVariants.*.action`, not `group`/`policy`. You must
re-classify rows:

| Current row (`variant`) | Becomes | Rule |
|-------------------------|---------|------|
| `group`, subject=User, target=Role | `assign_role` | user→role |
| `group`, subject=Role, target=Role | `role_inherits` | role→role (if you have role hierarchy) |
| `group`, subject=User, target=Merchant | `join_domain` | user→domain membership |
| `policy` (role→perm or user→perm) | `grant` | permission grant |

New edge types you may need to **add** (no equivalent today):
- `domain_inherits` (Merchant ⊂ Organizer / HQ) - **this replaces the bespoke `queryHqOwnerOrgMerchants`
  JOIN**. Materialize one row per Merchant→Organizer (or →HQ-merchant) relationship; the scoped model's
  `g3` then cascades a grant on the parent domain to all child merchants automatically. Maintain these
  rows when merchants/organizers are created or moved.
- `resource_inherits` (`g4`) / `action_inherits` (`g5`) - only if you want resource/action hierarchies.

### 4.3 Re-express bespoke behavior as data

| Today (code in `ApplicationCasbinAdapter`) | Scoped equivalent (data) |
|--------------------------------------------|--------------------------|
| Global role → wildcard `*` domain (`AppFixedRoles.isGlobalRole`) | Store the `assign_role` row with **NULL domain** → adapter emits `g, User_x, Role_y, *` |
| NULL-domain role → expand to every member merchant | Grant rows with domain **`ANY_MEMBER`** + `join_domain` (`g2`) membership rows; the matcher resolves "any domain I'm a member of" |
| HQ-owner expansion (live JOIN) | `domain_inherits` (`g3`) edges (see §4.2) |
| Domain-agnostic role permissions (`p, Role, *, ...`) | Grant rows with domain `ANY_MEMBER` (default when `domain` is NULL) |

### 4.4 Behavioral caveat - resource matching changes

Your flat model uses exact `r.obj == p.obj`. The scoped model uses **`objectMatch`** (dotted-prefix +
wildcard): a grant on `Order` will now **also** match `Order.findById`, and `p.obj = '*'` matches any
resource. Audit your permission `code`s before switching, or you may unintentionally widen access.

### 4.5 Update `policy-definition.repository.ts`

This file queries by `variant`. After the data migration, replace `CasbinRuleVariants.GROUP/.POLICY`
with the relevant `AuthorizationPolicyVariants.*.action` values (e.g. `ASSIGN_ROLE.action`,
`JOIN_DOMAIN.action`, `GRANT.action`) matching the row kind each query targets.

---

## 5. Decision guide

```
Need to ship the ignis bump now, behavior unchanged?      → Path B (bridge).
Ready to model org hierarchy as data + run a migration?   → Path A (scoped).
```

Path B and Path A are not mutually exclusive: do **B** to upgrade safely, then schedule **A** to delete
the bespoke adapter and gain resource/action/domain hierarchies for free.

---

## 6. Verification checklist (either path)

- [ ] `bun run build` (or `tsc -p .`) is clean - no references to `DrizzleCasbinAdapter`,
      `IDrizzleCasbinAdapterOptions`, `CasbinRuleVariants.GROUP/.POLICY`, `CasbinEnforcerCachedDrivers.IN_MEMORY`,
      `IAuthorizationCacheInvalidator`.
- [ ] `SELECT DISTINCT variant FROM identity."PolicyDefinition"` matches what your adapter filters on
      (`group`/`policy` for Path B; the new `*.action` set for Path A).
- [ ] A request for a user with a role-inherited / per-merchant / global permission resolves the same
      ALLOW/DENY as before the upgrade (pick 3-4 representative users and diff).
- [ ] If `cached.use: true`, Redis is reachable; if a permission changes, call
      `enforcer.invalidateUserCache({ user })` (or rely on TTL) - see the ignis authorization docs.
- [ ] Super-admin / always-allow-roles still short-circuit (these run in the provider before the enforcer).

---

## 7. Reference - current nx-seller wiring (before)

For context, the current registration (`packages/core-server/src/application/verifier.ts`) uses:
`ApplicationCasbinAdapter` (subclass of removed `DrizzleCasbinAdapter`), `CASBIN_RBAC_MODEL` (flat
`g + p`, exact `r.obj == p.obj`), a Redis-or-in-memory `cached`, `domainMatching { roleDefinition: 'g',
fn: keyMatch }`, and a `normalizePayloadFn` mapping subject/domain via
`ApplicationCasbinAdapter.toUserVerb/toMerchantVerb`. Path B keeps all of this except the adapter base
and the in-memory cache; Path A replaces the adapter, model, `domainMatching`, and `normalizePayloadFn`.
