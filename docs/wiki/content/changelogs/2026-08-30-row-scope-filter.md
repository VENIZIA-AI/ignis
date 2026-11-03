---
title: A Row Scope Every Query Carries, Denied by Default When It Cannot Be Resolved
description: A new @model settings.scopeFilter narrows every relational read and write, including restore() and included relations, to the caller's rows, and matches nothing when the scope cannot be resolved.
packages: ['@venizia/ignis-connectors', '@venizia/ignis-kernel']
---

# Changelog - 2026-08-30

## Row Scope Filter

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** A `scopeFilter` on a relational `@model` narrows every read and write to the rows the current caller may see, and matches zero rows when it cannot tell who the caller is.

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

- **New `scopeFilter` model setting.** `resolve()` returns the current caller's `where`, re-evaluated on every call.
- **ANDed into every read and write,** including `restore()`. A tenant-scoped `defaultFilter` cannot cover `restore()`, because `shouldSkipDefaultFilter` bypasses it.
- **Reaches relations loaded through `include`, at every nesting depth.** Each relation resolves its own `scopeFilter` from its own `@model` settings. A parent's scope never cascades to a child, and a relation with no `scopeFilter` stays unscoped.
- **`shouldSkipDefaultFilter` never removes it,** on the parent or an included relation.
- **Denies by default when `resolve()` returns `null` or `undefined`.** No request context, no tenant, or a background job with no scope wired up matches zero rows, unless the model opts into `onMissing: 'allow'`.
- **A throwing `resolve()` propagates.** The query fails instead of running unscoped, on the parent and on every included relation.
- **New `ScopeFilters.UNRESTRICTED`.** A third `resolve()` return value for a caller who should see everything on this one call.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `resolve` | `() => TWhere \| typeof ScopeFilters.UNRESTRICTED \| null \| undefined` | required | Returns the current caller's scope `where`; `ScopeFilters.UNRESTRICTED` to apply no scope on this call; or `null`/`undefined` when the scope cannot be determined. |
| `onMissing` | `'deny' \| 'allow'` | `'deny'` | What happens when `resolve()` returns null/undefined. `'deny'` matches zero rows. `'allow'` runs the query unscoped - an explicit opt-out for migrations and background jobs. |

## Who is affected

- **Models with no `scopeFilter`,** queried directly or through another model's `include`. No action needed. Queries are unchanged.
- **Models adding `scopeFilter` for the first time.** `restore()` on a row outside the resolved scope now reports zero rows updated.
- **Models used as relation targets that already had `scopeFilter`.** Their rows under someone else's `include` were not scoped before; they are now. Audit any `include` that relied on seeing every related row regardless of tenant.
- **Background jobs and migrations against a scoped model.** They see zero rows unless the model declares `onMissing: 'allow'`.

## Details

### A third state: unrestricted for one call

A resolver often has an internal-operator branch. Returning `{ userMerchantIds: [] }` for it matches nothing, and `onMissing: 'allow'` cannot help because it is set once on the model and would also unscope ordinary users whose `resolve()` returns nothing. Return `ScopeFilters.UNRESTRICTED` instead:

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
| a `TWhere` | ANDed into the query |
| `ScopeFilters.UNRESTRICTED` | no scope applied, for this call only |
| `null` / `undefined` | `onMissing` - denies by default |

It is checked by exact symbol identity before the null branch, so a resolver that forgets a `return` produces `undefined` and still denies. It is a `Symbol.for(...)`, so no JSON body, query string or header can produce it.

### What is NOT scoped

- **Search repositories** (Typesense, Meilisearch) do not read this setting. If you mirror a scoped relational entity into a search index, scope your search queries yourself.
- **`create`.** Scope is a `where` clause, and an `INSERT` has no `where`.

> [!WARNING]
> Nothing stops a caller creating a row owned by somebody else. Validating ownership at insert time stays your application's job. A model with `scopeFilter` is not protected against a request that posts a foreign `userId`.

- **Per-row or polymorphic ownership.** `resolve(): TWhere` is synchronous and cannot express a check that is per row, asynchronous, or reads the payload. Your application must run its own ownership check before such a write. Nothing will tell you if you skipped it.

### The trap on `update` and `delete`

`update` and `delete` are scoped, so an admin method that targets another user's rows silently stops working:

```typescript
await userConfigurationRepository.deleteAllForUser({ userId: victimId });
```

With `scopeFilter` active, that `deleteBy` narrows to the admin's own rows. It deletes nothing, throws nothing, and reports success.

> [!IMPORTANT]
> When you add `scopeFilter` to a model, audit every `updateById` / `updateAll` / `deleteBy` call that takes another principal's id as an argument. Those are the calls that break, quietly.

The fix is a method on the repository itself that passes `dangerouslySkipScopeFilter`. It is a parameter on internal repository methods, never a field on `IExtraOptions` or any filter schema, so no controller, query string or request body can set it.

### Adopting it where an ownership guard exists

> [!WARNING]
> Replace the guard, do not run it alongside. AND-ing the same predicate twice is idempotent, so it hides divergence until the two disagree. Migrate a family by removing its guard in the same change that adds `scopeFilter`, or leave it alone.

| | `scopeFilter` (inject a `where`) | Guard (load the row, throw) |
|---|---|---|
| A handler that forgets | still scoped | a hole |
| `create` | not covered | covered |
| Admin targeting another principal | silently narrows, reports success | throws |
| Indirect / per-row ownership | not expressible | expressible |
| Cost per operation | none | a read before every write |

Expect to keep guards on `create` regardless.

- `onMissing: 'deny'` compiles to a real SQL condition (an empty `inq`), so the database itself matches nothing.
- A model combining `scopeFilter` (tenant) with `defaultFilter` (soft-delete) keeps the tenant scope even when a caller skips the soft-delete filter to read deleted rows.
