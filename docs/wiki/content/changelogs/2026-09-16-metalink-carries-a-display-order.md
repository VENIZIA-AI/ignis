---
title: MetaLink Carries a Display Order
description: "A sequence column orders the rows of one principal. The caller supplies it; the component never derives one, because reading a maximum and writing max+1 is not atomic."
---

# Changelog - 2026-09-16

## `MetaLink.sequence`

<Badge type="danger" text="Breaking" />

```ts
sequence: integer().notNull().default(0)
```

Ordering is **per principal** - the images of one product, not of the whole table. Without it the
only order available was `created_at`, so reordering meant re-uploading.

```sql
SELECT link FROM "MetaLink"
 WHERE principal_type = 'ProductVariant' AND principal_id = $1
 ORDER BY sequence, created_at;
```

Always tiebreak on `created_at`. Every legacy row defaults to `0`, so with the tiebreak they keep
exactly the order they already had, and without it they come back arbitrary.

## The caller supplies it

A form field beside the file:

```js
form.append('files', file);
form.append('principalType', 'Product');
form.append('principalId', '42');
form.append('sequence', '3');
```

Omit it and the column keeps its default, so a row nobody ordered is indistinguishable from a legacy
one. The component does **not** derive the next value: reading `max(sequence)` and writing `max + 1`
is not atomic, and two concurrent uploads would both read the same maximum.

On `upload-commit` the same field goes in the JSON body, alongside the other labels.

## You have your own MetaLink table

`TMetaLinkCompatibleSchema` is derived from the shipped model, so a table without the column stops
typechecking. Add it in the same change as the migration:

```sql
ALTER TABLE "MetaLink" ADD COLUMN sequence integer NOT NULL DEFAULT 0;
CREATE INDEX "IDX_MetaLink_principal_sequence"
    ON "MetaLink" (principal_type, principal_id, sequence);
```

The index leads with the filter columns and trails with the sort column, because ordering always runs
inside a principal filter - an index on `sequence` alone would not serve that query.

## Who is affected

**You use the shipped MetaLink table.** The column appears. Nothing to write.

**You use your own table.** Compile error until you add the column. Migrate both together.

**You do not use `useMetaLink`.** Nothing.

**Files:**

- [`packages/core-server/src/components/static-asset/models/base.model.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/models/base.model.ts) - `BaseMetaLinkModel`
