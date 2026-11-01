---
title: Parse Utility
description: Type checking, safe numeric and boolean conversion, camelCase transforms, and array-to-map helpers
difficulty: beginner
lastUpdated: 2026-10-30
---

# Parse Utility

`ParseUtility` is a class of static methods for type checking, safe type conversion, and string/object/array transformation - the small helpers repositories and controllers reach for when normalizing loosely typed input. Every method takes one options object.

The old function names (`int`, `float`, `toBoolean`, ...) are removed. `devz codemod namespace-functions` moves your calls to the class form.

## In one example

```typescript
import { ParseUtility } from '@venizia/ignis-helpers';

const myInt = ParseUtility.toInt({ input: '1,000' }); // => 1000
const myFloat = ParseUtility.toFloat({ input: '1,234.567', digit: 2 }); // => 1234.57
const myBool = ParseUtility.toBoolean({ input: 'true' }); // => true

const camelObject = ParseUtility.keysToCamel({
  source: { 'first-name': 'John', last_name: 'Doe' },
});
// => { firstName: 'John', lastName: 'Doe' }
```

## Methods

| Method | Signature | What it does |
|--------|-----------|---------------|
| `isInt` | `isInt({ input: any }): boolean` | `true` when `input` is (or coerces to) an integer. |
| `isFloat` | `isFloat({ input: any }): boolean` | `true` when `input` is (or coerces to) a non-integer number. |
| `toInt` | `toInt({ input: any }): number` | Parses `input` to an integer. Strips commas first; returns `0` for empty/invalid input. |
| `toFloat` | `toFloat({ input: any, digit?: number }): number` | Parses `input` to a float, rounded to `digit` places (default `2`). Strips commas first; returns `0` for empty/invalid input. |
| `toBoolean` | `toBoolean({ input: any }): boolean` | `false` for `''`, `'false'`, `'0'`, `false`, `0`, `null`, `undefined`; `true` for everything else. |
| `toCamel` | `toCamel({ input: string }): string` | Converts a `snake_case` or `kebab-case` string to `camelCase`. |
| `keysToCamel` | `keysToCamel({ source: object }): any` | Recursively camelizes every key in `source`. Arrays stay arrays (their object elements are still camelized); `Date` values pass through untouched. |
| `parseArrayToMapWithKey` | `parseArrayToMapWithKey<T, K>({ items: T[], key: K }): Map<T[K], T>` | Turns an array of objects into a `Map` keyed by `key`. Throws if `key` is missing from an element; last element wins on duplicate keys. |
| `toDelimitedArray` | `toDelimitedArray({ input: unknown, separator?: string }): string[]` | Splits `input` on `separator` (default `,`) into trimmed, non-empty entries. `null`/`undefined` input returns `[]`. |
| `blankToUndefined` | `blankToUndefined({ input: string \| undefined }): string \| undefined` | Trims `input` and returns `undefined` when nothing is left, so a blank value reads as unset. Otherwise returns the trimmed string. |
| `toTrimmed` | `toTrimmed({ input: unknown }): string` | Stringifies and trims `input`; `null`/`undefined` returns `''`. |
| `getDeepProperty` | `getDeepProperty<T, V>({ source: T, path: string }): V` | Reads a dotted path (`'a.b.c'`) off `source`; throws when a step is `null` or `undefined`. |
| `getUID` | `getUID(): string` | Generates a short, uppercase, `Math.random()`-based ID - not cryptographically unique. |

## Notes

- **`toInt`/`toFloat` are comma-tolerant.** Both strip `,` before parsing, so `'1,000'` and `1000` behave the same - useful for user-typed numeric input.
- **`toDelimitedArray` and `toTrimmed` are the transform functions for list-shaped and string env values** - typical use is `applicationEnvironment.get(KEY, { transform: (input) => ParseUtility.toDelimitedArray({ input }) })`.
- **`blankToUndefined` is what makes `??` work on env values.** `KEY=` in a deployment file is a pipeline that forgot to export the value, but `process.env.KEY` answers `''`, and `''` walks straight past `??`. Write `ParseUtility.blankToUndefined({ input: process.env.KEY }) ?? 'text'`, not `process.env.KEY ?? 'text'`. Reach for it rather than `||`, which reads `'0'` as blank too.
- **`getUID` is for short, human-glanceable identifiers**, not for anything that needs global uniqueness guarantees - use the [UID helper](/extensions/helpers/) (Snowflake-based) for that.
- **`ParseUtility` ships on `/core`** (`@venizia/ignis-helpers/core`) as well as the root, so browser code can use it.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [Schema Utility](/references/utilities/schema) - `snakeToCamel` for Zod schemas built on `ParseUtility.toCamel`/`ParseUtility.keysToCamel`

**Files:**

- [`packages/helpers/src/utilities/parse.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/parse.utility.ts)
