---
title: A caller's where cannot replace the default filter
description: "A where that sets a field the model's default filter also sets now AND-composes with it, scalars included, so a request cannot read soft-deleted rows. Server code opts out with shouldSkipDefaultFilter."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-07

## A caller's where cannot replace the default filter

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A model's default filter (`isDeleted = false`, `deletedAt IS NULL`) could be replaced by a caller's `where` on the same field: `where: { isDeleted: true }` returned the soft-deleted rows of the caller's scope. A caller's `where` can only narrow the default now.

## What changed

- **No override.** When the default filter and the caller's `where` both set a field, the two conditions AND-compose, scalars included. `where: { isDeleted: true }` against the default `isDeleted: false` matches no row.
- **Restating the default is a no-op.** `where: { deletedAt: null }` with the default `deletedAt: null` is the same query as without it.
- **Every path.** Reads (`find`, `findOne`, `count`), `updateBy`, `deleteBy` and the `scope.where` of an included relation, which merges with the related model's own default.
- **Not only soft delete.** The rule is on the default filter, whatever field it sets: a default `status: 'live'` is not replaced by `where: { status: 'archived' }` either.
- **The server opts out explicitly.** `options: { shouldSkipDefaultFilter: true }` on the repository call (and on an include) reads or changes the rows the default hides. It is not on the wire schema, so a request cannot send it. The access scope (`settings.access`) still applies on top.
- **Unchanged.** Operator objects, `and` and `or` composed as before, a caller's `undefined` still never replaces a default, and keys only one side sets pass through.

## Who is affected

- **Server code that read deleted rows with `where: { isDeleted: true }`** (a trash view, a restore screen) or that overrode another default field. Pass `shouldSkipDefaultFilter: true` instead.
- **Clients that sent `where: { deletedAt: null }`** or the other restated default. Still works; it is a no-op and can be dropped.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A `where` that sets a field the default filter sets no longer replaces the default.

**Before:**

```typescript
// Returns the deleted rows
await postRepository.find({ filter: { where: { isDeleted: true } } });
```

**After:**

```typescript
// The same call returns nothing. Server code that wants the deleted rows says so:
await postRepository.find({
  filter: { where: { isDeleted: true } },
  options: { shouldSkipDefaultFilter: true },
});
```

`shouldSkipDefaultFilter` drops the whole default filter, not only the soft-delete condition. If the model's default holds other conditions you still want, state them in the `where`.

## Details

| File | Package |
|------|---------|
| `src/relational/core/repositories/dialect/filter.ts` | connectors |
