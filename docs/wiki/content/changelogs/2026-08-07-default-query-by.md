---
title: Call Sites No Longer Have to Know Which Fields Are Text
description: A search collection can declare the fields a keyword search matches once with defaultQueryBy, so query_by stops being repeated at every call site.
packages: ['@venizia/ignis']
---

# Changelog - 2026-08-07

## Call Sites No Longer Have to Know Which Fields Are Text

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Enhancement" />

**In one line.** Typesense needs to be told which fields a text search matches, so every call site carried that knowledge; a collection can now declare it once, beside `fields`.

## What changed

- **`defaultQueryBy` on the collection definition.** The sibling of `defaultSort`: that one says how a collection sorts, this one says what searching it means.
- **A keyword search with no `queryBy` falls back to it.** `search({ mode: 'keyword', query: 'widget' })` now reaches the engine with `query_by: title,description`. An explicit caller `queryBy` still wins.
- **Validated where it is declared.** Every named field must exist and be a text field (`string` or `string[]`). The error names the collection, the field and the offending type.

```typescript
defineSearchCollection({
  name: 'merchants',
  fields: [field.string('title'), field.string('description'), field.number('rating')],
  defaultSort: 'rating',                     // how this collection sorts
  defaultQueryBy: ['title', 'description'],  // what searching it means
});
```

## Who is affected

- **Anyone passing the same `queryBy` at every call site.** Declare it once and drop it from the calls. A model-side `searchDefaults` sidecar can go too.
- **Anyone who does not declare `defaultQueryBy`.** Nothing changes. No default is invented.
- **Anyone using semantic or hybrid search, or listing with a filter and no search term.** Nothing changes.

## Details

| Case | `query_by` sent |
|---|---|
| keyword, real term, no caller `queryBy` | the collection's default |
| keyword, real term, caller supplied `queryBy` | the caller's |
| keyword, term is `*`, blank, or absent | none, default declared or not |
| semantic | unchanged - it carries `vectorField`, never `queryBy` |
| hybrid | unchanged - its `queryBy` is required |
| `find()` | unchanged - it always searches `q = '*'` and never sets `query_by` |
