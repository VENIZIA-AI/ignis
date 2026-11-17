---
title: The migration ledger takes a schema and a table
description: "RelationalMigrationRunner replaces ledgerTable with ledger: { schema, table }. On Postgres the schema is created when it is missing; SQLite accepts only main."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-08

## The migration ledger takes a schema and a table

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `RelationalMigrationRunner` places its ledger with `ledger: { schema?, table? }`, and the old `ledgerTable` option is gone.

## What changed

- **`ledger` replaces `ledgerTable`.** Both fields are optional. The defaults are the table `ignis_migrations` in the engine's default schema, so a runner built without options writes the same SQL as before.
- **Both names are checked and quoted.** The same character check that guards a migration name runs on `schema` and `table`, and the SQL is written `"schema"."table"`.
- **Postgres creates the schema when it is missing.** When `schema` is set, the runner looks it up first and runs `CREATE SCHEMA` only if it is absent, in the same transaction as the ledger table. The first boot does not fail on a missing schema, and a role without the `CREATE` privilege on the database works with a schema that already exists.
- **SQLite accepts only `main`.** Any other `schema` throws at construction, naming the problem, and is never ignored.
- **A driver says which engine it speaks.** `IRelationalDriver` has an optional `dialect` (`'postgres'` or `'sqlite'`). The four built-in drivers declare it. A hand-made driver that does not can still set `table`, but a `schema` is refused because the runner cannot tell whether the engine has schemas.
- **The ledger table is created in its own transaction.** Before, `CREATE TABLE IF NOT EXISTS` ran outside any transaction. A migration and its ledger row still commit together.

## Who is affected

- **Code that passes `ledgerTable`.** The runner throws at construction and points to `ledger`. Rename the option.
- **Code that builds a runner with no options.** No action needed: same table, same schema.
- **Authors of a custom `IRelationalDriver`.** No action needed. Add `dialect` only if you want to set `ledger.schema`.

## Breaking changes

> [!WARNING]
> `ledgerTable` is removed, with no alias. A runner that still passes it throws when it is constructed.

**Before:**

```typescript
const runner = new RelationalMigrationRunner({
  driver,
  ledgerTable: 'ignis_browser_migrations',
});
await runner.run({ migrations: MIGRATIONS });
```

**After:**

```typescript
const runner = new RelationalMigrationRunner({
  driver,
  ledger: { schema: 'public', table: 'ignis_browser_migrations' },
});
await runner.run({ migrations: MIGRATIONS });
```

## Details

- The ledger stays a one-column table keyed on the migration name, with no content hash.
- On a first boot the runner opens one small transaction for the schema and the table, then one transaction per migration with its ledger row.
- The lookup exists because `CREATE SCHEMA IF NOT EXISTS` checks the `CREATE` privilege on the database before it checks for the schema, so it fails for a restricted role even on `public`. A restricted role still needs the privilege, or an existing schema, when the schema is really missing.

| File | Package |
|------|---------|
| `src/relational/core/migrations/runner.ts` | connectors |
| `src/relational/core/drivers/driver.ts` | connectors |
| `src/relational/postgres/drivers/*.ts` | connectors |
| `src/relational/sqlite/drivers/libsql.ts` | connectors |
