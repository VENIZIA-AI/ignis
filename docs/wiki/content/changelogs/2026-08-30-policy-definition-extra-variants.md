---
title: "PolicyDefinition.variant Stays Closed by Default, but an App Can Now Declare Its Own Edge Kinds"
description: "extraPolicyDefinitionColumns takes an extraVariants option so an app can store its own edge kinds in PolicyDefinition, while apps that declare nothing see no change."
packages: ['@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-08-30

## `PolicyDefinition.variant` Accepts App-Declared Extra Values

<Badge type="tip" text="Enhancement" />

**In one line.** `extraPolicyDefinitionColumns` now takes an `extraVariants` option, so an application can store its own edge kinds in `PolicyDefinition` and still get a compile error on a wrong `variant` value.

## What changed

`kernel@0.2.0-6` narrowed the `variant` column to IGNIS's seven values (`grant`, `assign_role`, `role_inherits`, `join_domain`, `domain_inherits`, `resource_inherits`, `action_inherits`). That caught typos, but left no way to declare an application's own edge type without an unsafe cast.

- **New `extraVariants` option** on `extraPolicyDefinitionColumns`: an array of your own variant strings. The column's type becomes the seven values plus whatever the array lists.
- **The default is unchanged.** `extraPolicyDefinitionColumns()` still accepts only the seven values, so `'group'`, `'policy'`, `'p'` and `'g'` stay compile errors.
- **No `as const` needed.** The array is inferred as a literal tuple.

```typescript
// An application with its own `merchant_role` edge, alongside IGNIS's seven:
extraPolicyDefinitionColumns({ idType: 'string', extraVariants: ['merchant_role'] });
```

## Who is affected

- **Every application that calls `extraPolicyDefinitionColumns()` today.** No action needed.
- **An application storing its own edge kind, blocked by the `0.2.0-6` narrowing.** Add `extraVariants` with that value.

## Details

- **Expect errors to move outward, not disappear.** A narrowed column rejects every loose type on the path that carries the value, one layer at a time. A container typed `Array<Record<string, unknown>>` passed to `createAll` no longer satisfies the parameter. A field restated as `string` across several service layers surfaces one layer per build. Fix these at the source type rather than casting at the write.
- **`effect` stays closed** to `allow` / `deny` / `abstain`. Its value is written into the raw casbin policy line and read by casbin's effect evaluator, so an app-defined value would produce an authorization decision nobody defined.
- **The check covers writes, not filters.** `variant` is checked on `$inferInsert` and `AuthorizationPolicyBuilder` output. It is not checked inside a `where` clause: `where: { variant: 'joindomain' }` compiles and silently returns zero rows.
- `AuthorizationPolicyBuilder.grant()` and `.customGrant()` now declare an explicit return type, so correctly-typed rows keep assigning to the narrowed column.

See the [Authorization API reference](/extensions/components/authorization/api).
