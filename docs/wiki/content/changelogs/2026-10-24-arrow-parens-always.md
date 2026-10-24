---
title: Arrow Functions Always Carry Parentheses
description: "The repository format sets arrowParens to always, so a single-parameter arrow is written (x) => x; the whole repository is reformatted once."
packages: []
---

# Changelog - 2026-10-24

## Arrow functions always carry parentheses

<Badge type="tip" text="Enhancement" />

**In one line.** `arrowParens` in the root `bunfig.toml` `[fmt]` table is `"always"`: `(x) => x`, never `x => x`.

```toml
[fmt]
printWidth = 100
singleQuote = true
arrowParens = "always"
flavor = "oxfmt"
```

## What changed

- **The format.** `arrowParens` was `"avoid"`. The other keys are unchanged.
- **One reformat.** Every file `bun fmt` covers was reformatted once.

## Who is affected

- **Contributors.** Run `make lint-fix`; a single-parameter arrow without parentheses fails `make lint-all`.
- **Downstream projects that copy the `[fmt]` table.** Change `arrowParens` to `"always"` to match; nothing else depends on it.
