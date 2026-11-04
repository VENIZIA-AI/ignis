---
title: access.resolve receives the operation, so one model can read wider than it writes
description: "The access resolver gets { operation }. ScopeOperations replaces ScopeWriteOperations and moves to the kernel."
packages: ['@venizia/ignis-kernel', '@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-04

## access.resolve receives the operation, so one model can read wider than it writes

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `settings.access.resolve` receives `{ operation }`, so a model readable by `merchantId` or `counterpartMerchantId` can still be writable by `merchantId` only.

## What changed

- **`resolve({ operation })`.** `operation` is `ScopeOperations.READ`, `CREATE`, `UPDATE` or `DELETE`, never a group. A read and an `include`d relation pass `READ`. An update passes `UPDATE` for the payload check and for the rows it selects. A delete, a soft delete included, passes `DELETE` for both. A restore passes `UPDATE`.
- **`ScopeOperations`.** It lists the four operations and two groups, `WRITE` and `ALL`. `ScopeOperations.includes({ group, operation })` answers whether an operation belongs to a group, and `isValid` checks a value. `TScopeOperation` is the four concrete values, and `TScopeOperationGroup` is all six.
- **The `or` over two columns is still refused on a write.** Return the narrow scope for a write operation instead. The message is unchanged.

## Who is affected

- **A model whose `resolve` takes no parameter.** No action needed. Nothing changes for it.
- **A model with `write.sharedRows: true`.** Read the last point under Breaking changes.
- **Code that imports `ScopeWriteOperations` or `TScopeWriteOperation` from `@venizia/ignis-connectors` or `@venizia/ignis-connectors/relational`.** Import `ScopeOperations` and `TScopeOperation` from `@venizia/ignis-kernel` or `@venizia/ignis`.
- **A repository subclass or test probe that calls `applyScopeFilter`, `applyDefaultFilter` or `guardScopedWrite`.** Type its `mutation` or `operation` as `TScopeOperation`, not `string`.
- **Code that calls `access.resolve()` directly.** Pass `{ operation }`.
- **A repository subclass that overrides `updateById` or `updateAll` and relies on seeing every soft delete.** A soft delete (`deleteById`, `deleteAll`, `deleteBy` on a soft-deletable repository) now calls the protected `_update` directly, with `ScopeOperations.DELETE`, so those overrides no longer run for it. Put the logic in `_update`, or override the `delete*` method.

## Breaking changes

> [!WARNING]
> This affects code that imports the old constant or types a `mutation` as `string`.

**Before:**

```typescript
import { ScopeWriteOperations, type TScopeWriteOperation } from '@venizia/ignis-connectors/relational';

scoped(opts: { where: TWhere; mutation?: string }) {
  return this.applyScopeFilter({ userFilter: { where: opts.where }, mutation: opts.mutation });
}
```

**After:**

```typescript
import { ScopeOperations, type TScopeOperation } from '@venizia/ignis';

scoped(opts: { where: TWhere; mutation?: TScopeOperation }) {
  return this.applyScopeFilter({ userFilter: { where: opts.where }, mutation: opts.mutation });
}
```

`ScopeWriteOperations.CREATE` and `UPDATE` are now `ScopeOperations.CREATE` and `UPDATE`. `ScopeWriteOperations.SCHEME_SET` held two values. `ScopeOperations.SCHEME_SET` holds six, and `ScopeOperations.OPERATION_SET` holds the four concrete ones.

With `write.sharedRows: true`, the rows an update or delete selects are now refused when the scope is one the guard cannot read, such as a range, a `like` or an `or` over two columns. Before, that case accepted any shape. Return a scope the guard can read.

## Details

Read both columns, write one:

```typescript
import { ScopeOperations } from '@venizia/ignis';

const access = {
  resolve: ({ operation }) => {
    const merchantId = currentMerchantId();

    return ScopeOperations.includes({ group: ScopeOperations.WRITE, operation })
      ? { merchantId }
      : { or: [{ merchantId }, { counterpartMerchantId: merchantId }] };
  },
};
```

The [model settings guide](/guides/core-concepts/persistent/model-settings#read-wider-than-you-write) has the full example and the operation each repository call passes.
