---
title: Casbin Custom Grants - Operation-Subset Grants in One Row
description: A PolicyDefinition grant row can now carry an arbitrary subset of a subject's operations via metadata.ops; ScopedCasbinAdapter expands it at read time and planGrant composes the smallest correct set of rows for any operation selection.
---

# Changelog - 2026-07-20

## Casbin Custom Grants

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" />

**In one line.** A grant row can now express an arbitrary subset of a subject's operations - not just a full tier - and `planGrant` composes the smallest correct set of rows for any operation selection.

## What changed

- **New `action = 'custom'` grant mode.** `AuthorizationActions.CUSTOM` (`'custom'`) plus `AuthorizationPolicyBuilder.customGrant()` - a grant row can carry `action: 'custom'` and `metadata: { ops: [...] }` against a subject-level resource node, granting exactly those operations instead of a whole tier.
- **`ScopedCasbinAdapter` expands custom rows at read time.** `queryGrants` turns each custom row into one `p` line per operation, each carrying that operation's catalogued action - byte-identical to what equivalent per-operation grant rows produce. One extra batched catalog query (`queryOperationCatalog`) per extraction, none when no custom rows are present.
- **Reading is opt-in.** New `entities.policyDefinition.metadata.columnName` - without it mapped, the adapter never selects `metadata`, and a custom row is logged and skipped.
- **New `planGrant()` write-side planner** (`common/grant-planner.ts`) - the supported way to compose an operations-subset grant. It collapses a selection into tier grants wherever a tier is fully covered, and falls back to a custom row (or a per-operation row, for a single leftover operation) only for what does not collapse. `exact: true` opts out of collapsing.
- **New nullable `metadata` jsonb column** in `extraPolicyDefinitionColumns` - reaches every consumer's `PolicyDefinition` schema automatically, since every app builds its table from this shared column set.
- **`queryGrants`'s SELECT now also reads `permission.subject` and `permission.method`** - needed to resolve a custom row's target subject and to distinguish a resource node from an operation-level permission.

## Who is affected

- **Every consumer of `ScopedCasbinAdapter` and `AuthorizationPolicyBuilder`.** No action needed - the `metadata` column is nullable and reading it is opt-in via `metadata.columnName`; without that mapping, behavior is unchanged and a stray custom row is simply logged and skipped.
- **Apps that want to grant a subject a handful of operations without hand-picking a tier.** Use `planGrant({ subject, resource, intent: { ops: [...] }, catalog })` instead of writing a `customGrant` row directly - it does the tier-collapse math and throws (via `getError`) on an operation the catalog doesn't recognize, rather than persisting an ambiguous row.
- **Apps that provision `PolicyDefinition` via `extraPolicyDefinitionColumns`.** The new `metadata` column appears in their schema on the next migration; nullable, so no backfill is required.

## Details

- **Row shape.** A subset grant is `action: 'custom'`, target = a subject-level resource node (`Permission.method === AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD`, the `*` sentinel), `metadata: { ops: [...] }`. `ops` holds **method names**, not full permission codes - the subject comes from the target node, so `ops: ['find']` against node `Order` resolves to `Order.find`.
- **Expansion parity.** A planned custom row and the equivalent per-operation rows expand to identical casbin lines - nothing downstream, including the enforcer, can distinguish the two encodings.
- **`planGrant`'s tier-collapse rule.** `manage` collapses only when the subject has at least one operation in each of `read`, `write`, and `execute` - otherwise `manage` would cover a future operation in an as-yet-empty tier and silently pre-authorize it. Failing that, each fully-covered narrow tier collapses into its own row. A tier collapses whenever the selection completely covers it, however few operations that tier holds - a selection that happens to be a tier's only member still collapses into a tier grant; it does not become a custom row just because it is small. Only an operation still left over **after** collapsing is planned as a per-operation row (or, when `supportsCustomMetadata: false`, every leftover operation becomes its own per-operation row).
- **Rejection is read-side log-and-skip, write-side throw.** `planGrant` throws (`getError`) on an unknown tier, empty `ops`, or an `ops` entry absent from the resource's catalog slice - a write is one deliberate act a caller can be told is wrong. The adapter instead logs and skips a malformed custom row, since a read is a bulk operation over data that may already be inconsistent and one bad row must not deny a user their remaining permissions.

```typescript
import { planGrant } from '@venizia/ignis';

const rows = planGrant({
  subject: { type: 'Role', id: roleId },
  resource: { type: 'Permission', id: orderResourceNodeId, subject: 'Order' },
  intent: { ops: ['find', 'deleteById'] },
  catalog, // [{ subject, method, code, action }, ...] resolved from your Permission table
});
```

| File | Package |
|------|---------|
| `src/components/auth/authorize/common/grant-planner.ts` | core |
| `src/components/auth/authorize/common/custom-grant.ts` | core |
| `src/components/auth/authorize/common/policy-builder.ts` | core |
| `src/components/auth/authorize/common/constants.ts` | core |
| `src/components/auth/authorize/adapters/scoped-casbin.adapter.ts` | core |
| `src/components/auth/models/entities/policy-definition.model.ts` | core |
