---
type: Playbook
title: Debugging
description: Priority order for tracking down IGNIS runtime and build problems.
resource: packages/inversion/src
tags: [process, debugging]
---

## Steps

1. Check the DI container first. Most "it doesn't work" issues are a missing or wrong binding.
   Confirm the class is actually bound (`container.isBound({ key })`), that the key matches the
   namespace convention (`controllers.X`, `services.X`, `repositories.X`, `datasources.X`,
   `components.X`), and that every constructor parameter of the class carries `@inject` - a class
   with even one undecorated parameter is refused at boot with an explicit error naming the class
   and parameter index (see [DI container](/architecture/di-container.md)), so this fails loudly,
   not silently, when it fails at all.
2. Check decorator metadata next. A wrong `@inject` key resolves to the wrong binding (or
   `undefined` if `isOptional` was set, hiding the problem further). Missing `@model({ settings:
   {...} })` settings (e.g. `hiddenProperties`) show up as fields that leak in responses or fail to
   validate, because the repository layer reads model settings at query-build time, not at
   response-serialization time. Also verify `experimentalDecorators` and `emitDecoratorMetadata`
   are actually active for the file in question - a `tsconfig` `extends` chain the runtime can't
   resolve is discarded WHOLE, flags included, and `@inject` silently records nothing.
3. Check artifact registration. If a controller/service/repository/datasource isn't being picked up,
   check the generated index first - a stale `src/generated/artifacts.ts` registers yesterday's
   classes and `check:artifacts` catches exactly that. Then check the class: it must be a named
   export, not `abstract`, and decorated with a stereotype imported directly from `@venizia/ignis` or
   `@venizia/ignis-kernel` - the generator logs a skip reason for each miss.
4. Check the transaction lifecycle for anything touching the database. Every transaction opened
   with `dataSource.beginTransaction()` must reach exactly one of `commit()` or `rollback()` -
   an uncommitted or unreleased connection leaks from the pool. Wrap the work in try/catch and
   call `rollback()` in the catch branch; do not assume a failed `commit()` left the connection in
   a clean state to just retry against.
5. Check filter/query operators last. Complex `where` clauses - nested `and`/`or`, JSON path
   operators, `inq`/`between` on typed columns - are the most common source of queries that parse
   but silently return the wrong rows. Log the resolved SQL (or the built filter object) at the
   repository boundary before assuming the bug is upstream of the query.
6. Cross-cutting gotcha, wherever `tsc` disagrees with what you just fixed: purge stale
   `.tsbuildinfo` files before trusting `tsc` output. `incremental: true` is set repo-wide
   (`packages/dev-configs/tsconfig/tsconfig.base.json`), and each package's `tsconfig.tsbuildinfo` /
   `tsconfig.build.tsbuildinfo` can replay diagnostics for errors that no longer exist (e.g. after
   changing a package's `exports` map) - `rm` the `.tsbuildinfo` files in the affected package
   before re-running `tsc --noEmit` if the reported errors don't match the current source.

## Related

- [DI container](/architecture/di-container.md)
- [Boot lifecycle](/architecture/boot-lifecycle.md)
- [Transactions](/architecture/transactions.md)
- [Build system](/process/build-system.md)
