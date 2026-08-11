---
title: Call Sites No Longer Have to Know Which Fields Are Text
description: A collection can declare the fields a keyword search matches, so query_by stops being repeated at every call site and the sidecars bolted onto models can go.
---

# Changelog - 2026-08-07

## Call Sites No Longer Have to Know Which Fields Are Text

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Enhancement" />

**In one line.** Typesense will not run a text search without being told which fields the text should match against, so **every call site had to carry that knowledge** - and applications bolted sidecars onto their models (`static searchDefaults = { queryBy: [...] }`) to avoid repeating it. A collection can now declare it once, beside `fields`, where it belongs.

## What changed

- **`defaultQueryBy` on the collection definition.** The sibling of `defaultSort`: that one says how a collection *sorts*, this one says what *searching it means*.

  ```typescript
  defineSearchCollection({
    name: 'merchants',
    fields: [field.string('title'), field.string('description'), field.number('rating')],
    defaultSort: 'rating',                     // how this collection sorts
    defaultQueryBy: ['title', 'description'],  // what searching it means
  });
  ```

- **A keyword search with no `queryBy` falls back to it.** `search({ mode: 'keyword', query: 'widget' })` now reaches the engine with `query_by: title,description`. An explicit caller `queryBy` still wins - this is a default, not an override.
- **It is validated where it is declared.** Every named field must exist, and must be a text field (`string` or `string[]`); the error names the collection, the field, and the offending type.

## Who is affected

- **Anyone passing the same `queryBy` at every call site.** Declare it once and drop it from the calls. A model-side `searchDefaults` sidecar can go with it.
- **Anyone who does not declare `defaultQueryBy`.** Nothing changes at all. No default is invented.
- **Anyone using semantic or hybrid search.** Nothing changes; see below for why neither can be affected.
- **Anyone listing with a filter and no search term.** Nothing changes - and this was the case most at risk, so it is pinned by tests rather than assumed.

## Behaviour changes

**The fallback is deliberately narrow, and every narrowing does work:**

| Case | `query_by` sent |
|---|---|
| keyword, real term, no caller `queryBy` | **the collection's default** |
| keyword, real term, caller supplied `queryBy` | the caller's - a default never overrides |
| keyword, term is `*`, blank, or absent | **none**, default declared or not |
| semantic | unchanged - it carries `vectorField`, never `queryBy` |
| hybrid | unchanged - its `queryBy` is **required** by the schema, so it is never absent |
| `find()` | unchanged - it always searches `q = '*'` and never sets `query_by` |

A `*` or blank term matches every document *regardless of field*, so naming fields for it means nothing - and a bare filter listing already reached the engine correctly as `q: '*'` with no `query_by`. A naive default would have broken exactly that, which is why it is a tested case rather than a remark.

## Details

- **The type check lives in the DSL, not in an engine compiler** - a deliberate departure from `defaultSort`, whose numeric-scalar rule sits in the Typesense compiler. Two reasons. `default_sorting_field` is part of the *provisioned schema* and reaches a compiler; `defaultQueryBy` is a *per-query* parameter that reaches none, so deferring would mean it was checked nowhere and failed at query time as an engine error. And engines genuinely disagree about what is sortable, whereas "full-text matching needs text" is not an engine choice - the neutral vocabulary already names the two types that qualify.
- **The default is resolved in the repository, never in the dialect.** The repository knows the entity; `applySearchInput` is collection-blind by design and receives a complete input. Threading the collection into the dialect would make the engine layer depend on the model layer to save one indirection.
- **No page-depth or `maxOffset` member came along with it.** That is application policy, and this is one field.

| File | Package |
|------|---------|
| `src/connectors/search/models/types.ts` | core |
| `src/connectors/search/models/define-search-collection.ts` | core |
| `src/connectors/search/repositories/core/readable.ts` | core |
