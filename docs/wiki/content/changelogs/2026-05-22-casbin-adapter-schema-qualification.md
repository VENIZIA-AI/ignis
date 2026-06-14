---
title: Drizzle Casbin Adapter - Schema-Qualified Tables
description: The Casbin policy adapter now qualifies its tables with a configurable schema name (default "public") instead of relying on the Postgres search_path
---

# Changelog - 2026-05-22

## Schema-Qualified Casbin Tables

`DrizzleCasbinAdapter` now schema-qualifies every table it reads (`schema.table`) instead of emitting a bare table name that resolved through the Postgres `search_path`. Each entity accepts an optional `schemaName`, defaulting to `public`, so deployments that keep their Casbin tables in a dedicated schema can point the adapter at it explicitly.

## Overview

- **Per-entity `schemaName`**: every entity (`permission`, `role`, `policyDefinition`) accepts an optional `schemaName`, so the three tables may live in three different schemas; each defaults to `public`
- **Qualified SQL**: every `FROM`/`JOIN` is now `"<schema>"."<table>"`, escaped via `sql.identifier`
- **Centralized resolution**: a private `schemaOf()` helper applies the default at query-build time - no input mutation, no non-null assertions

## Breaking Changes

> [!WARNING]
> This is a behavioral change for deployments that relied on the `search_path` to resolve Casbin tables in a **non-`public`** schema.

Previously the adapter emitted `FROM "policy_definitions"` and let Postgres resolve it through the connection's `search_path`. It now emits `FROM "public"."policy_definitions"`. If your Casbin tables live in a schema other than `public`, those queries will now fail to resolve the relation until you pass an explicit `schemaName`.

**Before:**
```typescript
new DrizzleCasbinAdapter({
  dataSource,
  entities: {
    permission: { tableName: 'permissions', principalType: 'Permission' },
    role: { tableName: 'roles', principalType: 'Role' },
    policyDefinition: { tableName: 'policy_definitions', principalType: 'PolicyDefinition' },
  },
});
// Emits: FROM "policy_definitions" (resolved via search_path)
```

**After (tables in a custom schema):**
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

Deployments whose tables already live in `public` need no change - the default reproduces the previous behavior.

> [!NOTE]
> All three entities accept `schemaName`, so each table can live in a different schema. The current queries only read `policy_definitions` and `permissions` in a `FROM`/`JOIN`, so `role.schemaName` is accepted as configuration but does not yet affect emitted SQL (the `role` table is referenced only by its `principalType`).

## New Features

### Configurable schema per entity

**File:** `packages/core/src/components/auth/authorize/adapters/drizzle-casbin.ts`

**Problem:** The adapter assumed the Casbin tables were reachable via the `search_path`. Apps that isolate auth tables in a dedicated schema had no way to tell the adapter where to look.

**Solution:** `IDrizzleCasbinEntities` exposes an optional `schemaName` on the queried entities. Resolution is centralized in a single helper so the default lives in exactly one place and the public type stays honestly optional:

```typescript
private static readonly DEFAULT_SCHEMA = 'public';

/** Resolve an entity's schema, defaulting to `public`. */
private schemaOf(entity: { schemaName?: string }): string {
  return entity.schemaName ?? DrizzleCasbinAdapter.DEFAULT_SCHEMA;
}
```

Query sites consume it directly, keeping identifiers escaped:

```typescript
FROM ${sql.identifier(this.schemaOf(pd))}.${sql.identifier(pd.tableName)} pd
INNER JOIN ${sql.identifier(this.schemaOf(perm))}.${sql.identifier(perm.tableName)} p
  ON pd.target_id = p.id
```

**Benefits:**
- Works with Casbin tables in any schema, not just `public`
- No mutation of the caller-supplied `entities` object
- No `schemaName!` non-null assertions scattered across the query builders
- Schema and table identifiers remain escaped via `sql.identifier` (no injection surface)

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/auth/authorize/adapters/drizzle-casbin.ts` | Added optional `schemaName` to every entity (`permission`, `role`, `policyDefinition`); introduced `DEFAULT_SCHEMA` + `schemaOf()`; schema-qualified all `FROM`/`JOIN` clauses |
| `src/__tests__/authorize/drizzle-casbin-adapter.test.ts` | New test: default-to-`public`, explicit `schemaName`, group-policy qualification, no caller mutation |

## Migration Guide

> [!NOTE]
> Only required if your Casbin tables are **not** in the `public` schema.

### Step 1: Set `schemaName` on the queried entities

```typescript
entities: {
  permission: { schemaName: 'auth', tableName: 'permissions', principalType: 'Permission' },
  role: { schemaName: 'auth', tableName: 'roles', principalType: 'Role' },
  policyDefinition: {
    schemaName: 'auth',
    tableName: 'policy_definitions',
    principalType: 'PolicyDefinition',
  },
}
```

No change is needed for tables already in `public`.
