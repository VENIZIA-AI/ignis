---
title: PolicyDefinition Reads the Domain Pair and the domain Column Is Gone (Release B)
description: The authorization adapter now builds the casbin domain token from domain_type and domain_id, the policy builder no longer writes the domain column, and you drop that column.
packages: ['@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-08-31

## PolicyDefinition domain split - Release B

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Migration Required" />

**In one line.** `domain_type` and `domain_id` are now the only stored form of a policy's domain, and the `domain` column can be dropped.

> [!WARNING]
> Ship Release A first, deploy every consumer, verify the backfill, then ship this. Release B removes the column Release A was still reading.

## What changed

- **`ScopedCasbinAdapter`** builds the `<Type>_<id>` domain token from `domain_type` and `domain_id`. Enforcement is unchanged.
- **`AuthorizationPolicyBuilder`** no longer emits `domain`. `grant`, `customGrant` and `assignRole` write only `domainType` and `domainId`, and `serializeDomain` is removed.
- **`extraPolicyDefinitionColumns`** no longer declares `domain`.
- A null domain is still `ANY_MEMBER`.

## Who is affected

- **Anyone reading the `domain` column directly.** Read `domain_type` and `domain_id` instead.
- **Anyone inserting rows built by `AuthorizationPolicyBuilder`.** The `domain` field is gone from the row.
- **Anyone who has not run the Release A backfill.** Do not deploy this release; the pair is the only source now.

## Breaking changes

Run this after every consumer is on this release. Until then, old code still selects the column.

```sql
ALTER TABLE policy_definitions DROP COLUMN domain;
```

> [!CAUTION]
> Do not verify a backfill with a `SELECT` that follows the `UPDATE`. With a pooler or a read replica, the read can land on a node that has not caught up and report zero rows changed while the write succeeded. Count from the write itself with `RETURNING`.
