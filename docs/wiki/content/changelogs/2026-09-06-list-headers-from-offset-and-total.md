---
title: setListHeaders Takes offset + total; toContentRange Is Exported
description: BaseRestController.setListHeaders accepts offset and total beside range, and toContentRange is exported from @venizia/ignis-kernel, so routes stop formatting Content-Range by hand.
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-09-06

## List headers from an offset and a total

<Badge type="tip" text="New Feature" />

**In one line.** A route whose engine reports `offset` and `total` instead of a `TDataRange` can now call `setListHeaders` directly, with no hand-formatted `Content-Range`.

## What changed

- **`BaseRestController.setListHeaders()`** takes `{ context, count }` plus either `{ range }` or `{ offset, total }`. The second form derives the inclusive range with `buildDataRange`.
- **`toContentRange({ range, count })`** is now exported from `@venizia/ignis-kernel`.
- **An empty page** still writes `records */<total>`.
- **`respond()` is unchanged.** Use it when the body is the `{ count, data }` envelope.

```typescript
this.setListHeaders({ context, offset, total, count: hits.length });
return context.json({ found, isFoundExact, hits });
```

## Who is affected

- **Routes that write `Content-Range` themselves.** Replace the formatting with `setListHeaders({ context, offset, total, count })`, or `toContentRange` when only the string is needed.
- **Everyone else.** No action needed.

## Details

- Reference: [Controllers](/references/base/controllers).
