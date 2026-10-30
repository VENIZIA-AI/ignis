---
title: Nested i18n Fields Become Filterable and Sortable
description: Dotted fields like merchantName.en can now be filtered and sorted, and an unknown order field is a 400 naming the field instead of an engine error.
packages: ['@venizia/ignis']
---

# Changelog - 2026-08-07

## Nested i18n Fields Become Filterable and Sortable

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A denormalised field such as `merchantName.en` was indexed and facetable but `search()` refused it as a "JSON-path field"; it now filters and sorts like any other field.

## What changed

- **Dotted field names work** in `where` and `order`, for example `merchantName.en` or `zoneName.vi`. Declare them literally: `field.string('merchantName.en', { facet: true, optional: true })`.
- **`order` validates the field name.** An unknown sort field is now a 400 naming the field and the engine, as an unknown `where` field already was. Before, it reached the engine and came back as an infrastructure error.
- **A nested field cannot be provisioned without its flag.** Declaring a dotted field while `engineOverrides.typesense.enable_nested_fields` is unset throws at compile time, naming the field and what to set.

```typescript
defineSearchCollection({
  name: 'merchants',
  fields: [
    field.string('merchantName.en', { facet: true, optional: true }),
    field.string('merchantName.vi', { facet: true, optional: true }),
  ],
  engineOverrides: { typesense: { enable_nested_fields: true } },
});
```

The flag is per collection and is deliberately not emitted automatically.

## Who is affected

- **Anyone with denormalised i18n fields.** Declare the flag above and they become filterable and sortable.
- **Anyone sorting by a field their collection does not declare.** The request failed before and fails now - only the error changed, to a 400 naming the field.
- **Anyone who adds fields only through `engineOverrides.typesense.fields`.** See the warning below.
- **Anyone whose entity has no collection definition.** Nothing changes. An absent field list means unvalidated.

## Details

| Field | Declared in `fields`? | Result |
|---|---|---|
| `merchantName.en` | yes | compiles - filter and sort both |
| `metadata.foo` | no | 400 naming the field and the engine |
| `title` | yes | compiles, as before |
| `titel` | no | 400 naming the field, as before |

> [!WARNING]
> A field added only through `engineOverrides.typesense.fields` is unknown to the dialect, because the dialect checks the neutral `fields` array, not the merged wire schema. This was already true of `where`; `order` now inherits it. Declare such fields in `fields` as well, and keep the override for engine-specific attributes.

- `mode: 'raw'` bypasses the dialect, so no field checking applies to it.
- Meilisearch is untouched. Its dialect still does not validate `order`.
