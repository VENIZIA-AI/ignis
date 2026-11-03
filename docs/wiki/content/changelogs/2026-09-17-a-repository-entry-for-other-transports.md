---
title: A Repository Entry for Other Transports
description: "@venizia/ignis-kernel/repository carries AbstractRepository, AbstractDataSource and the CRUD contract without the OpenAPI layer - 14.7 KB gzipped instead of 105 KB."
packages: ['@venizia/ignis-filter', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-17

## `@venizia/ignis-kernel/repository`

<Badge type="tip" text="Feature" />

**In one line.** A new entry point gives you the repository and datasource contract for a non-SQL transport (an HTTP request to another server, say) at 14.7 KB gzipped instead of 105.3 KB.

```ts
import { AbstractDataSource, AbstractRepository } from '@venizia/ignis-kernel/repository';
import type { TFilter, TWhere } from '@venizia/ignis-kernel/repository';
```

## What changed

- **What it carries.** `AbstractRepository`, `AbstractDataSource`, `IDataSource`, the CRUD contract interfaces (`IRepository`, `IReadableRepository`, `ICreatableRepository`, `IUpdatableRepository`, `IDeletableRepository`, `IPersistableRepository`, `ICrudRepository`), `buildDataRange`, `TCount`, `TDataRange`, `TDataWithRange`, the filter vocabulary, and `AbstractEntity`.
- **Same filter vocabulary.** A consumer on another transport shares `where`/`order`/`limit`/`skip` through `@venizia/ignis-filter`.
- **`CountSchema` moved, `TCount` is explicit.** `CountSchema` left `common/types/results.ts` for `common/types/result-schemas.ts`, and `TCount` is written out as `{ count: number }`. Both files are re-exported from the same barrel, so no import path changes.

## Who is affected

- **Nobody, at the API.** A new entry point; the root barrel is unchanged.

## Details

What a consumer has to write:

- `AbstractRepository` demands twelve abstract members. For a read-only resource, implement `IReadableRepository` instead (five members).
- `find` is an overload with a range variant; declare both signatures.
- `IRepository` names `dataSource`, `entity` and `getEntity`.
- `AbstractDataSource` declares `name`, `settings` and `schema` as fields with no constructor that sets them. A subclass assigns them itself.

```ts
class HttpDataSource extends AbstractDataSource<{ baseUrl: string }> {
  override name = 'http';
  override settings: { baseUrl: string };
  override schema = {} as never;

  constructor(opts: { baseUrl: string }) {
    super({ scope: HttpDataSource.name });
    this.settings = { baseUrl: opts.baseUrl };
  }

  async configure(): Promise<void> {}
}
```
