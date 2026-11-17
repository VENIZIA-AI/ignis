---
title: RecordUtility type guards are public in helpers
description: "RecordUtility.isRecord and RecordUtility.isPlainRecord narrow an unknown value to a record, with and without arrays. Both are exported from @venizia/ignis-helpers and @venizia/ignis-helpers/core."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## RecordUtility type guards are public in helpers

<Badge type="tip" text="New Feature" />

**In one line.** `RecordUtility.isRecord(value)` and `RecordUtility.isPlainRecord(value)` narrow an `unknown` value, such as a wire payload, to `Record<string, unknown>`. A project no longer needs its own copy of the guard.

## What changed

- **A public class.** `RecordUtility` is exported from `@venizia/ignis-helpers` and from `@venizia/ignis-helpers/core`, so a browser bundle can use it. It has no node import.
- **Two meanings, two methods.** `isRecord` accepts any non-null object, arrays included. `isPlainRecord` accepts a non-null object that is not an array. A class instance such as an `Error` or a `Date` passes both; a function and every primitive pass neither.
- **One guard inside IGNIS.** The search connectors and the scope write guard each kept a private copy; they now call these two, with the meaning each copy had before, so nothing behaves differently.

## Who is affected

- **Code with its own `isRecord` helper.** It can import these.
- **Everyone else.** No action needed.

## Details

```ts
import { RecordUtility } from '@venizia/ignis-helpers/core';

const objects = payload.filter(RecordUtility.isPlainRecord); // Record<string, unknown>[]
```

| File | Package |
|------|---------|
| `src/utilities/record.utility.ts` | helpers |
| `src/core.ts`, `src/utilities/index.ts` | helpers |
