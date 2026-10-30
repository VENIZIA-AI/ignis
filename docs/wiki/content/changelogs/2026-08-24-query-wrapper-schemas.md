---
title: Two Query Shapes You No Longer Have to Rebuild
description: FilterQuerySchema and WhereQuerySchema replace the query object every custom route was rebuilding by hand.
packages: ['@venizia/ignis']
---

# Changelog - 2026-08-24

## FilterQuerySchema and WhereQuerySchema

<Badge type="tip" text="New API" />
<Badge type="tip" text="Enhancement" />

**In one line.** The query shape every list route takes now has a name, so a custom route names it instead of rebuilding it.

## What changed

Two schemas ship from `@venizia/ignis`:

| Schema | Query shape | Use it for |
|---|---|---|
| `FilterQuerySchema` | `{ filter?: TFilter }` | Any route that takes a full filter |
| `WhereQuerySchema` | `{ where?: TWhere }` | Any route that takes conditions and no pagination |

Before:

```typescript
request: { query: z.object({ filter: FilterSchema.optional() }).partial() },
```

After:

```typescript
request: { query: FilterQuerySchema },
```

Both are plain Zod objects, so a route with more parameters extends them:

```typescript
request: { query: WhereQuerySchema.extend({ q: z.string().max(255).optional() }) },
```

The generated `find`, `findById` and `findOne` routes now use `FilterQuerySchema` too.

## Who is affected

- **Existing applications.** Nothing breaks. This is additive.
- **Anyone overriding a `find` route's query.** `FilterSchema` already ends with `.optional()`, so these three accept the same requests. If you override `find`, `findById` or `findOne` only to make `filter` optional, delete the override. `WhereSchema` carries no `.optional()`, which is why `WhereQuerySchema` adds one.

```typescript
z.object({ filter: FilterSchema })
z.object({ filter: FilterSchema.optional() })
z.object({ filter: FilterSchema.optional() }).partial()
```

## Details

`updateBy` and `deleteBy` still require `where`, because a missing one would rewrite or delete every row. `count` also still requires `where` when `isStrict.requestSchema` is set, which is the default:

```
GET /products/count            -> 400
GET /products/count?where=     -> 400
GET /products/count?where={}   -> 200
```

Set `isStrict: { requestSchema: false }` on the controller, or override `count`'s query with `WhereQuerySchema`, if you want a bare count to work.

See [Filter System - Application usage](/references/base/filter-system/application-usage).
