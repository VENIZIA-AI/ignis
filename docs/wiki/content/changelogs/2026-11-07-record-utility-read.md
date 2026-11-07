---
title: RecordUtility.read, a safe deep read that answers undefined
description: "RecordUtility.read({ value, path }) reads along an array of keys and answers undefined when a step is missing, null or not an object, reading own properties only."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-07

## RecordUtility.read, a safe deep read that answers undefined

<Badge type="tip" text="Feature" />

**In one line.** Code that reads an unknown payload no longer needs a try/catch or its own reader: `RecordUtility.read({ value, path })` answers the value at the path, or `undefined`.

## What changed

- **`RecordUtility.read({ value, path })`** in `@venizia/ignis-helpers` and `@venizia/ignis-helpers/core`. `path` is an array of keys; a number reads an array index.
- **Answers `undefined`** when any step is missing, `null` or not an object. `ParseUtility.getDeepProperty` throws on a `null` step; it is unchanged.
- **Own properties only.** `__proto__`, `constructor`, `toString` and the like are never found through the prototype, so a path taken from input cannot reach the prototype chain. A key that the data itself owns, such as one parsed from JSON, is read.
- **Empty path.** Answers `value` itself. The answer is `unknown`: narrow it with a guard.

```ts
const city = RecordUtility.read({ value: payload, path: ['user', 'address', 'city'] });

if (typeof city === 'string') {
  // ...
}
```

## Who is affected

Nobody needs to act. It adds a method.

## Details

| File | Package |
|------|---------|
| `src/utilities/record.utility.ts` | helpers |
