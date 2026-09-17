---
title: lodash Is Gone
description: "Five functions across 31 call sites, for 24 KB. isEmpty and omit now live in inversion; get, set and round were replaced where they were used."
---

# Changelog - 2026-09-17

## No IGNIS package depends on lodash

<Badge type="tip" text="Fix" />

| Function | Call sites | Replaced by |
|---|---|---|
| `isEmpty` | 20 | `isEmpty` in `@venizia/ignis-inversion` |
| `omit` | 8 | `omit` in `@venizia/ignis-inversion` |
| `get` | 1 | plain indexing - the key came from `Object.keys`, never a path |
| `set` | 1 | plain assignment - drizzle's `columns` is a flat map |
| `round` | 1 | a local exponent-shift round |

Both shared functions are re-exported from `@venizia/ignis-helpers/common`, so nothing outside
inversion imports them by a new path.

## `isEmpty` is not `!value`, and that is the whole point

```ts
isEmpty({});   // true
!{};           // false
```

Three cases were actual mismatches while writing it, each kept as a test:

- **An empty object.** A falsy check calls it non-empty and takes the other branch. Twenty call
  sites were swapped; two of them pass an object.
- **An inherited key.** `for...in` walks the prototype chain, so `Object.create({ a: 1 })` looked
  non-empty.
- **`{ length: 0 }`.** Duck-typing on `.length` calls it empty. It is not - it has an own key.

The implementation was diffed against lodash across 40 values before any call site changed: strings,
arrays, typed arrays, `Map`, `Set`, `Date`, `RegExp`, functions, class instances, symbols, bigints,
`Buffer`, `ArrayBuffer`, `Promise`, `WeakMap`. Zero disagreements.

`round` has one deliberate difference: a result of negative zero is normalised to `0`. Checked across
114 value/precision pairs, the sign of zero was the only disagreement, and `-0 === 0` is `true` while
both stringify and serialise identically.

## Measured

| Entry | Before | After |
|---|---|---|
| `@venizia/ignis-helpers/core` | 20.8 KB gzipped | **17.2 KB** |
| `@venizia/ignis-kernel/metadata` | 14.9 KB | **14.0 KB** |

A guard test fails if `lodash` reaches the container, the metadata entry or the utilities barrel.
One `import isEmpty from 'lodash/isEmpty'` brings the whole library back, and nothing else in the
build would notice.

## Who is affected

**Nobody, at the API.** Same behaviour, same exports. `isEmpty` and `omit` are now available from
`@venizia/ignis-helpers/common` if you want them.

**Files:**

- [`packages/inversion/src/common/utilities.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/utilities.ts) - `isEmpty`, `omit`
- [`packages/inversion/src/__tests__/object-utilities.test.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/__tests__/object-utilities.test.ts) - the cases that were mismatches
