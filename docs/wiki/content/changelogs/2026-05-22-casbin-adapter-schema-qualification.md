---
title: Drizzle Casbin Adapter - Schema-Qualified Tables
description: The Casbin policy adapter now qualifies its tables with a configurable schema name (default "public") instead of relying on the Postgres search_path
---

# Changelog - 2026-05-22

## Schema-Qualified Casbin Tables

<Badge type="warning" text="Breaking Change" />

**In one line.** `DrizzleCasbinAdapter` now targets a specific Postgres schema for its tables instead of relying on the connection's `search_path`.

## What changed

- **Per-entity `schemaName`.** Every entity (`permission`, `role`, `policyDefinition`) accepts an optional `schemaName`, so the three tables may live in three different schemas; each defaults to `public`.
- **Qualified SQL.** Every `FROM`/`JOIN` now reads `"<schema>"."<table>"`, escaped via `sql.identifier`, instead of a bare table name.
- **Centralized resolution.** A private `schemaOf()` helper applies the `public` default at query-build time - no mutation of the caller-supplied `entities` object, no non-null assertions.

## Who is affected

- **Casbin tables already in the `public` schema.** No action needed - the default reproduces the previous behavior.
- **Casbin tables in a non-`public` schema, relying on `search_path`.** Must act - queries will fail to resolve the relation until `schemaName` is set explicitly. See breaking changes below.

## Breaking changes

> [!WARNING]
> Only affects deployments whose Casbin tables live outside the `public` schema and relied on `search_path` to resolve them.

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
// Emits: FROM "policy_definitions"
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
// Emits: FROM "auth"."policy_definitions"
```

**Migration step:** add `schemaName` to every entity whose table is not in `public`. No change needed for tables already in `public`.

## Details

> [!NOTE]
> All three entities accept `schemaName`, so each table can live in a different schema. The current queries only read `policy_definitions` and `permissions` in a `FROM`/`JOIN`, so `role.schemaName` is accepted as configuration but does not yet affect emitted SQL.

| File | Package |
|------|---------|
| `src/components/auth/authorize/adapters/drizzle-casbin.ts` | core |
| `src/__tests__/authorize/drizzle-casbin-adapter.test.ts` | core |
