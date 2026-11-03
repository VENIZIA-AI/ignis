---
title: ignis-filter - the Filter Vocabulary as a Browser-Safe Package
description: The filter shape, operators and query schemas now ship as @venizia/ignis-filter, usable in a browser without the server framework, and applications on @venizia/ignis need no changes.
packages: ['@venizia/ignis', '@venizia/ignis-filter', '@venizia/ignis-helpers', '@venizia/ignis-inversion']
---

# Changelog - 2026-07-25

## `@venizia/ignis-filter` - the Filter Vocabulary as its Own Package

<Badge type="tip" text="New Package" /> <Badge type="tip" text="Enhancement" />

**In one line.** The filter language is now a standalone package a browser can use, and if you build on `@venizia/ignis` nothing changes for you.

## What changed

- **`TFilter` and its members, `QueryOperators`, `TQueryOperator` and `Sorts`** moved from `@venizia/ignis` to `@venizia/ignis-filter`. The zod query schemas moved to the `@venizia/ignis-filter/schemas` subpath.
- **Nothing to install for existing apps.** It is a regular dependency of `@venizia/ignis`, and the core barrel still re-exports every name.
- **Small browser footprint.** The package resolves to `@venizia/ignis-inversion`, `lodash` and `reflect-metadata`, and nothing else.
- **`buildQuerySchemas`** accepts a `decorate` function applied to every node, nested ones included, for building your own metadata layer.

```typescript
// unchanged, still works
import { QueryOperators, type TFilter, FilterSchema } from '@venizia/ignis';
```

Install it directly only when you want the filter language without the server framework:

```typescript
import { QueryOperators, Sorts, type TFilter } from '@venizia/ignis-filter';
import { FilterSchema, WhereSchema } from '@venizia/ignis-filter/schemas';
```

```typescript
import { buildQuerySchemas } from '@venizia/ignis-filter/schemas';

const { FilterSchema } = buildQuerySchemas({
  decorate: (schema, metadata) => schema.describe(metadata.description ?? ''),
});
```

## Who is affected

- **Apps on `@venizia/ignis`.** No migration. No public name moved.
- **Browser or offline clients.** Import from `@venizia/ignis-filter` to share the server's query language.

## Details

| Import | Contains | Use it |
|---|---|---|
| `@venizia/ignis-filter` | `TFilter`, `QueryOperators`, `Sorts` | Anywhere. Resolves no `zod`. |
| `@venizia/ignis-filter/schemas` | `FilterSchema`, `WhereSchema`, the rest | In a browser. Adds `zod`. |
| `@venizia/ignis` | the same schemas, with OpenAPI metadata | **On a server.** |

- The instances on `/schemas` validate identically but carry no OpenAPI metadata, so a route built on them produces an API reference with no descriptions. Take them from `@venizia/ignis` on the server.
- Translating a `TFilter` into SQL stays with each connector. It is not part of this package.
- The types are hand-written, not inferred. `TFilter<User>` rejects `{ where: { notAField: 1 } }`, but `z.infer<typeof FilterSchema>` accepts it, because the recursive where-clause is untyped. The schema describes what arrives over the wire; the type describes what your code builds.
