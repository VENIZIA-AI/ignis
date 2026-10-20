---
type: Convention
title: Narrow only what the framework owns
description: A closed union is a claim that no one else may extend the set - make it only where IGNIS owns the vocabulary, and prefer `unknown` over a type that pretends to know.
resource: packages/core-server/src/components/auth/models/entities/policy-definition.model.ts
tags: [conventions, type-safety, public-api]
---

Narrowing a type is not only a statement about which values are valid. It is a statement that
**no one else may add one**. Make that second claim only where IGNIS genuinely owns the vocabulary.

## The two questions, asked separately

Before narrowing any type that reaches an application:

1. **Does a wrong value fail silently today?** If yes, narrowing earns its cost.
2. **Does IGNIS own the whole set?** If no, narrowing is a claim it has no standing to make.

A yes to the first and a no to the second means the answer is an **extensible seam**, not a closed
union: a default that is today's closed set, plus a way for an application to declare its own.

```typescript
// The default accepts only IGNIS's seven variants; an application declares its own explicitly.
extraPolicyDefinitionColumns({ extraVariants: ['merchant_role'] });
```

Reject `TKnown | (string & {})` for this. It accepts every string, so it re-opens the exact bug class
the narrowing existed to close, while looking like a compromise.

## `unknown` beats a type that pretends to know

Where IGNIS cannot see the shape - an application's Drizzle schema, an arbitrary table handed to a
SQL builder - the honest declaration is `unknown`, and a runtime check with a `getError` that names
what arrived.

A type that guesses at the shape is worse than `unknown`, because it **looks** safe. `unknown` forces
the caller to confront the boundary; a wrong-but-plausible type lets them walk past it.

## Why this is a convention and not a preference

`kernel@0.2.0-6` narrowed `PolicyDefinition.variant` to IGNIS's seven edge kinds. The narrowing
answered question 1 correctly - three wrong vocabularies (`'p'`/`'g'`, `'group'`/`'policy'`) had
shipped in docs and a seed script, and each made the adapter select zero rows with nothing in any log.

It never asked question 2. A consuming application stored its own edge kind in the same table, a
documented pattern the adapter had always been safe to ignore, and the release broke its build. The
fix was not to abandon the narrowing but to add the seam - the type still rejects `'group'`.

## What narrowing a column also does

Tightening a type at the boundary rejects every loose type on the path that feeds it, and those
surface one layer at a time: a `Record<string, unknown>` accumulator, or a field restated as
`effect?: string` on four consecutive service methods. Each fix pushes the error out one layer, so a
migration looks like a cascade of new failures when it is one pre-existing chain becoming visible.
Say so in the changelog; otherwise the patch is blamed for the chain it revealed.
