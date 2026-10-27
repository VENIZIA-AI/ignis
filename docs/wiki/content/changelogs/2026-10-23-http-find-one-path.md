---
title: The HTTP Repository Can Call the find-one Route
description: 'HttpRepository takes an opt-in findOnePath, so findOne reads GET /<resource>/find-one, the route defineCrudController generates, instead of asking the list route for one row.'
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-23

## The HTTP repository can call the find-one route

<Badge type="tip" text="Enhancement" />

**In one line.** Pass `findOnePath: 'find-one'` and `findOne` reads the route `defineCrudController` generates, the way `countPath` already names the count route.

```typescript
super({ dataSource, resource: 'products', findOnePath: 'find-one' });

const product = await productRepository.findOne({ filter: { where: { sku: 'LAMP-1' } } });
// GET /products/find-one?filter=...  ->  the row, or null
```

## What changed

- **`findOnePath` option.** Named, `findOne` asks `GET /<resource>/<findOnePath>` with the filter in the query string and returns the row. The route answers a missing row with HTTP 200 and no row, so `findOne` returns `null`, never an error.
- **Off by default.** Without it `findOne` asks the list route for one row, as before. A backend that is not an IGNIS controller may not have the route.
- **`query` still applies.** The caller's extra `query` and the `buildQuery` hook reshape this route like every other read.

## Who is affected

- **Everyone.** No action needed; nothing changes until you pass `findOnePath`.

| File                     | Package    |
| ------------------------ | ---------- |
| `src/http/repository.ts` | connectors |
