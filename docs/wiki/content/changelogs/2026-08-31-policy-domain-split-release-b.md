---
title: PolicyDefinition Reads the Domain Pair and the domain Column Is Gone (Release B)
description: The adapter now builds the casbin domain token in SQL from domain_type and domain_id, the builder no longer writes the concatenated column, and domain is dropped.
---

# Changelog - 2026-08-31

## PolicyDefinition domain split - Release B

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Migration Required" />

**In one line.** `domain_type` + `domain_id` are now the only stored form; the concatenated token survives only as the casbin wire format, built in SQL.

> [!WARNING]
> **Ship Release A first, deploy every consumer, verify the backfill, then ship this.** Release B removes the column Release A was still reading.

## What changed

- **`ScopedCasbinAdapter` builds the token in SQL.** One expression, `domainTokenSelection`, used by every SELECT so they cannot drift.
- **`AuthorizationPolicyBuilder` no longer emits `domain`.** `grant`, `customGrant` and `assignRole` write only `domainType` / `domainId`; `serializeDomain` is gone.
- **`extraPolicyDefinitionColumns` no longer declares `domain`.**

Nothing downstream of the query changed: the row still carries `domain` as a `<Type>_<id>` token, because that is what the matcher compares. Only where it comes from changed.

## Migration

```sql
ALTER TABLE policy_definitions DROP COLUMN domain;
```

Run it **after** every consumer is on this release. Until then the old code still selects the column.

> [!CAUTION]
> **Do not verify a backfill with a `SELECT` that follows the `UPDATE`.** On any infrastructure with a pooler or a read replica, the read can land on a node that has not caught up and report zero rows changed while the write succeeded - a migration marked failed over correct data. Count from the write itself with `RETURNING`.
>
> This is not hypothetical: it happened to a consumer running exactly this backfill. With a `DROP COLUMN` in the same migration, a self-check that lies is considerably worse than one that merely fails.

## Who is affected

- **Anyone reading the `domain` column directly.** Read `domain_type` / `domain_id`, or build the token the way the adapter does.
- **Anyone inserting rows built by `AuthorizationPolicyBuilder`.** The `domain` field is gone from the row; `domainType` / `domainId` were already there from Release A.
- **Anyone who has not run the Release A backfill.** Do not deploy this - the pair is the only source now.

## Details

- The alias inside `domainTokenSelection` is emitted **raw**, not through `sql.identifier`. A quoted alias preserves case while the unquoted `FROM` alias folds to lower case, so the reference does not resolve - `missing FROM-clause entry for table "policyDefinition"`. The same reason `softDeleteClause` already emitted its alias raw.
- That bug shipped in the first draft of this change and **every existing adapter test still passed**, because they stub `execute` and return row literals. It was caught by `scoped-adapter-domain-sql-e2e.test.ts`, which runs the adapter's own statements against a real Postgres.
- `null` is still `ANY_MEMBER`: the CASE yields NULL for a null `domain_type`, and `buildGrantLines` defaults it exactly as it did for a null `domain`.

| File | Package |
|------|---------|
| `src/base/auth/authorize/builders/policy.builder.ts` | kernel |
| `src/components/auth/authorize/adapters/scoped-casbin.adapter.ts` | core-server |
| `src/components/auth/models/entities/policy-definition.model.ts` | core-server |
