---
title: Casbin Custom Grants - Operation-Subset Grants in One Row
description: You can now grant a subject any subset of operations with one policy row, and planGrant builds the smallest correct set of rows for you.
packages: ['@venizia/ignis']
---

# Changelog - 2026-07-20

## Casbin Custom Grants

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" />

**In one line.** A grant row can now express any subset of a subject's operations, not only a full tier, and `planGrant` composes the smallest correct set of rows for you.

## What changed

- **Custom grant mode.** New `AuthorizationActions.CUSTOM` (`'custom'`) and `AuthorizationPolicyBuilder.customGrant()`. A custom row carries `metadata: { ops: [...] }` against a subject-level resource node. `ops` holds method names, so `ops: ['find']` on node `Order` means `Order.find`.
- **`planGrant()`.** The supported way to build an operations-subset grant. It uses a tier row wherever a tier is fully covered, then one custom row for the rest (or a per-operation row if only one operation is left). Pass `exact: true` to turn collapsing off.
- **New `metadata` column.** A nullable `metadata` jsonb column is added to `extraPolicyDefinitionColumns`.
- **Same result as per-operation rows.** `ScopedCasbinAdapter.queryGrants` expands a custom row into the same casbin lines that equivalent per-operation rows produce, at the cost of one extra batched catalog query per extraction.

```typescript
const rows = planGrant({
  subject: { type: 'Role', id: roleId },
  resource: { type: 'Permission', id: orderResourceNodeId, subject: 'Order' },
  intent: { ops: ['find', 'deleteById'] },
  catalog, // [{ subject, method, code, action }, ...] resolved from your Permission table
});
```

## Who is affected

- **Every consumer of `ScopedCasbinAdapter` and `AuthorizationPolicyBuilder`.** No action needed. The `metadata` column is nullable.
- **Apps that provision `PolicyDefinition` via `extraPolicyDefinitionColumns`.** The `metadata` column appears in your schema on the next migration. No backfill is required.
- **Apps that want to grant a few operations without a full tier.** Call `planGrant` instead of writing a `customGrant` row by hand.

## Details

- Reading a custom row is opt-in. Map `entities.policyDefinition.metadata.columnName`, or the adapter never selects `metadata` and logs and skips any custom row it finds.
- `manage` collapses only when the selection covers at least one operation in each of `read`, `write`, and `execute`. Each narrower tier collapses on its own when fully covered.
- When the target's `supportsCustomMetadata` is `false`, every leftover operation becomes its own per-operation row.
- `planGrant` throws on an unknown tier, an empty `ops`, or an operation missing from the resource's catalog slice. On read, a malformed custom row is only logged and skipped, so one bad row does not deny a user their other permissions.
