---
title: Two Query Shapes You No Longer Have to Rebuild
description: FilterQuerySchema and WhereQuerySchema replace the query object every custom route was rebuilding by hand.
---

# Changelog - 2026-08-24

## FilterQuerySchema and WhereQuerySchema

<Badge type="tip" text="New API" />
<Badge type="tip" text="Enhancement" />

**In one line.** The query shape every list route takes now has a name, so a custom route names it instead of rebuilding it.

## What changed

Two composed schemas ship from `@venizia/ignis`:

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

Both are plain Zod objects, so a route that takes more than one parameter extends rather than rebuilds:

```typescript
request: { query: WhereQuerySchema.extend({ q: z.string().max(255).optional() }) },
```

The generated `find`, `findById` and `findOne` routes now use `FilterQuerySchema` too, so the framework and your own routes describe the same shape.

## The `.optional()` you were adding did nothing

`FilterSchema` already ends with `.optional()`. A second one is the same schema written longer, and `.partial()` on a single optional key does nothing either. These three accept exactly the same requests:

```typescript
z.object({ filter: FilterSchema })
z.object({ filter: FilterSchema.optional() })
z.object({ filter: FilterSchema.optional() }).partial()
```

So if you are overriding `find`, `findById` or `findOne` only to make `filter` optional, delete the override. The framework default already behaves that way, and it carries an OpenAPI description your override was replacing with nothing.

`WhereSchema` is different - it carries no `.optional()`, which is why `WhereQuerySchema` adds one.

## Who is affected

- **Existing applications.** Nothing breaks. This is additive, and the factory refactor changes no behavior.
- **Anyone overriding a `find` route's query.** Check whether the override still earns its place.

## Two routes that deliberately do not use these

`updateBy` and `deleteBy` still require `where`. A missing one rewrites or deletes every row in the table, so the requirement is a guard rather than an oversight.

`count` also still requires `where` when `isStrict.requestSchema` is set, which is the default:

```
GET /products/count            -> 400
GET /products/count?where=     -> 400
GET /products/count?where={}   -> 200
```

That is unchanged in this release. Set `isStrict: { requestSchema: false }` on the controller, or override `count`'s query with `WhereQuerySchema`, if you want a bare count to work.

See [Filter System - Application usage](/references/base/filter-system/application-usage) for the full examples.
