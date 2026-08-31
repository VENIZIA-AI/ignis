---
title: A Row Scope Every Query Carries, Denied by Default When It Cannot Be Resolved
description: A new @model settings.scopeFilter ANDs a per-request row scope into every relational read and write - including restore() and every relation loaded via include - and refuses to guess when the scope cannot be resolved. A third state, ScopeFilters.UNRESTRICTED, lets a caller bypass scoping for one call. Search repositories are not covered.
---

# Changelog - 2026-08-30

## Row Scope Filter

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** A `scopeFilter` on a relational `@model` narrows every read and write to the rows the current caller may see, and matches zero rows when it cannot tell who the caller is.

## The problem it solves

A multi-tenant app scopes every query by hand: `WHERE merchantId IN (...)` on every `find`, every `update`, every `delete`. Forget it once and one tenant's data leaks into another's response - silently, because a missing `WHERE` clause does not throw. `defaultFilter` already lets a model narrow its own queries, but it has an escape hatch (`shouldSkipDefaultFilter`) that soft-delete's `restore()` deliberately uses to reach past `deletedAt: null`. Reusing `defaultFilter` for tenant scoping would hand `restore()` that same escape hatch - a caller could restore a row that belongs to someone else.

`scopeFilter` is a second, separate filter with no shared escape hatch:

```typescript
@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => currentTenantWhere(),
    },
  },
})
class Order extends BasePostgresEntity {
  // ...
}
```

## What changed

- **New `scopeFilter` model setting.** `resolve()` returns the current caller's `where`, re-evaluated on every call - so it can read the active request.
- **ANDed into every read and write**, including `restore()` - the exact path a tenant-scoped `defaultFilter` cannot cover.
- **Reaches relations loaded through `include`, at every nesting depth.** A scoped `Merchant` that includes `products` no longer hands back another tenant's products, even when `products` is reached through a relation of a relation.
- **Never removable by `shouldSkipDefaultFilter`**, on the parent or on an included relation. That flag still bypasses `defaultFilter` alone, which is what makes soft-delete's `restore()` safe to keep using it.
- **Denies by default when `resolve()` returns `null` or `undefined`.** No request context, no tenant, a background job with no scope wired up - all match zero rows unless the model opts into `onMissing: 'allow'`.
- **A throwing `resolve()` propagates.** The query fails loudly instead of running unscoped - on the parent and on every included relation.
- **New `ScopeFilters.UNRESTRICTED`.** A third `resolve()` return value for a caller who should see everything on this one call - see "A third state" below.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `resolve` | `() => TWhere \| typeof ScopeFilters.UNRESTRICTED \| null \| undefined` | required | Returns the current caller's scope `where`; `ScopeFilters.UNRESTRICTED` to apply no scope on this call; or `null`/`undefined` when the scope cannot be determined at all. |
| `onMissing` | `'deny' \| 'allow'` | `'deny'` | What happens when `resolve()` returns null/undefined. `'deny'` matches zero rows. `'allow'` runs the query unscoped - an explicit, reviewed opt-out for migrations and background jobs, never inferable from a request. |

## A third state: unrestricted for one call

A `where`, and `null`/`undefined`, are not enough for a real multi-tenant application. Its resolver usually has an internal-operator branch:

```typescript
resolve: () => {
  if (isAlwaysAllowedOperator()) {
    return { userMerchantIds: [] }; // meant "everything" - but a real filter, so it MATCHES NOTHING
  }
  if (activeMerchantHeader()) {
    return { userMerchantIds: [activeMerchantHeader()] };
  }
  return { userMerchantIds: currentUsersMerchantIds() };
},
```

`onMissing: 'allow'` cannot express that branch. `onMissing` is declared once, on the model's static `settings` - it cannot depend on which user is calling. Setting it to `'allow'` to serve an operator would also unscope every ordinary user whose `resolve()` happens to return nothing, turning a configuration slip into a data leak.

`ScopeFilters.UNRESTRICTED` is the explicit third value. Return it, and this one call runs with no scope at all:

```typescript
import { ScopeFilters } from '@venizia/ignis-kernel';

resolve: () => {
  if (isAlwaysAllowedOperator()) {
    return ScopeFilters.UNRESTRICTED;
  }
  if (activeMerchantHeader()) {
    return { userMerchantIds: [activeMerchantHeader()] };
  }
  return { userMerchantIds: currentUsersMerchantIds() };
},
```

| `resolve()` returns | Behavior |
|---|---|
| a `TWhere` | ANDed into the query, as always |
| `ScopeFilters.UNRESTRICTED` | no scope applied, for this call only |
| `null` / `undefined` | `onMissing` - denies by default |

The order matters, and it is the whole safety property: `ScopeFilters.UNRESTRICTED` is checked by exact symbol identity, before the null/undefined branch. A resolver that forgets a `return` on some branch produces `undefined` - not the symbol - and still lands in deny. `ScopeFilters.UNRESTRICTED` is a `Symbol.for(...)`, deliberately: no JSON body, query string, or header can ever produce it, so the bypass can only come from code the application wrote and reviewed. It is re-evaluated on every call, exactly like a `where` - a resolver can return it once and a scoped `where` the next time.

## Included relations are scoped too

`include` no longer bypasses `scopeFilter`. Each relation resolves its **own** `scopeFilter` from its **own** `@model` settings - a parent's scope never cascades to a child, and a child with no `scopeFilter` stays exactly as unscoped as it was before this change.

```typescript
@model({ settings: { scopeFilter: { resolve: () => currentTenantWhere() } } })
class Merchant extends BasePostgresEntity {
  static override relations = () => [{ name: 'products', type: RelationTypes.MANY, schema: Product.schema }];
}

@model({ settings: { scopeFilter: { resolve: () => currentTenantWhere() } } })
class Product extends BasePostgresEntity {
  // ...
}

// merchantRepository.find({ filter: { include: [{ relation: 'products' }] } })
// only returns `products` rows Product's OWN scopeFilter permits - not every row that
// merely shares a `merchantId` with an in-scope Merchant.
```

If `Product` above had no `scopeFilter` at all, its rows under `include` would be exactly as unscoped as before this change - scoping one model in a relation graph never scopes its neighbors.

The same rules as the parent apply at every relation, and at every nesting depth (a relation of a relation):

- `shouldSkipDefaultFilter` on an `include` entry still bypasses only that relation's `defaultFilter`, never its `scopeFilter`.
- `onMissing: 'deny'` (the default) removes every row of that relation when its own `resolve()` cannot determine a scope; `'allow'` leaves it unscoped.
- A throwing `resolve()` on any included relation fails the whole query, the same as a throwing `resolve()` on the parent.

## Who is affected

- **Models with no `scopeFilter` setting**, whether queried directly or reached only through another model's `include`. No action needed - `find`, `count`, `update`, `delete`, and `restore` produce byte-identical SQL to before this change.
- **Models adding `scopeFilter` for the first time.** `restore()` on a row outside the resolved scope now reports zero rows updated instead of restoring it.
- **Models used as relation targets.** If a model already had `scopeFilter` before this change, rows it returned under someone else's `include` were NOT scoped - they are now. Audit any `include` of a scoped model that relied on seeing every related row regardless of tenant.
- **Background jobs and migrations running against a scoped model.** They see zero rows once `scopeFilter` is added, unless the model declares `onMissing: 'allow'`.

## What is NOT scoped

**`scopeFilter` covers relational repositories only.** Search repositories (Typesense, Meilisearch) do not read this setting at all - `find`, `search`, `count`, and every write on a search repository run exactly as before, with no row scope applied.

This is a deliberate scope decision, not an oversight: search repositories compile filters through a different pipeline (`buildQuery` / `compileEffectiveWhere`, string `filterBy` expressions), and covering it is separate work. If your application mirrors a scoped relational entity into a search index, you must scope your search queries yourself - a `scopeFilter` on the relational model gives you nothing there.

## Write paths: filter-shaped scope only

**`scopeFilter` covers `update` and `delete`, never `create`.** Scope is a `where` clause AND-ed
into the query, and an `INSERT` has no `where` to AND into - so there is nothing to filter. This is
structural, not an omission.

> [!WARNING]
> **Nothing stops a caller creating a row owned by somebody else.** Validating ownership at insert
> time stays your application's job: the framework has no channel to know whether a `userId` in a
> payload is the caller. A model with `scopeFilter` is NOT protected against a request that posts a
> foreign `userId`.

For `update` and `delete`, the scope is a `where` comparing a column (`merchantId`, `tenantId`)
against values the resolver already knows. Most tenant-scoped updates are exactly that shape, and
`scopeFilter` covers them completely.

### The trap on the scoped side: a write that takes someone else's id

Because `update` and `delete` ARE scoped, an administrative method that legitimately targets
another user's rows silently stops working:

```typescript
// Admin deletes an account and cleans up that user's configuration.
await userConfigurationRepository.deleteAllForUser({ userId: victimId });
```

With `scopeFilter` active, that `deleteBy` narrows to the ADMIN's own rows. It deletes nothing,
throws nothing, and **reports success** - the caller reads a clean result while the target's rows
stay behind. No type error, no failing test, no log line.

> [!IMPORTANT]
> When you add `scopeFilter` to a model, audit every `updateById` / `updateAll` / `deleteBy` call
> that takes **another principal's id as an argument**. Those are exactly the calls that break, and
> they break quietly.

The fix is a method on the repository itself, passing `dangerouslySkipScopeFilter` - written and
reviewed where the escape is visible, rather than a flag in the request context that any layer
could set.

It does not cover ownership that is resolved per row, or through a polymorphic reference. Some rows carry no tenant column at all - only a `principalType` and `principalId` pair, where the owner lives in a different table chosen by `principalType` at runtime. That check is per-row, asynchronous, and reads the payload - three properties `resolve(): TWhere` was never built to express.

If your write path looks like that, `scopeFilter` gives you nothing there. Your application still has to run its own ownership check before the write. `scopeFilter` neither performs that check nor detects that you skipped it - no type error, no failing test, no log line will tell you.

This is a deliberate gap for now, not an oversight - the same way search repositories are excluded above. No hook or escape hatch exists for the per-row case: the shape of that check differs enough between applications that building a seam before its shape is known would guess wrong.

## Adopting it where an ownership guard already exists

> [!WARNING]
> **Replace the guard, do not run it alongside.** Two sources of truth for one rule is the trap,
> and it is a quiet one: AND-ing the same predicate twice is idempotent, so results stay correct
> and nothing looks wrong. The redundancy does not add safety - it **hides divergence** until the
> day the two disagree. A subclass that overrides one but not the other drifts with no compile
> error and no failing test.

That rules out the obvious "move one entity family at a time while the guards stay" plan. Migrate a
family by removing its guard in the same change that adds `scopeFilter`, or leave the family alone.

## `scopeFilter` narrows; an ownership guard throws - and that difference decides what each covers

`scopeFilter` injects a `where`. A hand-written guard loads the row and throws `403`/`404`. The two
have **opposite failure profiles**, and neither is strictly better:

| | `scopeFilter` (inject a `where`) | Guard (load the row, throw) |
|---|---|---|
| A handler that forgets | **still scoped** - the repository does it | **a hole** - nothing runs |
| `create` | **not covered** - an `INSERT` has no `where` | **covered** - it asserts on the payload |
| Admin targeting another principal | **silently narrows**, reports success | **throws** - cannot silently succeed |
| Indirect / per-row ownership | **not expressible** - `resolve()` is synchronous | expressible - it may query |
| Cost per operation | none - one more `where` clause | a read before every write |

Read the first and third rows together: `scopeFilter` removes the class of bug where somebody forgot
to check, and introduces the class where a legitimate cross-principal write quietly does nothing. A
guard is the mirror image. Choose per model, and expect to keep guards on `create` regardless.

## Details

- **The escape hatch is `dangerouslySkipScopeFilter`**, and it cannot come from the wire. It is a parameter on internal repository methods, never a field on `IExtraOptions` or any filter schema - no controller, no query string, and no request body can set it. It exists for one framework-internal case (a filter `find()` already scoped, re-entering `findWithCoreAPI`) and for administrative repository code written and reviewed at the call site.
- **`onMissing: 'deny'` compiles to a real, deterministic SQL condition** - an empty `inq` (`WHERE id IN ()` shaped), which every relational dialect already reduces to a literal `false`. It is not "return an empty array after the fact"; the database itself matches nothing.
- **`shouldSkipDefaultFilter: true` still only removes `defaultFilter`.** A model combining `scopeFilter` (tenant) with `defaultFilter` (soft-delete) keeps the tenant scope even when a caller skips the soft-delete filter to read deleted rows.

| File | Package |
|------|---------|
| `src/helpers/inversion/common/types.ts` | kernel |
| `src/base/repositories/common/constants.ts` | kernel |
| `src/relational/core/repositories/core/base.ts` | connectors |
| `src/relational/core/repositories/core/readable.ts` | connectors |
| `src/relational/core/repositories/dialect/filter.ts` | connectors |
| `src/relational/core/repositories/common/scope-filter.ts` | connectors |
