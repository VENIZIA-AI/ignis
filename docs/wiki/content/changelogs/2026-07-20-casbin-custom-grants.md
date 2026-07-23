---
title: Casbin Custom Grants - Operation-Subset Grants in One Row
description: A PolicyDefinition grant row can now carry an arbitrary subset of a subject's operations via metadata.ops; ScopedCasbinAdapter expands it at read time and planGrant composes the smallest correct set of rows for any operation selection.
---

# Changelog - 2026-07-20

## Casbin Custom Grants

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" />

**In one line.** A grant row can now express an arbitrary subset of a subject's operations, not only a full tier. `planGrant` composes the smallest correct set of rows for any selection.

## The problem it solves

A grant row used to mean one of four fixed tiers - `read`, `write`, `execute`, or `manage`. Granting a subject three operations out of a five-operation tier meant granting the whole tier, or hand-writing five per-operation rows:

```typescript
const rows = planGrant({
  subject: { type: 'Role', id: roleId },
  resource: { type: 'Permission', id: orderResourceNodeId, subject: 'Order' },
  intent: { ops: ['find', 'deleteById'] },
  catalog, // [{ subject, method, code, action }, ...] resolved from your Permission table
});
```

`planGrant` picks the smallest row set that grants exactly `find` and `deleteById` on `Order` - a tier row wherever a tier fully collapses, one custom row otherwise.

## What changed

- New `action = 'custom'` grant mode: `AuthorizationActions.CUSTOM` (`'custom'`) plus `AuthorizationPolicyBuilder.customGrant()`.
- A custom row carries `metadata: { ops: [...] }` against a subject-level resource node - the operations it grants, not a tier.
- `ScopedCasbinAdapter.queryGrants` expands each custom row into one `p` line per operation at read time. The output is byte-identical to what equivalent per-operation rows produce, at the cost of one extra batched catalog query (`queryOperationCatalog`) per extraction when a custom row is present.
- Reading a custom row is opt-in. Map `entities.policyDefinition.metadata.columnName`, or the adapter never selects `metadata` - it logs and skips any custom row it finds instead.
- New `planGrant()` planner in `common/grant-planner.ts`, the supported way to build an operations-subset grant. It collapses a selection into tier rows wherever a tier is fully covered, then represents what is left as one custom row - or a per-operation row, if only one operation remains. Pass `exact: true` to turn collapsing off.
- New nullable `metadata` jsonb column in `extraPolicyDefinitionColumns`. Every app that builds its `PolicyDefinition` table from this shared column set gets it automatically.
- `queryGrants`'s SELECT now also reads `permission.subject` and `permission.method`, needed to resolve a custom row's target subject and to tell a resource node from an operation-level permission.

## How planGrant collapses a selection

- `manage` collapses only when the selection covers at least one operation in each of `read`, `write`, and `execute`. Otherwise a future operation added to an as-yet-empty tier would be silently pre-authorized.
- Each narrower tier (`read`, `write`, `execute`) collapses on its own whenever the selection fully covers it - even a tier with a single operation. A tier is never demoted to a custom row for being small.
- What is left over after collapsing becomes one custom row, or a per-operation row if only one operation is left over.
- When the target's `supportsCustomMetadata` is `false`, every leftover operation becomes its own per-operation row instead of one custom row.
- `planGrant` throws (via `getError`) on an unknown tier, an empty `ops`, or an operation missing from the resource's catalog slice. A write is a deliberate act, so the caller hears about a mistake immediately.
- The adapter only logs and skips a malformed custom row on read. A read runs over data that may already be inconsistent - one bad row must not deny a user their remaining permissions.

## Who is affected

- **Every consumer of `ScopedCasbinAdapter` and `AuthorizationPolicyBuilder`.** No action needed. The `metadata` column is nullable, and reading it is opt-in via `metadata.columnName`.
- **Apps that want to grant a subject a handful of operations without a full tier.** Call `planGrant({ subject, resource, intent: { ops: [...] }, catalog })` instead of writing a `customGrant` row by hand - it does the tier-collapse math and throws on an operation the catalog does not recognize.
- **Apps that provision `PolicyDefinition` via `extraPolicyDefinitionColumns`.** The new `metadata` column appears in their schema on the next migration. It is nullable, so no backfill is required.

## Details

- **Row shape.** A subset grant is `action: 'custom'`, target = a subject-level resource node (`Permission.method === AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD`, the `*` sentinel), `metadata: { ops: [...] }`. `ops` holds method names, not full permission codes - the subject comes from the target node, so `ops: ['find']` against node `Order` resolves to `Order.find`.
- **Expansion parity.** A planned custom row and the equivalent per-operation rows expand to identical casbin lines. Nothing downstream, including the enforcer, can tell the two encodings apart.

| File | Package |
|------|---------|
| `src/components/auth/authorize/common/grant-planner.ts` | core |
| `src/components/auth/authorize/common/custom-grant.ts` | core |
| `src/components/auth/authorize/common/policy-builder.ts` | core |
| `src/components/auth/authorize/common/constants.ts` | core |
| `src/components/auth/authorize/adapters/scoped-casbin.adapter.ts` | core |
| `src/components/auth/models/entities/policy-definition.model.ts` | core |
