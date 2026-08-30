---
title: "PolicyDefinition.variant Stays Closed by Default, but an App Can Now Declare Its Own Edge Kinds"
description: "kernel@0.2.0-6 narrowed the variant column to IGNIS's seven edge kinds only, with no way for an application to add its own. extraPolicyDefinitionColumns now takes an extraVariants option that widens the column's type for one call site, while every app that declares nothing sees no change at all."
---

# Changelog - 2026-08-30

## `PolicyDefinition.variant` Accepts App-Declared Extra Values

<Badge type="tip" text="Enhancement" />

**In one line.** `extraPolicyDefinitionColumns` now takes an `extraVariants` option, so an application can store its own edge kinds in the same `PolicyDefinition` table without losing the compile-time check that catches a wrong `variant` value.

## The problem it solves

Three wrong vocabularies for the `variant` column had shipped in docs and an example seed script over time: `'p'`/`'g'` (casbin's own rule prefixes) and `'group'`/`'policy'`. A wrong value is not a startup error - `ScopedCasbinAdapter` filters every query with an explicit `variant = <value>` or `variant IN (...)`, so a typo just selects zero rows. The result is a permanent 403 with nothing in any log to point at why.

`kernel@0.2.0-6` closed that gap by narrowing `variant`'s type to IGNIS's seven values (`grant`, `assign_role`, `role_inherits`, `join_domain`, `domain_inherits`, `resource_inherits`, `action_inherits`). A typo became a compile error.

But the narrowing over-reached: it said only IGNIS may define a variant, which was never the intent. An application can have its own edge type stored in the same table - `ScopedCasbinAdapter` never reads it, so storing it alongside the seven IGNIS kinds was always safe. After `0.2.0-6`, declaring that type became impossible without reaching for an unsafe cast.

## What changed

- **`extraPolicyDefinitionColumns` takes a new `extraVariants` option**, an array of the application's own variant strings. The `variant` column's type becomes IGNIS's seven values plus whatever the array lists.
- **The default is unchanged.** Call `extraPolicyDefinitionColumns()` or `extraPolicyDefinitionColumns({ idType: 'string' })` exactly as before, and the column still accepts only the seven IGNIS values - `'group'`, `'policy'`, `'p'`, and `'g'` are still compile errors.
- **No `as const` needed at the call site.** The array is inferred as a literal tuple automatically.

```typescript
// An application with its own `merchant_role` edge, alongside IGNIS's seven:
extraPolicyDefinitionColumns({ idType: 'string', extraVariants: ['merchant_role'] });
```

## Who is affected

- **Every application that calls `extraPolicyDefinitionColumns()` today.** No action needed - the default shape is exactly what `0.2.0-6` shipped.
- **An application storing its own edge kind in `PolicyDefinition`, blocked by `0.2.0-6`'s narrowing.** Add `extraVariants` with that value. `AuthorizationPolicyBuilder`'s output (`grant()`, `assignRole()`, and the rest) keeps assigning cleanly to the column either way.

## Details

- **`effect` is not getting the same treatment.** `variant` is a discriminator `ScopedCasbinAdapter` filters on - an unknown value is simply never selected, which is exactly what made the original bug silent and safe to widen back open. `effect` is different: its value (`allow` / `deny` / `abstain`) is written directly into the raw casbin policy line and read by casbin's own effect evaluator. An application-defined fourth value would not be filtered out - it would reach the evaluator and produce an authorization decision nobody defined the meaning of. That is a correctness risk in the enforcement path itself, not a harmless unselected row, so `effect` stays closed to IGNIS's three values.
- **`AuthorizationPolicyBuilder.grant()` and `.customGrant()` now declare an explicit return type.** Without one, TypeScript's return-type inference widened `effect` from `TAuthorizationDecision` to plain `string` for these two methods (a general quirk of conditional-type-derived literal unions passed through an unannotated method return), which would have made a correctly-typed row fail to assign to the narrowed column. `assignRole()` and the other builder methods carry no `effect` field and were unaffected.

- **The check covers the write path, not the filter path.** `variant` is checked wherever a row is written - `$inferInsert`, and `AuthorizationPolicyBuilder`'s output - which is where all three wrong vocabularies were authored: a seed script and doc examples both write rows. It is NOT checked inside a `where` clause. `TWhere<T>` types every value as `any`, so `where: { variant: 'joindomain' }` compiles and returns zero rows in silence. A filter typo still fails the same quiet way a seed typo used to. Stated because "the column is typed now" reads like both paths are covered, and one is not.

| File | Package |
|------|---------|
| `packages/core-server/src/components/auth/models/entities/policy-definition.model.ts` | core-server |
| `packages/kernel/src/base/auth/authorize/builders/policy.builder.ts` | kernel |

## See also

- [Authorization API reference](/extensions/components/authorization/api) - `extraPolicyDefinitionColumns` and the `PolicyDefinition` column shape
