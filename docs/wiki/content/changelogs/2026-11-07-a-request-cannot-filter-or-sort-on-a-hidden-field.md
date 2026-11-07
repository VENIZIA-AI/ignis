---
title: A request cannot filter or sort on a hidden field
description: "A where, an order or an include scope that names a hidden property answers 400, with the very text a field that does not exist gets, on the generated CRUD and search controllers. Server code on the repository is unchanged."
packages: ['@venizia/ignis-kernel', '@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-07

## A request cannot filter or sort on a hidden field

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A hidden property is never returned, but a `where` or an `order` on it reveals its value one question at a time. A request filter that names one is refused now.

## What changed

- **Refused with 400.** On the generated CRUD controllers (`count`, `find`, `findOne`, `findById`, `updateBy`, `deleteBy`) and on the generated search controllers, a request whose `where`, `order` or include `scope` names a property its model hides answers `400`, and nothing is read or changed.
- **Everywhere in the filter.** The `where` at any depth of `and` and `or`, a JSON path in any spelling (`meta.pin`, `[meta].pin`, `.meta.pin`, `[meta]pin` all name the column `meta`), the `order` entries, and the `scope` of an include, including a nested include. Each include level is judged by the properties of the model it reads, not by the parent's.
- **Same answer as an unknown column, byte for byte.** The refusal is the error the query gives for a column or field that does not exist, in the same form for the same key (the table or relation name included). The message never says the field is hidden, so a caller cannot tell a hidden field from one that is missing.
- **Nested search fields.** A search model that hides a nested field (`meta.pin`) refuses the field, any path under it, and its parent object (`meta`), which holds it.
- **Server code is unchanged.** The repository's own methods (`find`, `count`, `updateBy`, ...) still filter and sort on a hidden property, and a model's own default filter may name one.
- **Search.** The search controllers hold `filter.where` and `filter.order` to it too. The repository's existing refusal of a hidden field in `queryBy`, `facetBy`, `facetQuery`, `groupBy` and the highlight fields is unchanged.

## Who is affected

- **Clients that filter or sort on a property the model hides.** They get `400`. Filter on a visible property, or do it in server code that calls the repository.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A request whose `where`, `order` or include scope names a hidden property answers `400`.

**Before:**

```typescript
// GET /products?filter={"where":{"costPrice":{"gt":100}}}  ->  200, the rows
```

**After:**

```typescript
// GET /products?filter={"where":{"costPrice":{"gt":100}}}  ->  400, the error of a column that does not exist
// Server code on the repository is unchanged:
await productRepository.find({ filter: { where: { costPrice: { gt: 100 } } } });
```

## Details

| File | Package |
|------|---------|
| `src/base/repositories/common/request-filter-guard.ts` | kernel |
| `src/base/repositories/core/abstract.ts` | kernel |
| `src/base/controllers/factory/crud/` | kernel |
| `src/relational/core/repositories/core/base.ts` | connectors |
| `src/search/core/controllers/abstract.ts` | connectors |
