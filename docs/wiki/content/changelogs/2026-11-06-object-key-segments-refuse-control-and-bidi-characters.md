---
title: Object keys and bucket names refuse control and bidirectional characters
description: "isValidSegment, isValidObjectKey and isValidBucketName refuse every control character, a lone surrogate and the bidirectional marks and overrides, the way isValidOriginalName does."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-06

## Object keys and bucket names refuse control and bidirectional characters

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** A key or bucket name could hold a tab, a delete character or a right-to-left override. They are refused now, and the same set applies to original file names.

## What changed

- **Segments.** `isValidSegment` (and so `isValidObjectKey` and `isValidBucketName`) refuses any control character (Unicode category Cc), a lone surrogate, and the bidirectional marks and overrides (U+061C, U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069). It used to refuse only newline, carriage return and NUL.
- **Original names.** `isValidOriginalName` refuses the bidirectional set too.
- **Log line.** The refusal logs the length of the name, not the name.
- **Other text is unchanged.** Names in any script (`ảnh đẹp.png`, `файл.txt`) stay valid.

## Who is affected

- **Keys that held one of those characters.** They are refused on the next call; rename them.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/modules/storage/base.ts` | helpers |
