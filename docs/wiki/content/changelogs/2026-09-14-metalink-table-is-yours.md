---
title: The MetaLink Table Can Live In Your Own Postgres Schema
description: TMetaLinkConfig pinned the MetaLink type to the exact table IGNIS ships, so a column-identical table under another Postgres schema was refused at compile time. The constraint is now the row, not the table.
---

# Changelog - 2026-09-14

## The MetaLink table can live in your own Postgres schema

<Badge type="tip" text="Fix" />

**In one line.** `TStaticAssetsComponentOptions` takes the MetaLink table as a type argument, and the
constraint is now the row rather than the exact table IGNIS ships.

A column-for-column identical table under a Postgres schema of your own used to be refused:

```
error TS2322: Types of property 'schema' are incompatible.
  Type '"commerce"' is not assignable to type 'undefined'.
```

Nothing was wrong at runtime. The repository carries its own schema, so the row landed in
`commerce.MetaLink` exactly as intended. Only the type layer said no, and an application had no way
around it - the option type never took a type argument, so declaring one on `TMetaLinkConfig`
changed nothing.

## Pass your table as the type argument

```ts
const commerceSchema = pgSchema('commerce');

@model({ type: 'entity' })
export class MetaLinkModel extends BaseRelationalEntity<typeof MetaLinkModel.schema> {
  static override schema = commerceSchema.table('MetaLink', { /* the MetaLink columns */ });
}

this.bind<TStaticAssetsComponentOptions<typeof MetaLinkModel.schema>>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({ /* ... */ });
```

The new constraint is `TMetaLinkCompatibleSchema`: any table whose row carries the MetaLink fields.
The table is free to sit in another Postgres schema, or to carry another name.

**A table missing one of those fields is still refused.** That is the part worth keeping - the
workaround people reach for, `as unknown as TMetaLinkConfig['model']`, silences the missing-column
check along with the schema complaint.

## `createMetaLink` returns a row, and now says so

Its return type read `{ count: number; data: Schema }`, where `Schema` is the TABLE type. The
component reads a row out of it, and `repository.create()` returns a row, so the annotation named the
wrong thing. It is `{ count: number; data: TTableObject<Schema> }`.

If you wrote `createMetaLink` and fought the type, the fight is over. Nothing about the value changed.

## Who is affected

**You do not use `useMetaLink`.** Nothing.

**You use the MetaLink table IGNIS ships.** Nothing. `TStaticAssetsComponentOptions` with no type
argument keeps meaning what it meant.

**You kept your MetaLink table in another Postgres schema behind a cast.** Drop the cast and pass the
table as the type argument. The missing-column check comes back with it.

**Files:**

- [`packages/core-server/src/components/static-asset/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/types.ts) - `TMetaLinkConfig`, `TStaticAssetsComponentOptions`
- [`packages/core-server/src/components/static-asset/models/base.model.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/models/base.model.ts) - `TMetaLinkCompatibleSchema`
- [`examples/vert/src/components/platform.component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/examples/vert/src/components/platform.component.ts) - a working `useMetaLink: true` example
