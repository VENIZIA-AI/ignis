---
title: PolicyDefinition Gets domain_type and domain_id (Release A - Both Forms Written)
description: The concatenated domain token becomes a typed column pair, matching what subject and target already do. Release A adds and backfills the columns while domain stays the read source.
---

# Changelog - 2026-08-31

## PolicyDefinition domain split - Release A

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Migration Required" />

**In one line.** `PolicyDefinition` gains `domain_type` + `domain_id`, every write fills them alongside `domain`, and `domain` remains the only column read - so this release changes nothing about enforcement.

> [!IMPORTANT]
> This is the first of two releases. **Release B** switches the read source and **drops `domain`**. Ship A, deploy every consumer, verify, then ship B. Doing both at once breaks any instance that has not deployed yet.

## Why the column existed in the other shape

The table already stores two typed references as **column pairs**:

```
subject_type + subject_id
target_type  + target_id
domain       = 'Merchant_<id>'     <- the odd one out
```

And the split form is not new to `domain` either - it is what the domain-closure CTE already joins on:

```sql
JOIN domain_closure ON policyDefinition.subject_type = domain_closure.dom_type
                   AND policyDefinition.subject_id  = domain_closure.dom_id
```

So one concept was stored two ways in one table: `join_domain` and `domain_inherits` rows keep the domain as a **typed pair**, while `grant` and `assign_role` rows keep it as a **concatenated token**. The two must agree character for character or the closure misses, and nothing but a string convention in two separate files guaranteed that.

The missing index is real too - no index touches `domain` - but it is the smaller reason.

## The three domain states, and how each is stored now

| State | `domain_type` | `domain_id` |
|---|---|---|
| Any domain the subject belongs to | `NULL` | `NULL` |
| System-wide (bypasses membership) | `'SYSTEM_WIDE'` | `NULL` |
| One typed domain | `'Merchant'` | `'<id>'` |

> [!WARNING]
> **`NULL` *is* `ANY_MEMBER`, not "unknown".** The adapter has always defaulted a null domain to `ANY_MEMBER`, and that stays true. Writing the literal `'ANY_MEMBER'` into `domain_type` is refused by the CHECK below - one state reachable two ways is exactly the ambiguity this split removes.

## The one place the two columns deliberately disagree

`AuthorizationPolicyBuilder` normalises an explicit `ANY_MEMBER` to null in the **new** columns only:

```typescript
AuthorizationPolicyBuilder.grant({ ..., domain: AuthorizationDomainScopes.ANY_MEMBER })
// domain:     'ANY_MEMBER'   <- unchanged, still the read source
// domainType: null           <- normalised
// domainId:   null
```

**A backfill check comparing the two columns by equality will report these rows.** That is not drift - do not "fix" it.

## Migration

Release A needs three statements. `policyDefinitionDomainShapeCheck()` returns the predicate text, so the constraint cannot drift from the framework's own scope constants.

```sql
ALTER TABLE policy_definitions
  ADD COLUMN domain_type text,
  ADD COLUMN domain_id   text;   -- or integer, matching your subject_id/target_id

UPDATE policy_definitions
SET domain_type = CASE
      WHEN domain IS NULL                     THEN NULL
      WHEN domain = 'ANY_MEMBER'              THEN NULL
      WHEN domain = 'SYSTEM_WIDE'             THEN 'SYSTEM_WIDE'
      ELSE split_part(domain, '_', 1)
    END,
    domain_id = CASE
      WHEN domain IS NULL                              THEN NULL
      WHEN domain IN ('ANY_MEMBER', 'SYSTEM_WIDE')     THEN NULL
      ELSE substring(domain FROM position('_' IN domain) + 1)
    END;

ALTER TABLE policy_definitions
  ADD CONSTRAINT policy_definition_domain_shape
  CHECK ( <policyDefinitionDomainShapeCheck()> );
```

> [!WARNING]
> **The backfill splits on the FIRST underscore, so it is wrong for any domain type whose own name contains one** (`Sale_Channel_42` would backfill as type `Sale`, id `Channel_42`). Check your distinct types before running it. That ambiguity is unfixable in the concatenated form and is a reason the split is worth doing, not a flaw in the migration.

Verify before adding the constraint:

```sql
SELECT domain, domain_type, domain_id, count(*)
FROM policy_definitions
WHERE domain IS DISTINCT FROM (
  CASE WHEN domain_type IS NULL THEN NULL
       WHEN domain_id IS NULL THEN domain_type
       ELSE domain_type || '_' || domain_id END)
GROUP BY 1, 2, 3;
```

Rows where `domain = 'ANY_MEMBER'` and `domain_type IS NULL` are the expected divergence above. Anything else is a real backfill miss.

## The CHECK is two-way, and one clause looks redundant but is not

```typescript
import { policyDefinitionDomainShapeCheck } from '@venizia/ignis';
```

Half a constraint admits half the broken rows, so both directions are enforced: an absent or sentinel type **requires** a null id, and a typed domain **requires** a non-null one.

The last branch carries an `IS NOT NULL` guard that appears redundant beside its `NOT IN`:

```sql
OR (
  domain_type IS NOT NULL
  AND domain_type NOT IN ('ANY_MEMBER', 'SYSTEM_WIDE')
  AND domain_id IS NOT NULL
)
```

Remove it and **a row with an id but no type passes**. A NULL `domain_type` makes `NOT IN` evaluate to NULL rather than false, and a CHECK rejects only on FALSE. The first draft of this predicate had that hole; it was found by running it against a real Postgres, not by reading it.

## Who is affected

- **Anyone inserting rows built by `AuthorizationPolicyBuilder`.** The row now carries `domainType` and `domainId`. Like `subjectId`/`targetId`, `domainId` is typed `IdType` on the builder and narrowed by your column - **narrow it at the insert site** the same way you already narrow the other two.
- **Anyone reading `domain` directly.** Unchanged in Release A. Release B removes the column; move reads to the pair before then.
- **Applications sharing this table via `extraVariants`.** Nothing changes - the new columns are nullable and the CHECK admits all-null.
- **Anyone writing a non-`{ ops }` shape into `metadata`.** It was `unknown` and is now typed - supply your shape as the `Metadata` type parameter, or map a different column via `entities.policyDefinition.metadata.columnName`.

## `metadata` is typed now, and extensible

`metadata` was `jsonb('metadata')` with no `$type<>()`, so it read back as `unknown` - every consumer
narrowed it by hand, and a wrong shape on the way in compiled fine.

It now carries `TSubsetGrantMetadata` (`{ ops: string[] }`), the shape IGNIS itself writes with
`customGrant` and reads back with `parseCustomGrantMetadata`:

```typescript
await repository.create({ data: { ..., metadata: { notOps: 1 } } });   // now a compile error
```

**A fixed shape would have been the wrong trade**, so it is a type parameter, defaulted:

```typescript
// default - nothing to write
extraPolicyDefinitionColumns({ idType: 'string' })

// an application storing its own metadata on this column
type IMerchantPolicyMetadata = { ops: string[]; issuedBy: string };

extraPolicyDefinitionColumns<{ idType: 'string' }, IMerchantPolicyMetadata>({ idType: 'string' })
```

`Metadata` is a **type parameter rather than a field on `opts`** because, unlike `extraVariants`,
there is no runtime value to infer a shape from. The cost: a caller who supplies it must spell
`Opts` too, since TypeScript has no partial type-argument inference. That cost falls only on callers
who opt in.

> [!TIP]
> Keep `ops` in a custom shape if the application also issues subset grants - `customGrant` writes it.
> An incompatible shape then surfaces as a type error at the insert site instead of a null at read time.

## Details

- `AuthorizationPolicyBuilder.splitDomain` is the counterpart to `serializeDomain`; the three domain-carrying emitters (`grant`, `customGrant`, `assignRole`) call both. `joinDomain`, `roleInherits` and `domainInherits` never carried a `domain` - they already used typed pairs.
- The CHECK helper returns **text**, not a Drizzle `SQL` object: a column reference inside a `sql` template renders schema-qualified (`"table"."column"`), which is not valid inside a table-level CHECK.
- No enforcement path changed. The adapter still reads `domain`, and `ScopedCasbinAdapter`'s whitelist rule (`variant = <known value>`, never `NOT IN`) is untouched.

| File | Package |
|------|---------|
| `src/base/auth/authorize/builders/policy.builder.ts` | kernel |
| `src/components/auth/models/entities/policy-definition.model.ts` | core-server |
