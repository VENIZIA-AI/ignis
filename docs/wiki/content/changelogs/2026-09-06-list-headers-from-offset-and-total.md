---
title: setListHeaders Takes offset + total; toContentRange Is Exported
description: BaseRestController.setListHeaders accepts { offset, total, count } beside { range, count } and derives the inclusive range with buildDataRange. toContentRange, the one Content-Range formatter, is exported from @venizia/ignis-kernel. Routes that formatted the header by hand delete the copy.
---

# Changelog - 2026-09-06

## List headers from an offset and a total

<Badge type="tip" text="New Feature" />

**In one line.** A route whose engine reports `offset` and `total` instead of a `TDataRange` now calls `setListHeaders` directly, and nobody formats `Content-Range` by hand again.

```typescript
this.setListHeaders({ context, offset, total, count: hits.length });
return context.json({ found, isFoundExact, hits });
```

## The problem it solves

`setListHeaders` took only a repository `TDataRange`. A search engine answers with an offset and a total, so search routes rebuilt the header string themselves: three copies of the same five lines in one consumer, each a place for the inclusive-end rule to drift.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `BaseRestController.setListHeaders()` | Options are `{ context, count }` plus either `{ range }` or `{ offset, total }`; the second form derives the range with `buildDataRange` | kernel |
| `toContentRange({ range, count })` | Exported from `@venizia/ignis-kernel` (was module-private) | kernel |

- An empty page still writes `records */<total>`.
- `respond()` is unchanged; use it when the body is the `{ count, data }` envelope.

## Who is affected

- **Routes that write `Content-Range` themselves.** Replace the formatting with `setListHeaders({ context, offset, total, count })`, or `toContentRange` when only the string is needed.
- **Everyone else.** No action needed.

## Details

- Reference: [Controllers](/references/base/controllers).
