---
title: The search hidden-field check reads each field of a comma-joined list
description: "A hidden field can no longer ride inside a field-list element such as title,secret in facetBy, groupBy, queryBy, the highlight fields or the vector field. Every part is checked."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-06

## The search hidden-field check reads each field of a comma-joined list

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** The check that keeps a model's hidden properties out of facets, matches, groups and highlights compared whole list elements, while an engine reads the list as one comma-joined string. Each part of each element is checked now, and the vector field of a semantic or hybrid search is checked too.

## What changed

- **Every part.** `facetBy`, `groupBy`, `queryBy`, `highlightFields`, `highlightFullFields`, the field of a `facetQuery` and the `vectorField` are split on commas and trimmed; a hidden field named in any part is refused with the existing "names a hidden field" error, before anything is sent to the engine.
- **Facet parameters and wildcards.** A name followed by facet parameters (`secret(sort_by:_alpha:asc)`) is read by its name, and a wildcard (`*`, `sec*`) in those lists is refused on a model with hidden fields, because it names fields the check cannot list. Name the fields instead.
- **Visible lists are unchanged.** `queryBy: ['title', 'brand']` still goes out as `title,brand`.

## Who is affected

- **Search repositories on models with `hiddenProperties`.** A request that names a hidden field inside a list element is refused.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/search/core/repositories/core/readable.ts` | connectors |
