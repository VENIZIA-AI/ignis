---
title: The generated write bodies leave out deletedAt
description: "A model with a deletedAt column reports it as server-stamped, so the default create and update bodies of a generated CRUD controller no longer accept it."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-09

## The generated write bodies leave out deletedAt

<Badge type="warning" text="Breaking" />

**In one line.** The default `POST` and `PATCH` bodies of a generated CRUD controller no longer take `deletedAt`, so a client cannot soft-delete or restore a row by sending it.

## What changed

- **`deletedAt` is server-stamped.** `getServerStampedKeys()` of a relational entity now also returns `deletedAt` when the table has that column, the way it returns the audit columns that carry a default. The generated create and update bodies leave every reported key out.
- **It follows the column, not the repository.** Any entity whose table has a `deletedAt` column is affected, whether or not its repository is a `SoftDeletableRepository`.
- **Direct repository calls are unchanged.** `updateById`, `updateAll` and the rest still accept `deletedAt` in `data`.

## Who is affected

- **Apps that send `deletedAt` through a generated create or update route.** The key is no longer in the documented body. Delete and restore a row through `deleteById`, `deleteBy`, `restoreById` and `restoreBy`.
- **Apps that pass their own `request.body` for a route.** No change: a custom body replaces the default untouched.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/relational/core/models/base.ts` | connectors |
| `src/relational/core/models/common/constants.ts` | connectors |
