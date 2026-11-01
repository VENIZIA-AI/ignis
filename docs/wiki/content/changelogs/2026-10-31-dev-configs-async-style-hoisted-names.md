---
title: The async-style codemod no longer reuses a hoisted name
description: "devz codemod async-style gives every hoisted const a name that is unique in its function, and leaves a file as it was when the rewrite would be worse."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-31

## The async-style codemod no longer reuses a hoisted name

<Badge type="info" text="Bug Fix" />

**In one line.** `devz codemod async-style` could give two hoisted `const result` the same name in one function, which breaks the code or, when an inner one shadows an outer one, changes what it does; it does not any more.

## What changed

- **Unique names.** The two rules that hoist an `await` (`no-inline-await`, `no-return-await`) now share their names in one lint pass. Each hoisted const gets `result`, `result2`, `result3` and so on, unique in the whole function (nested functions and blocks included), and the expression it replaces uses exactly that name.
- **A self-check.** After the fixers run, the codemod compares the file with the original on four scope rules (redeclared names, shadowed names, use before declaration, unused variables). If the rewrite has more of any, the file is left as it was and listed as `self-check` for you to fix by hand. `--check` exits 1 for it.

## Who is affected

- **Anyone who ran `devz codemod async-style --write` from `@venizia/dev-configs` 0.4.7-0.** Run `tsc`/`bun check` on what it changed: a duplicate or unused name is a compile error. A swap between two names that were both already in scope compiles; search the changed files for a `const result...` that is declared in a nested block while a same-named const of the block around it is read in that block. Update to this version before running the codemod again.
- **Everyone else.** No action needed.
