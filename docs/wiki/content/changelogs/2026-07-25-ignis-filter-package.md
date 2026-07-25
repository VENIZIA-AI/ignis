---
title: ignis-filter - the Filter Vocabulary as a Browser-Safe Package
description: The filter shape, operators and query schemas now ship as @venizia/ignis-filter, usable in a browser without the server framework. Applications on @venizia/ignis need no changes.
---

# Changelog - 2026-07-25

## `@venizia/ignis-filter` - the Filter Vocabulary as its Own Package

<Badge type="tip" text="New Package" /> <Badge type="tip" text="Enhancement" />

**In one line.** The filter language is now a standalone package a browser can use, and if you build on `@venizia/ignis` nothing changes for you - every name is still re-exported from the core barrel.

## What moved

`TFilter` and its members, `QueryOperators`, `TQueryOperator` and `Sorts` left `@venizia/ignis` for `@venizia/ignis-filter`. The zod query schemas followed, onto a `/schemas` subpath.

You do not need to install it. It is a regular dependency of `@venizia/ignis`, so it arrives transitively, and the core barrel re-exports it:

```typescript
// unchanged, still works
import { QueryOperators, type TFilter, FilterSchema } from '@venizia/ignis';
```

Install it directly only when you want the filter language **without** the server framework:

```typescript
import { QueryOperators, Sorts, type TFilter } from '@venizia/ignis-filter';
import { FilterSchema, WhereSchema } from '@venizia/ignis-filter/schemas';
```

## Why it is a separate package

An offline-capable client needs to express a query in the same language the server speaks, or the two drift and every sync becomes a translation problem. Sharing the vocabulary is only possible if the vocabulary carries nothing server-side.

It did not. `operators.ts` contains no server code at all, yet bundling it for a browser pulled in **13 node builtins plus `@hono/zod-openapi` and `ioredis`** - purely because it reached `getError` through the `@venizia/ignis-helpers` root barrel, which re-exports every module. Purity is a property of the resolved import graph, never of a file's own source.

The package now resolves to `@venizia/ignis-inversion`, `lodash` and `reflect-metadata`, and nothing else. A guard test bundles it for a browser target on every run and fails if anything else appears.

## Two subpaths, and which one you want

| Import | Contains | Use it |
|---|---|---|
| `@venizia/ignis-filter` | `TFilter`, `QueryOperators`, `Sorts` | Anywhere. Resolves no `zod`. |
| `@venizia/ignis-filter/schemas` | `FilterSchema`, `WhereSchema`, the rest | In a browser. Adds `zod`. |
| `@venizia/ignis` | the same schemas, with OpenAPI metadata | **On a server.** |

The split is deliberate: importing the vocabulary must not drag a validator into a bundle that only needs `QueryOperators`.

The server distinction matters. The instances on `/schemas` validate identically but carry no OpenAPI metadata, so a route built on them produces an API reference with no descriptions. Take them from `@venizia/ignis` on the server.

## Building your own metadata layer

`buildQuerySchemas` accepts a decorator applied to every node, nested ones included:

```typescript
import { buildQuerySchemas } from '@venizia/ignis-filter/schemas';

const { FilterSchema } = buildQuerySchemas({
  decorate: (schema, metadata) => schema.describe(metadata.description ?? ''),
});
```

A factory rather than a plain export because `.openapi()` returns a **new** schema instead of mutating, and several of the descriptions sit on inner nodes of a nested tree - annotating them after the tree is composed would leave the composed children bare.

## What stayed behind

- **Translation.** Turning a `TFilter` into SQL is engine-specific; the Postgres translator is Drizzle-coupled and lives with its connector.
- **The types are hand-written, not inferred.** `TFilter<T>` is generic over the entity, so `TFilter<User>` rejects `{ where: { notAField: 1 } }`. `z.infer<typeof FilterSchema>` accepts it, because the recursive where-clause is untyped. The schema describes what arrives over the wire; the type describes what your code builds.

## Migration

None. No public name moved, and `TLimit` / `TOffset` / `TSkip` / `TOrderBy` are restated as literal types that a compile-time assertion proves identical to what they were.

One note for anyone publishing from this repo: `@venizia/ignis-filter` must reach npm **before** `@venizia/ignis`, which now depends on it.
