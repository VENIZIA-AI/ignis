---
title: deletedAt changes only through the delete and restore calls
description: "A soft-deletable repository refuses an update or upsert that carries deletedAt, the generated write bodies leave it out, and a soft delete can write other columns in the same statement."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-08

## deletedAt changes only through the delete and restore calls

<Badge type="warning" text="Breaking" />

**In one line.** An update or upsert that carries `deletedAt` now fails with a 400 on a soft-deletable repository, and the generated create and update bodies no longer take it. Delete with `deleteById({ id, data })` and revive with `restoreById`.

## What changed

- **An ordinary write refuses `deletedAt`.** On `SoftDeletableRepository` and `SoftDeletableSqliteRepository`, `updateById`, `updateAll`, `updateBy`, `updateEach` and `upsert` fail with a 400 when `data` has `deletedAt`, under the property name or the column name, with any value including `null`. Nothing is written. `deleteById`, `deleteAll`, `deleteBy` and the restore methods are unchanged.
- **A soft delete can write other columns.** `deleteById`, `deleteAll` and `deleteBy` take an optional `data`. It is written in the same statement as `deletedAt`, for example `deleteById({ id, data: { status: 'ARCHIVED' } })`. The values in `data` and the row selection are checked against the `DELETE` scope, not the `UPDATE` one. `data` may not carry `deletedAt` or `id`, and it cannot be combined with `shouldHardDelete`. Restore takes no `data`.
- **The generated write bodies leave out `deletedAt`.** A relational entity reports `deletedAt` from `getServerStampedKeys()` whenever its table has that column, so the default `POST` and `PATCH` bodies of a generated CRUD controller do not take it. A client that still sends `deletedAt` is not refused: validation strips it and the request goes on. A route with its own `request.body` is unchanged. This follows the column, not the repository.
- **A refined or transformed entity schema now stops the controller from building.** The default body of an entity whose table has `deletedAt` must leave that key out, and zod cannot remove a key from a refined or transformed schema. Defining the controller throws "Cannot build the default … body | keys to leave out: deletedAt".
- **New repository methods:** validateUpdateData.

## Security

The extra `data` of a soft delete is checked against the `DELETE` scope only. A role that may delete but not update can therefore set the other columns of the rows it deletes. The scope columns stay guarded: a value outside the scope is still refused with a 403.

## Who is affected

- **Code that sets `deletedAt` through an update or upsert on a soft-deletable repository.** It now gets a 400. To delete a row and change other columns in one statement, call `deleteById({ id, data })` (or `deleteAll` / `deleteBy`). To revive a row, call `restoreById`, `restoreAll` or `restoreBy`.
- **Entities with a `deletedAt` column and a refined or transformed create or update schema, and no `routes.*.request.body`.** The application throws while the controller is built. Pass the route body: a body built from the schema with `deletedAt` omitted.
- **Clients that send `deletedAt` to a generated create or update route.** The key is no longer in the documented body.
- **A repository that does not soft delete.** Still accepts `deletedAt` in an update; only the generated bodies changed for it.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/relational/core/repositories/core/soft-deletable.ts` | connectors |
| `src/relational/core/repositories/core/persistable.ts` | connectors |
| `src/relational/core/models/base.ts` | connectors |
| `src/relational/core/models/common/constants.ts` | connectors |
