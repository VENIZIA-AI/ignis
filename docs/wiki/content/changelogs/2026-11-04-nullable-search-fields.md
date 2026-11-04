---
title: A nullable search field reads back as null when Typesense drops the key
description: "Declare a search field { optional: true, nullable: true } and a read returns null where the engine kept no key."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-04

## A nullable search field reads back as null when Typesense drops the key

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Typesense keeps no null, so a document written with `null` came back without the key and a schema saying `string | null` rejected every row. A field declared `nullable: true` now reads back as `null`.

## What changed

- **`nullable` flag.** `field.string('note', { optional: true, nullable: true })`, and the same for the other field helpers. It needs `optional: true`; `SearchCollectionFactory.define` throws without it. It is never sent to the engine.
- **Reads fill it.** `find`, `findOne`, `findById`, `search` hits and `suggest` return `null` for a nullable field whose key is absent. A plain `optional` field stays absent. A value, `0`, `''` and an explicit `null` are kept.
- **Writes return the same shape.** `create`, `createAll` and `updateById` return documents with the nullable fields filled, so a created document and a found one match. What is sent to the engine does not change.
- **Types and schemas.** `TSearchDocument` types the field `T | null`. `deriveDocumentSchema` gives the `select` schema `.nullable().default(null)`, and the `create` and `update` schemas `.nullable().optional()`.
- **Selections and passthrough.** A field selection (`filter.fields`, `includeFields`) limits the fill to the selected fields. `mode: 'raw'` and `multiSearch` fill nothing.
- **Meilisearch.** The fill is engine-neutral, so a nullable field always reads as `T | null` there too: a stored `null` stays `null`, and a field that was never set also becomes `null`.

## Who is affected

- **Models with an `optional` field that the application treats as `T | null`.** Add `nullable: true` to that field. The flag is opt-in, so no existing model changes until it is set; for a field that turns it on, the read shape changes from "absent" to `null`.
- **Code that called the protected `omitHiddenFieldsAll` of a search repository.** It had no caller left and is removed; use `shapeDocuments`, which strips hidden fields too.
- **Everyone else.** No action needed.

## Details

```typescript
field.string('note', { optional: true, nullable: true }), // read: string | null, never absent
field.string('nickname', { optional: true }), // read: string, or absent
```

A stored `null` and a field that was never set look the same after a round trip: both come back `null`. If the two must differ, store a sentinel value. The [Typesense guide](/guides/core-concepts/persistent/search-typesense#nullable-fields) has the rules.
