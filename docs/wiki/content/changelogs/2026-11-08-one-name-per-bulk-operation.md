---
title: One name per bulk operation - updateAll, deleteAll and restoreAll are removed
description: "updateBy, deleteBy and restoreBy are the only bulk methods, and their where is required; the whole table is where: {} with options.force."
packages: ['@venizia/ignis', '@venizia/ignis-kernel', '@venizia/ignis-connectors']
---

# Changelog - 2026-11-08

## One name per bulk operation - updateAll, deleteAll and restoreAll are removed

<Badge type="warning" text="Breaking" />

**In one line.** A bulk write is `updateBy`, `deleteBy` or `restoreBy`. The `All` twins are gone, with no alias, and `where` is required in the type.

## What was removed

- `updateAll` and `deleteAll` on `AbstractRepository`, on `IUpdatableRepository` and `IDeletableRepository`, and on the relational, search and HTTP repositories (`DefaultCRUDRepository`, `SoftDeletableRepository`, `DefaultSearchRepository`, `HttpRepository` and their read-only bases).
- `restoreAll` on `SoftDeletableRepository` (and the SQLite one).
- The old `updateBy` and `deleteBy`, which only forwarded to those methods. Their bodies are now the methods: `updateBy`, `deleteBy` and `restoreBy` do the work.

## What changed

- **`where` is required** on `updateBy`, `deleteBy` and `restoreBy`. Before, `deleteAll` and `restoreAll` took an optional one.
- **The whole table is `where: {}` with `options.force: true`.** The empty-where check is the same one as before: without `force` an empty effective condition is refused. On a search repository `where: {}` plus `force` truncates the collection, as `deleteAll({ options: { force: true } })` did.
- **The 400 of an update that carries `deletedAt` names the new methods:** "deletedAt changes only through deleteById/deleteBy and restoreById/restoreBy".
- **Not renamed:** `updateById`, `deleteById`, `restoreById`, `updateEach`, `createAll`, and the search connector's own `document.deleteAll({ collection })`.

## Before and after

```typescript
// Before
await repo.updateAll({ where: { status: 'OPEN' }, data: { status: 'DONE' } });
await repo.deleteAll({ options: { force: true } });
await repo.restoreAll({ where: { id: { gt: 10 } } });

// After
await repo.updateBy({ where: { status: 'OPEN' }, data: { status: 'DONE' } });
await repo.deleteBy({ where: {}, options: { force: true } });
await repo.restoreBy({ where: { id: { gt: 10 } } });
```

## Who is affected

- **Every call to `updateAll`, `deleteAll` or `restoreAll`.** Rename it, and give `where` to a `deleteAll()` or `restoreAll()` that had none: `where: {}` with `options: { force: true }` for the whole table.
- **A repository class that overrides or implements them** (a custom `IUpdatableRepository`, a subclass of `AbstractRepository`): implement `updateBy` and `deleteBy` instead. A subclass that only overrode the `By` alias now overrides the real method.
- **A subclass that overrode `updateAll` or `deleteAll` without the `override` keyword** now compiles, and its override never runs: nothing calls those names any more. The second `rg` finds them.
- **Code that wraps or mocks the repository** in tests.
- **Everyone else.** No action needed.

Find the call sites:

```bash
rg -n '\.(updateAll|deleteAll|restoreAll)\s*(<|\()' --glob '*.{ts,tsx,js,mjs,cjs}' --glob '!node_modules'
rg -n '\b(updateAll|restoreAll|deleteAll)\b' --glob '*.{ts,tsx,js,mjs,cjs}' --glob '!node_modules'   # overrides and mocks; document.deleteAll is the search connector and stays
```

The typecheck finds the rest: "Property 'updateAll' does not exist", or "Property 'where' is missing".

## Details

| File | Package |
|------|---------|
| `src/base/repositories/core/abstract.ts`, `src/base/repositories/common/types/contracts.ts` | kernel |
| `src/relational/core/repositories/core/{base,persistable,readable,soft-deletable}.ts` | connectors |
| `src/search/core/repositories/core/{persistable,readable}.ts`, `src/http/repository.ts` | connectors |
| `src/components/static-asset/controller/{factory,meta-link}.ts` | core-server |
