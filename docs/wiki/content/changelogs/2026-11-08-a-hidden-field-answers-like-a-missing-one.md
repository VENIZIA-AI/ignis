---
title: A hidden field answers like a missing one in every filter path
description: "A request filter that names a hidden property now gets the same 400 as the same filter with a missing name in its place, even when it names other bad keys, and a Meilisearch order on an undeclared field is refused like a hidden one."
packages: ['@venizia/ignis-connectors', '@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-08

## A hidden field answers like a missing one in every filter path

<Badge type="info" text="Bug Fix" /> <Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A caller could still learn that a property exists and is hidden, by sorting on it in Meilisearch or by putting a bogus key next to it. Both now get the answer a missing property gets.

## What changed

- **The first refusal is the one the query meets first.** When a filter names a hidden property and also something the query refuses (a column that does not exist, an unknown relation, a JSON path on a text column), the `400` is the first of these in the order the query reads the filter. Before, the hidden property was always named, so `{"nope":1,"secret":1}` named `secret` while `{"nope":1,"zzz":1}` named `nope`.
- **Read order, per engine.** A relational list without `include` or `fields` reads the `where`, then the `order`. With either one it reads the `order`, then the `where`, then each include, and every include scope is read the same way. A search query reads an `include` first, then the `order`, then the `where`.
- **Meilisearch `order` checks declared fields.** An `order` entry on a field the collection does not declare is refused with `400 Field NOT FOUND` before the engine is called, as on Typesense. Before, a hidden field got that `400` and an undeclared one was sent to the engine.
- **`findById` ignores a `where` here too.** `GET /:id` never reads a `where` from its filter, so a `where` naming a hidden property is no longer refused there, as one naming a missing property never was.
- **A filter with no hidden property is unchanged.** It is left to the query, which refuses it as before.

## Who is affected

- **Meilisearch callers that sort on a field the collection definition does not declare.** They get `400` instead of the engine's own error. Declare the field, or sort through `mode: 'raw'`.
- **Meilisearch callers that sort by distance through `filter.order`** (`_geoPoint(lat, lng) ASC`). It is not a declared field, so it is refused now. Send the geo sort through `mode: 'raw'`.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A Meilisearch `filter.order` entry that is not a declared field of the collection, such as a distance sort, answers `400` instead of reaching the engine.

**Before:**

```typescript
await repository.search({
  input: { mode: 'keyword', query: 'cafe', filter: { order: ['_geoPoint(10.77, 106.69) ASC'] } },
});
```

**After** (send the geo sort to the engine through raw mode, on a controller that opted in with `modes.raw.allow`):

```typescript
await repository.search({
  input: { mode: 'raw', params: { q: 'cafe', sort: ['_geoPoint(10.77,106.69):asc'] } },
});
```

## Details

| File | Package |
|------|---------|
| `src/base/repositories/common/request-filter-guard.ts` | kernel |
| `src/relational/core/repositories/core/base.ts` | connectors |
| `src/relational/core/repositories/core/readable.ts` | connectors |
| `src/search/core/repositories/core/base.ts` | connectors |
| `src/search/meilisearch/repositories/dialect/query-dialect.ts` | connectors |
