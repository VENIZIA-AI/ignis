---
title: PolicyDefinition Gets domain_type and domain_id (Release A - Both Forms Written)
description: The concatenated policy domain token becomes a typed column pair like subject and target; this release adds and backfills the columns while domain stays the read source.
packages: ['@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-08-31

## PolicyDefinition domain split - Release A

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Migration Required" />

**In one line.** `PolicyDefinition` gains `domain_type` and `domain_id`, every write fills them alongside `domain`, and `domain` remains the only column read, so enforcement does not change.

> [!IMPORTANT]
> This is the first of two releases. Release B switches the read source and drops `domain`. Ship A, deploy every consumer, verify, then ship B. Doing both at once breaks any instance that has not deployed yet.

## What changed

- **New columns.** `domain_type` and `domain_id` are nullable. A domain is stored as: `NULL` / `NULL` for any domain the subject belongs to (`ANY_MEMBER`), `'SYSTEM_WIDE'` / `NULL` for system-wide, and `'Merchant'` / `'<id>'` for one typed domain.
- **`AuthorizationPolicyBuilder`** writes `domainType` and `domainId` next to `domain`. An explicit `ANY_MEMBER` is normalised to null in the new columns only, so `domain` stays `'ANY_MEMBER'`. A backfill check that compares the columns by equality reports these rows; that is expected.
- **`policyDefinitionDomainShapeCheck()`** (from `@venizia/ignis`) returns the text of a CHECK predicate for the new columns. It rejects the literal `'ANY_MEMBER'` in `domain_type`, requires a null id for a missing or `SYSTEM_WIDE` type, and requires a non-null id for a typed domain.
- **`metadata` is typed.** It carries `TSubsetGrantMetadata` (`{ ops: string[] }`) instead of `unknown`, so a wrong shape is a compile error. To store your own shape, pass it as the second type parameter:

```typescript
type IMerchantPolicyMetadata = { ops: string[]; issuedBy: string };

extraPolicyDefinitionColumns<{ idType: 'string' }, IMerchantPolicyMetadata>({ idType: 'string' })
```

Keep `ops` in a custom shape if you also issue subset grants, because `customGrant` writes it.

## Who is affected

- **Anyone inserting rows built by `AuthorizationPolicyBuilder`.** `domainId` is typed `IdType` on the builder; narrow it at the insert site as you already do for `subjectId` and `targetId`.
- **Anyone reading `domain` directly.** No change in Release A. Move reads to the pair before Release B removes the column.
- **Applications sharing this table via `extraVariants`.** No change; the new columns are nullable and the CHECK allows all-null.
- **Anyone storing a non-`{ ops }` shape in `metadata`.** Supply your shape as the `Metadata` type parameter, or map another column with `entities.policyDefinition.metadata.columnName`.

## Migration

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
> The backfill splits on the first underscore, so it is wrong for any domain type whose name contains one (`Sale_Channel_42` becomes type `Sale`, id `Channel_42`). Check your distinct types before running it.

Verify before adding the constraint. Rows where `domain = 'ANY_MEMBER'` and `domain_type IS NULL` are expected; anything else is a real backfill miss.

```sql
SELECT domain, domain_type, domain_id, count(*)
FROM policy_definitions
WHERE domain IS DISTINCT FROM (
  CASE WHEN domain_type IS NULL THEN NULL
       WHEN domain_id IS NULL THEN domain_type
       ELSE domain_type || '_' || domain_id END)
GROUP BY 1, 2, 3;
```
