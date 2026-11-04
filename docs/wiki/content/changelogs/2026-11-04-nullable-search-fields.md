---
title: A nullable search field reads back as null when Typesense drops the key
description: "Declare a search field { optional: true, nullable: true } and a read returns null where the engine kept no key."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-04

## A nullable search field reads back as null when Typesense drops the key

<Badge type="tip" text="New Feature" />

**In one line.** Typesense keeps no null, so a document written with `null` came back without the key and a schema saying `string | null` rejected every row. A field declared `nullable: true` now reads back as `null`.

## What changed

- **`nullable` flag.** `field.string('note', { optional: true, nullable: true })`, and the same for the other field helpers. It needs `optional: true`; `SearchCollectionFactory.define` throws without it. It is never sent to the engine.
- **Reads fill it.** `find`, `findOne`, `findById`, `search` hits and `suggest` return `null` for a nullable field whose key is absent. A plain `optional` field stays absent. A value, `0`, `''` and an explicit `null` are kept.
- **Writes return the same shape.** `create`, `createAll` and `updateById` return documents with the nullable fields filled, so a created document and a found one match. What is sent to the engine does not change.
- **Types and schemas.** `TSearchDocument` types the field `T | null`. `deriveDocumentSchema` gives the `select` schema `.nullable().default(null)`, and the `create` and `update` schemas `.nullable().optional()`.
- **Meilisearch.** The flag is accepted and changes nothing there.

## Who is affected

- **Models with an `optional` field that the application treats as `T | null`.** Add `nullable: true` to that field. Nothing changes until you do.
- **Everyone else.** No action needed.

## Details

```typescript
field.string('note', { optional: true, nullable: true }), // read: string | null, never absent
field.string('nickname', { optional: true }), // read: string, or absent
```

A stored `null` and a field that was never set look the same after a round trip: both come back `null`. If the two must differ, store a sentinel value. The [Typesense guide](/guides/core-concepts/persistent/search-typesense#nullable-fields) has the rules.
