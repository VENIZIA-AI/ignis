---
title: devz codemod const-classes writes no comment above the class
description: "devz codemod const-classes no longer writes a doc comment above each class it creates."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-11-03

## devz codemod const-classes writes no comment above the class

<Badge type="warning" text="Behavior Change" />

**In one line.** `devz codemod const-classes --write` no longer writes a `/** The values of ... */` comment above each class it creates.

## What changed

- **No comment above the class.** The comment only repeated the type name, so it had to be removed by hand after each run. There is no flag. Class names, members, `SCHEME_SET`, `isValid` and the `TConstValue` type are the same.
- **Your own comment stays.** A comment you wrote on the type alias stays with the alias, as before.

## Who is affected

- **Anyone who removed the generated comment by hand.** You can stop.
- **A project that wants a comment above a generated class.** Add it yourself after the run.

## Details

```typescript
// before: the codemod wrote this line above the class
/** The values of `TMode`. */
export class Modes {
  static readonly READ = 'read';
  // ...
}

// now: the class starts at `export class`
export class Modes {
  static readonly READ = 'read';
  // ...
}
```
