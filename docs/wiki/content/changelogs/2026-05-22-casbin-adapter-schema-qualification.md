---
title: Drizzle Casbin Adapter - Schema-Qualified Tables
description: The Casbin policy adapter now qualifies its tables with a configurable schema name (default "public") instead of relying on the Postgres search_path.
packages: ['@venizia/ignis']
---

# Changelog - 2026-05-22

## Schema-Qualified Casbin Tables

<Badge type="warning" text="Breaking Change" />

**In one line.** `DrizzleCasbinAdapter` now targets a specific Postgres schema for its tables instead of relying on the connection's `search_path`.

## What changed

- **Per-entity `schemaName`.** Each entity (`permission`, `role`, `policyDefinition`) accepts an optional `schemaName`, default `public`. The three tables can live in different schemas.
- **Qualified SQL.** Queries now read `"<schema>"."<table>"` instead of a bare table name.

## Who is affected

- **Casbin tables in the `public` schema.** No action needed.
- **Casbin tables in another schema that relied on `search_path`.** Queries fail to resolve the table until you set `schemaName`.

## Breaking changes

> [!WARNING]
> Only affects deployments whose Casbin tables live outside the `public` schema and relied on `search_path`.

**Before** (resolved via `search_path`):

```typescript
new DrizzleCasbinAdapter({
  dataSource,
  entities: {
    permission: { tableName: 'permissions', principalType: 'Permission' },
    role: { tableName: 'roles', principalType: 'Role' },
    policyDefinition: { tableName: 'policy_definitions', principalType: 'PolicyDefinition' },
  },
});
```

**After** (explicit schema):

```typescript
new DrizzleCasbinAdapter({
  dataSource,
  entities: {
    permission: { schemaName: 'auth', tableName: 'permissions', principalType: 'Permission' },
    role: { schemaName: 'auth', tableName: 'roles', principalType: 'Role' },
    policyDefinition: {
      schemaName: 'auth',
      tableName: 'policy_definitions',
      principalType: 'PolicyDefinition',
    },
  },
});
```

Migration step: add `schemaName` to every entity whose table is not in `public`.

## Details

- The queries only read `policy_definitions` and `permissions`, so `role.schemaName` is accepted but does not yet change the SQL.
