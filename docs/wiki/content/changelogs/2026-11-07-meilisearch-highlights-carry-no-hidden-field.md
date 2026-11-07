---
title: Meilisearch highlights carry no hidden field
description: "A search hit's highlight is shaped like its document: hidden fields are removed, and the Meilisearch connector asks the engine for the visible fields only."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-07

## Meilisearch highlights carry no hidden field

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** A Meilisearch keyword search with `highlightFields` returned the model's hidden fields inside `hits[].highlight`, while the `document` of the same hit had none. The highlight is shaped like the document now.

## What changed

- **The highlight loses hidden fields.** `search()` removes a hidden field from each hit's `highlight`, on every engine: a record loses its hidden keys, and a list of entries loses those whose `field` is hidden (a dotted path counts by its root). A hit without a highlight stays without one.
- **Meilisearch is asked for the visible fields.** A model that hides fields sends `attributesToRetrieve` with every declared field that is visible, plus `id`, so the engine does not return a hidden value at all. A `fields` selection that names a hidden field loses it from the request. A model that hides nothing sends no list.
- **Unchanged.** Documents are shaped as before, `mode: 'raw'` stays a passthrough, and Typesense (which already left hidden fields out of its highlights) is unaffected.

## Who is affected

- **Applications with `hiddenProperties` on a Meilisearch-backed model that read `highlight`.** The highlight no longer holds the hidden fields. No action needed.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/search/core/repositories/core/base.ts` | connectors |
| `src/search/core/repositories/core/readable.ts` | connectors |
| `src/search/meilisearch/repositories/dialect/query-dialect.ts` | connectors |
