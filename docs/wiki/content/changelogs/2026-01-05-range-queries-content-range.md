---
title: Range Queries & Content-Range Header
description: find() can return the data together with its start, end and total, ready for an HTTP Content-Range header.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-01-05

## Range Queries & Content-Range Header

**In one line.** Pass `shouldQueryRange: true` to `find()` and get the rows and the total count in one call, in the shape of the HTTP Content-Range standard.

## What changed

- **`shouldQueryRange` option.** `find()` returns `{ data, range }` instead of an array. The count runs in parallel with the data query.
- **`TDataRange` type.** `{ start, end, total }`, with `start` and `end` 0-based and inclusive.

```typescript
const { data, range } = await userRepo.find({
  filter: { limit: 10, skip: 20 },
  options: { shouldQueryRange: true }
});

const contentRange = data.length > 0
  ? `records ${range.start}-${range.end}/${range.total}`
  : `records */${range.total}`;

res.setHeader('Content-Range', contentRange);
// -> "records 20-29/100"
```

## Who is affected

- **Everyone.** No action needed. Without the option, `find()` still returns an array.

## Details

- To let browser clients read the header, also set `Access-Control-Expose-Headers: Content-Range`.
- A `CONTENT_RANGE` header constant is available in `@venizia/ignis-helpers`.
- See [Fields, Order & Pagination](/references/base/filter-system/fields-order-pagination).
