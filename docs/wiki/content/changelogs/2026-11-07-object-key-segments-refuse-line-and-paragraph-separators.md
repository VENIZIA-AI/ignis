---
title: Object keys and bucket names refuse the line and paragraph separators
description: "isValidSegment, isValidObjectKey and isValidBucketName refuse U+2028 and U+2029 too, so the storage name rules and the connectors' echo rules agree."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-07

## Object keys and bucket names refuse the line and paragraph separators

<Badge type="info" text="Bug Fix" />

**In one line.** A key or bucket name could still hold U+2028 (line separator) or U+2029 (paragraph separator), which break a line in a log or a header. They are refused now.

## What changed

- **Segments.** `isValidSegment` (and so `isValidObjectKey`, `isValidBucketName` and `isValidOriginalName`) refuses U+2028 and U+2029, next to the control characters and bidirectional marks it already refused.

## Who is affected

- **Keys that held one of those two characters.** They are refused on the next call; rename them.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/modules/storage/base.ts` | helpers |
