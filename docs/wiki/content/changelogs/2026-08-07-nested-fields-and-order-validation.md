---
title: Nested i18n Fields Become Filterable and Sortable
description: Denormalised fields like merchantName.en were indexed and facetable but unreachable by any caller - they now filter and sort, and a bad order field is a 400 instead of an engine error.
---

# Changelog - 2026-08-07

## Nested i18n Fields Become Filterable and Sortable

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A denormalised field such as `merchantName.en` was indexed, facetable, and completely unreachable - `search()` refused it as a "JSON-path field" - so **a merchant list could not be sorted by merchant name**; it now filters and sorts like any other field, because the collection's own field list decides what exists.

## What changed

- **Dotted field names work.** `merchantName.en`, `organizerName.vi`, `zoneName.en` - every denormalised i18n field an application declares - are now usable in `where` and in `order`. They were rejected by a check that read a dot as a JSON path. Typesense has no such rule: with `enable_nested_fields`, a dotted name is an ordinary field name, and a collection declares it literally - `field.string('merchantName.en', { facet: true, optional: true })`.
- **`order` now validates the field name.** It previously checked only the *direction* and the field *count*, so an unknown sort field was passed to the engine verbatim and came back as an infrastructure error. It is now a 400 naming the field and the engine, exactly as an unknown `where` field already was. The relational reference has always resolved the ORDER column and thrown `Column NOT FOUND`; this closes the same divergence on the sibling path.
- **A nested field cannot be provisioned without its flag.** Declaring a dotted field name while `engineOverrides.typesense.enable_nested_fields` is unset now throws at compile time, naming the field and stating what to set. Without this, the mistake would surface later as an engine rejection at query time, far from the declaration that caused it.

## Who is affected

- **Anyone with denormalised i18n fields.** This is the fix. Declare the flag (below) and they become filterable and sortable. No other action.
- **Anyone sorting by a field their collection does not declare.** Previously an engine error, now a 400 naming the field. The request failed before and fails now - only the error changed, and for the better.
- **Anyone who adds fields through `engineOverrides.typesense.fields` only.** Read the caveat below; this affects you.
- **Anyone whose entity carries no collection definition.** Nothing changes. An absent field list means *unvalidated*, not "no fields".

## Enabling nested fields

The flag is per collection and deliberately **not** emitted automatically:

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

Auto-enabling it would have been the smaller diff. It was rejected because what `enable_nested_fields` changes *beyond* making dotted names resolve is not established here, and emitting engine configuration on an unverified assumption is how surprises get built in. The compiler validates; it does not paper over.

## Behaviour changes

**One judgment now governs both paths.** "Does the collection declare this field?" is asked by `where` and by `order`, through the same helper, so the two cannot drift into disagreeing about what exists. A dot is not special to that question:

| Field | Declared in `fields`? | Result |
|---|---|---|
| `merchantName.en` | yes | compiles - filter and sort both |
| `metadata.foo` | no | 400 naming the field and the engine |
| `title` | yes | compiles, as before |
| `titel` | no | 400 naming the field, as before |

The replacement error is strictly more useful. "Field NOT FOUND | field: `metadata.foo`" tells a caller what to fix; "does not support JSON-path fields" told them something that was not true of the engine.

> [!WARNING]
> **A field added ONLY through `engineOverrides.typesense.fields` is unknown to the dialect.** The list the dialect checks against is the neutral `fields` array on the collection definition, not the merged wire schema - so a field existing solely in the override is rejected as undeclared. This was already true of `where` since the parity release; `order` now inherits it. Declare such fields in `fields` as well, and keep the override for the engine-specific *attributes* it exists for.

`mode: 'raw'` is unaffected: it bypasses the dialect entirely, so no field checking applies to it. Same escape hatch, same consequences owned by its callers.

## Details

- `capabilities` was already plumbed into `build()` by the parity release for the `where` path, but `SearchBaseRepository.buildQuery` never passed it - it withholds `where` and compiles it separately, so the repository's own `defaultWhere` is not field-checked against the caller's collection. That withholding is precisely why passing capabilities into `build()` now cannot double-validate anything: it reaches `order` and nothing else.
- A direct caller of `build()` who supplies both a `where` and `capabilities` gets both validated. That is correct for them - they are not the repository, and nothing of theirs is exempt.
- The nested-fields check reads the **merged** schema, so a dotted field appended through the override is checked too, and the flag is honoured wherever it was set.
- Meilisearch is untouched. Its dialect still does not validate `order`; the interface change is additive and optional, so nothing there had to move. Porting it is a decision to make, not a change to copy.

| File | Package |
|------|---------|
| `src/connectors/search/repositories/common/dialect-helpers.ts` | core |
| `src/connectors/search/repositories/common/types.ts` | core |
| `src/connectors/search/repositories/core/base.ts` | core |
| `src/connectors/typesense/repositories/dialect/query-dialect.ts` | core |
| `src/connectors/typesense/compiler.ts` | core |
