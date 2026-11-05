---
title: Writes to a child scoped through its parent respect the parent's sharedRows
description: "A child model with access.through could be updated, deleted, created or moved under a shared parent although the parent refuses that write. The parent's write.sharedRows now holds at every hop."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-05

## Writes to a child scoped through its parent respect the parent's sharedRows

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A model scoped with `access.through` could be written under a shared parent (a parent row whose scope column is `null`) by a caller who is not allowed to write that parent. The parent's `write.sharedRows` now applies to the child's writes, at every hop.

## What changed

- **The hole.** A parent with `resolve` returning `{ or: [{ merchantId: { inq: ['m-1'] } }, { merchantId: null }] }` and `write: { sharedRows: false }` refuses a write to its shared rows. Its `through` children were not held to that: merchant `m-1` could update or delete the variants of a shared product, create a variant under it, or move a variant to it. The direct-write version of this was closed earlier; this is the same rule on the hop.
- **The fix.** For `CREATE`, `UPDATE` and `DELETE`, the parent's scope is narrowed the way a direct write to the parent is, with the parent's own `write` settings. Update and delete select only the children of parents the caller may write, and a create or a move must name such a parent. Reads are unchanged: the children of a shared parent stay readable.
- **Several hops.** Each hop narrows its own parent, so an `Option` through `Variant` through `Product` answers to `Product`'s `sharedRows`.
- **A scope the write guard cannot verify.** A parent scope of a shape the guard cannot read on a write (an `or` over several columns, a range) now refuses the child's write, as it refuses a direct write to the parent.

## Who is affected

- **Models with `access.through` whose parent reads shared rows (a `null` branch) and leaves `write.sharedRows` off.** Writes to the children of a shared parent are refused now.
- **The same models with `write.sharedRows: true` on the parent.** No action needed.
- **Models with `resolve`, and `through` models whose parent has no `null` branch.** No action needed.

## Breaking changes

> [!WARNING]
> A write that was allowed before is refused: update and delete skip the children of a shared parent, and a create or a move that names a shared parent returns `403` (`core.repository.scope_write_denied`).

To keep the old behaviour for a parent whose shared rows the caller may write, set `write: { sharedRows: true }` on the parent's `access`.

## Details

- The change is in `FilterBuilder.resolveThrough` (`dialect/filter.ts`), the one place both the row selection and the parent-key check read the parent's scope.
- Conformance tests on PGlite and libsql cover a shared parent with and without `sharedRows`, at one hop and at two.

| File | Package |
|------|---------|
| `src/relational/core/repositories/dialect/filter.ts` | connectors |
| `src/relational/core/repositories/core/base.ts` | connectors |
