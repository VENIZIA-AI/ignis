---
title: PGliteCRUDRepository, a repository on PGlite without all five generics
description: "@venizia/ignis-connectors/postgres/pglite exports PGliteCRUDRepository, DefaultCRUDRepository with the datasource typed as PGlite, so new Repo(pgliteDataSource) type-checks and getClient() is a PGlite."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-06

## PGliteCRUDRepository, a repository on PGlite without all five generics

<Badge type="tip" text="New Feature" />

**In one line.** `class NoteRepository extends PGliteCRUDRepository<typeof noteTable> {}` accepts a PGlite datasource in `new NoteRepository(dataSource)`. `DefaultCRUDRepository<typeof noteTable>` refuses one with `TS2345`, because its last generic defaults to the `pg.Pool` datasource, so a PGlite repository had to spell out all five generics.

## What changed

- **A new export.** `PGliteCRUDRepository` and the type `TPGliteDataSource` come from `@venizia/ignis-connectors/postgres/pglite`, the entry that already depends on PGlite. The value is `DefaultCRUDRepository` at runtime, so `@repository({ model, dataSource })`, dependency injection and every method work unchanged.
- **The datasource is typed as PGlite.** `this.dataSource.getClient()` is a `PGlite`. A `pg.Pool` datasource, a datasource of another engine and a value that is not a datasource are type errors.
- **The `pg.Pool` default is untouched.** `DefaultCRUDRepository<typeof table>` still types `getClient()` as `Pool`, and still refuses a PGlite datasource.
- **The type has the same name.** `PGliteCRUDRepository<typeof table>` also works as a type for a variable or a parameter.

```typescript
import { PGliteCRUDRepository } from '@venizia/ignis-connectors/postgres/pglite';

@repository({ model: Note, dataSource: PGliteDataSource })
export class NoteRepository extends PGliteCRUDRepository<typeof noteTable> {}
```

## Who is affected

- **Apps with a repository on PGlite that wrote all five generics.** They can switch to `PGliteCRUDRepository`.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/relational/postgres/repositories/core/pglite.ts` | connectors |
| `src/relational/postgres/drivers/pglite.ts` | connectors |
