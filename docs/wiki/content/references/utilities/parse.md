---
title: Parse Utility
description: Type checking, safe numeric and boolean conversion, camelCase transforms, and array-to-map helpers
difficulty: beginner
lastUpdated: 2026-07-16
---

# Parse Utility

A collection of standalone functions for type checking, safe type conversion, and string/object/array transformation - the small helpers repositories and controllers reach for when normalizing loosely typed input.

## In one example

```typescript
import { int, float, toBoolean, toCamel, keysToCamel } from '@venizia/ignis-helpers';

const myInt = int('1,000'); // => 1000
const myFloat = float('1,234.567', 2); // => 1234.57
const myBool = toBoolean('true'); // => true

const camelObject = keysToCamel({ 'first-name': 'John', 'last_name': 'Doe' });
// => { firstName: 'John', lastName: 'Doe' }
```

## Functions

| Function | Signature | What it does |
|----------|-----------|---------------|
| `isInt` | `isInt(n: any): boolean` | `true` when `n` is (or coerces to) an integer. |
| `isFloat` | `isFloat(input: any): boolean` | `true` when `input` is (or coerces to) a non-integer number. |
| `int` | `int(input: any): number` | Parses `input` to an integer. Strips commas first; returns `0` for empty/invalid input. |
| `float` | `float(input: any, digit = 2): number` | Parses `input` to a float, rounded to `digit` places (via lodash `round`). Strips commas first; returns `0` for empty/invalid input. |
| `toBoolean` | `toBoolean(input: any): boolean` | `false` for `''`, `'false'`, `'0'`, `false`, `0`, `null`, `undefined`; `true` for everything else. |
| `toCamel` | `toCamel(s: string): string` | Converts a `snake_case` or `kebab-case` string to `camelCase`. |
| `keysToCamel` | `keysToCamel(object: object): any` | Recursively camelizes every key in `object`. Arrays stay arrays (their object elements are still camelized); `Date` values pass through untouched. |
| `parseArrayToMapWithKey` | `parseArrayToMapWithKey<T, K>(arr: T[], keyMap: K): Map<T[K], T>` | Turns an array of objects into a `Map` keyed by `keyMap`. Positional arguments, not an options object. Throws if `keyMap` is missing from an element; last element wins on duplicate keys. |
| `toDelimitedArray` | `toDelimitedArray(input: unknown, separator = ','): string[]` | Splits `input` on `separator` into trimmed, non-empty entries. `null`/`undefined` input returns `[]`. |
| `toTrimmed` | `toTrimmed(input: unknown): string` | Stringifies and trims `input`; `null`/`undefined` returns `''`. |
| `getUID` | `getUID(): string` | Generates a short, uppercase, `Math.random()`-based ID - not cryptographically unique. |

## Notes

- **`int`/`float` are comma-tolerant.** Both strip `,` before parsing, so `'1,000'` and `1000` behave the same - useful for user-typed numeric input.
- **`parseArrayToMapWithKey` breaks the options-object convention on purpose** - it takes `(arr, keyMap)` positionally, unlike every other function on this page.
- **`toDelimitedArray` and `toTrimmed` are the transform functions for list-shaped and string env values** - typical use is `applicationEnvironment.get(KEY, { transform: toDelimitedArray })`.
- **`getUID` is for short, human-glanceable identifiers**, not for anything that needs global uniqueness guarantees - use the [UID helper](/extensions/helpers/) (Snowflake-based) for that.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [Schema Utility](/references/utilities/schema) - `snakeToCamel` for Zod schemas built on `toCamel`/`keysToCamel`

**Files:**

- [`packages/helpers/src/utilities/parse.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/parse.utility.ts)
