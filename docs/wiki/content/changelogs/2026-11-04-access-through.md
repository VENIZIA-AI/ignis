---
title: A model can be scoped through its parent with access.through
description: "A child model with only a foreign key inherits its parent's row scope, for reads and writes. The access settings type is now a union."
packages: ['@venizia/ignis-kernel', '@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-04

## A model can be scoped through its parent with access.through

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `settings.access: { through: ScopeThrough.of({ entity, relation }) }` scopes a child model by its parent's own `access`, so a child with only a foreign key needs no copied tenant column. A create or a move must name a parent the caller may reach; update and delete select only the rows the parent's scope allows.

## What changed

- **`ScopeThrough.of({ entity, relation })`.** It returns the value of `access.through` and checks `relation` against the entity: a misspelled name, a to-many relation or a name held in a plain `string` does not compile. `ScopeThrough` is a class with a private constructor, so a hand-written `{ relation: 'x' }` does not compile either. It is exported by `@venizia/ignis-kernel` and `@venizia/ignis`, with the `TOneRelationNameOf` type.
- **How a read is scoped.** The child keeps the rows whose foreign key is in the set the parent's own scope allows, built with the `inSql` operator. The parent's `resolve` receives the same `operation`. `UNRESTRICTED` and `null` come from the parent: a parent that resolves no scope denies the child, and a `through` model has no `onMissing`. Several hops chain, up to 5. A row with a null foreign key is invisible under a restricting scope, and visible under `UNRESTRICTED`.
- **Checks at boot.** The relation exists and is a `one` with a single-column key, the parent has an `access`, there is no cycle and no chain longer than 5, and the model declares no `onMissing`, `columns` or `write`. A foreign key with no index is a warning.
- **Writes name a parent the caller may reach.** One query checks the parent keys of a create, or of an update that changes the foreign key, against the parent's scope for the write's `operation`. A missing parent, a parent outside the scope, a null key and an absent key give the same 403, so a foreign parent's existence does not leak. The check and the write share one transaction (the caller's, or one the repository opens); on Postgres the parents are read `FOR SHARE`. `IRelationalQueryExecutor` has a new `supportsRowLock` flag: `true` for Postgres, `false` for SQLite.
- **`ScopeThrough.of({ entity, relation })`.** It returns the value of `access.through` and checks `relation` against the entity: a misspelled name, a to-many relation or a name held in a plain `string` does not compile. A hand-written `{ relation: 'x' }` does not compile either, because the value carries a brand (`ScopeThroughBrand`).
- **How a read is scoped.** The child keeps the rows whose foreign key is in the set the parent's own scope allows, built with the `inSql` operator. The parent's `resolve` receives the same `operation`. `UNRESTRICTED` and `null` come from the parent. Several hops chain, up to 5.
- **Checks at boot.** The relation exists and is a `one` with a single-column key, the parent has an `access`, there is no cycle and no chain longer than 5. A foreign key with no index is a warning.
- **Writes are refused.** Create, update, delete, soft delete and restore on a `through` model throw a 403 that names `access.through`, even when the parent is `UNRESTRICTED`.
- **`TModelAccessSettings`** is a resolver (`IModelAccessSettings`) or a through (`IModelAccessThroughSettings`), never both. `columns` and `write` stay with the resolver.

## Who is affected

- **Models with `resolve`.** No action needed.
- **Code that reads `settings.access` from model metadata and calls `.resolve` on it.** See Breaking changes.
- **Apps that copy a tenant column onto child tables to scope them.** They can drop the copy and the service check; the guide shows the measured cost of each.
- **Code that implements `IRelationalQueryExecutor`.** Add `readonly supportsRowLock: boolean`.

## Breaking changes

> [!WARNING]
> `IModelSettings.access` and `getAccessSettings()` are `TModelAccessSettings` now, a union. Code that takes `access` from the metadata and calls `access.resolve(...)` no longer compiles.

**Before:**

```typescript
const scope = metadata.settings.access.resolve({ operation: 'read' });
```

**After:**

```typescript
const { access } = metadata.settings;

if (access && !access.through) {
  const scope = access.resolve({ operation: 'read' });
}
```

A model's own `settings.access: { resolve }` is unchanged, and so is `IModelAccessSettings`.

## Details

The [model settings guide](/guides/core-concepts/persistent/model-settings#scope-a-child-through-its-parent) has the full example, the SQL, and the measured cost of `through` against a copied column.
