---
title: scopeFilter Now Holds Writes to the Scope
description: "A create, createAll or an update payload that names a scope column is refused with a 403 when its value is outside the resolved scope. Return ScopeFilters.UNRESTRICTED for deliberate cross-scope writes."
packages: ['@venizia/ignis-kernel', '@venizia/ignis-connectors']
---

# Changelog - 2026-10-25

## scopeFilter now holds writes to the scope

<Badge type="warning" text="Breaking Change" /> <Badge type="danger" text="Security" /> <Badge type="tip" text="Enhancement" />

**In one line.** A model with `settings.scopeFilter` scoped reads and `where`-based updates and deletes, but a `create` or an update payload could still put a row in another scope. The repository now refuses that write, and writes nothing.

## What changed

- **Create and createAll are checked.** Each row's scope columns must hold a value the resolved scope allows. One bad row refuses the whole `createAll`.
- **An update payload that names a scope column is checked.** An update that moves a row to another scope, or sets the column to `null`, is refused. An update that does not name the column is not checked: the scoped `where` already confines it.
- **The scope is read from the resolved `where`.** Equality, `eq`, `inq` or `in`, an array, `and` of those, and an `or` whose branches all constrain the same column. Another shape (an `or` over several columns, ranges, `like`, a nested path) cannot be checked, and the write is refused with its own message.
- **New settings on `scopeFilter`.** `writeGuard: 'reject' | 'assign'` (default `reject`), `sharedRows: true` to allow `null`, and an optional `columns` list.
- **`assign`** fills a scope column that is absent from a created row when the scope is a single equality. A value that is present and disagrees is still refused; an `inq` scope cannot be assigned.
- **`sharedRows` grants writing shared rows.** With `sharedRows: true`, a restricted caller may create a row with `null` or no value in the scope column, or move a row into the shared set. Without it, `null` and an absent column are refused.
- **`columns` moves a failure to boot.** When declared, each name must exist on the model, checked at boot. Without it the guard checks every column the resolved scope constrains, at write time.

## The error you will see

HTTP 403, code `core.repository.scope_write_denied`:

```text
[create] write refused by scopeFilter | entity: pricing_rules | column: merchantId | the value is outside the resolved scope
```

It names the entity and the column, never a value. A scope the guard cannot verify says so:

```text
[create] write refused by scopeFilter | entity: pricing_rules | the resolved scope cannot be verified on a write | the operator 'gt' cannot be checked on a write
```

## Who is affected

- **Models with `scopeFilter` whose code creates, or moves, rows in another scope** under a resolver that returns a `where`: a webhook, a provisioning worker, an admin back office. Their writes now fail.
- **Models with a nullable scope column that stores shared rows (`null`).** Set `sharedRows: true` on the model. A `null` branch in the scope, as in `{ or: [{ merchantId: { in: ids } }, { merchantId: null }] }`, lets the caller read shared rows only: if your resolver lists `null`, restricted callers still cannot write shared rows unless `sharedRows` is true. The ids in the list are accepted either way.
- **A create with no scope column set** now fails, unless `writeGuard: 'assign'` fills it or `sharedRows` is on.
- **Models whose scope is built with an `or` over several columns, ranges or `like`.** Writes are refused as unverifiable. Express the scope with equality or `inq`, or return `UNRESTRICTED` for that caller.
- **A create while the scope cannot be resolved** (`resolve()` returns `null` and `onMissing` is `deny`) is refused. An update there still matches no row, as before.

## Handling intended cross-scope writes

Return `ScopeFilters.UNRESTRICTED` from `resolve()` for the caller that may write across scopes, such as a system scope or an admin role:

```typescript
@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => (isSystemScope() ? ScopeFilters.UNRESTRICTED : { merchantId: currentMerchantId() }),
      sharedRows: true,
    },
  },
})
class PricingRule extends BaseRelationalEntity<typeof pricingRules> {}
```

`UNRESTRICTED` bypasses the write guard as it bypasses the read scope: rows are written exactly as given, nothing is stamped, and an explicit merchant or `null` stays as written. It is a symbol no request can produce, so the decision stays in code your application wrote. There is no global switch to turn the guard off.

Not covered: raw `drizzle` statements that bypass the repository, and an update that does not name the scope column.
