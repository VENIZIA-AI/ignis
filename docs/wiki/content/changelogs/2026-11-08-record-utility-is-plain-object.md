---
title: RecordUtility.isPlainObject, a guard that checks the prototype
description: "RecordUtility.isPlainObject(value) is true only for an object whose prototype is Object.prototype or null, so an Error, a Date, a Map, an array or a foreign-realm object is refused."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-08

## RecordUtility.isPlainObject, a guard that checks the prototype

<Badge type="tip" text="Feature" />

**In one line.** Code that must accept only a literal-shaped object, such as a JSON body or a config, can now use `RecordUtility.isPlainObject(value)`. It refuses a class instance, which `isRecord` and `isPlainRecord` accept.

## What changed

- **`RecordUtility.isPlainObject(value)`** in `@venizia/ignis-helpers` and `@venizia/ignis-helpers/core`. A type guard: it narrows `unknown` to `Record<string, unknown>`.
- **True** for a non-null object whose prototype is exactly `Object.prototype` or `null`: an object literal, `JSON.parse` output and `Object.create(null)`.
- **False** for an array, a class instance (`Error`, `Date`, `Map`), a function, a primitive, an object whose prototype is another object (`Object.create(Object.create(null))`) and an object from another realm, such as one made in `node:vm`.
- **Never throws.** A Proxy whose `getPrototypeOf` trap throws, or a revoked Proxy, answers `false`.
- **Not a change to `isRecord` and `isPlainRecord`.** They still check only the type of the value, so an `Error` still passes them.

```ts
if (RecordUtility.isPlainObject(body)) {
  // body is a Record<string, unknown> made from a literal or JSON, never a class instance
}
```

## Who is affected

Nobody needs to act. It adds a method; no existing call site is changed.

## Details

- An object that only carries its own `Symbol.toStringTag` property is still plain. A class instance that has the tag is not.
- A Proxy is judged by what its `getPrototypeOf` answers, which is its target's prototype unless the trap says otherwise.

| File | Package |
|------|---------|
| `src/utilities/record.utility.ts` | helpers |
