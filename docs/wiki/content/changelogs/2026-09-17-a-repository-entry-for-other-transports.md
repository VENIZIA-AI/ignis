---
title: A Repository Entry for Other Transports
description: "kernel/repository carries AbstractRepository, AbstractDataSource and the CRUD contract without the OpenAPI layer - 14.7 KB instead of 105 KB."
---

# Changelog - 2026-09-17

## `@venizia/ignis-kernel/repository`

<Badge type="tip" text="Feature" />

```ts
import { AbstractDataSource, AbstractRepository } from '@venizia/ignis-kernel/repository';
import type { TFilter, TWhere } from '@venizia/ignis-kernel/repository';
```

| Entry | Browser bundle |
|---|---|
| `base/repositories` through the root barrel | 105.3 KB gzipped |
| `@venizia/ignis-kernel/repository` | **14.7 KB gzipped** |

## Why it exists

A repository talks to a datasource. `AbstractDataSource` is engine-neutral - its only required
member is `configure()` - so **an HTTP request to another server is a datasource** in the same sense
Drizzle-over-Postgres is one: same role, different transport. Nothing in `AbstractRepository` binds
it to SQL; it is generic over plain objects and holds an `AbstractDataSource`.

Both halves already speak `@venizia/ignis-filter`, so a consumer on another transport shares
`where`/`order`/`limit`/`skip` rather than translating into its own vocabulary.

What stopped that was packaging, not design: `base/repositories` reaches `query-schemas` and a
`CountSchema`, so the OpenAPI layer came with the contract.

## What moved

`CountSchema` left `common/types/results.ts` for `common/types/result-schemas.ts`, and `TCount` is
now written out as `{ count: number }` rather than inferred from it. `z.object()` runs at module
load, so inferring the **type** from the schema put zod on every path that needed the type.

Both files are re-exported from the same barrel. No import path changes.

## What it carries

`AbstractRepository`, `AbstractDataSource`, `IDataSource`, the CRUD contract interfaces
(`IRepository`, `IReadableRepository`, `ICreatableRepository`, `IUpdatableRepository`,
`IDeletableRepository`, `IPersistableRepository`, `ICrudRepository`), `buildDataRange`, `TCount`,
`TDataRange`, `TDataWithRange`, and the filter vocabulary.

Listed export by export, like `./metadata`: a sub-path is a surface someone decided on, not whatever
a directory grows into. A guard test fails over 120 KB or on zod reaching it.

## Who is affected

**Nobody, at the API.** A new entry point; the root barrel is unchanged.

**Files:**

- [`packages/kernel/src/repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/repository.ts)
- [`packages/kernel/src/base/repositories/common/types/result-schemas.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/common/types/result-schemas.ts)
