---
title: devz codemod drop-redundant-casts Removes the as Casts the Compiler No Longer Needs
description: "A new devz codemod takes out an as X cast only when the package still typechecks without it. It checks the package in batches, not once per cast, is a dry run by default, and reports how many casts stayed and why."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-26

## devz codemod drop-redundant-casts

<Badge type="tip" text="Feature" />

**In one line.** Many `as X` casts were written when a type was loose and stayed after the type improved. `devz codemod drop-redundant-casts` removes the ones the compiler no longer needs, and keeps the rest. Ships in 0.4.4.

```bash
bunx devz codemod drop-redundant-casts src            # dry run: lists what it would remove, writes nothing
bunx devz codemod drop-redundant-casts src --write    # removes them
bunx devz codemod drop-redundant-casts src --check    # dry run that exits 1 while a removable cast remains (CI)
bun check                                             # then your own typecheck
```

## How it decides

- **A removal is kept only if the package still typechecks.** The codemod loads the package's `tsconfig.json`, removes the casts in memory, and compares the compiler's errors with the errors the package had before. Errors that were already there are ignored.
- **It checks in batches.** All casts of a package are tried together. When new errors appear, their places name the casts to blame; the casts it cannot name are tried in halves until the breaking ones stand alone. The package is checked a handful of times, not once per cast, and the compiler only revisits the files a change reaches. On `packages/connectors/src/relational/core` (59 casts) it checked the package 9 times.
- **What it never touches.** `as const`, `as unknown`, `x as unknown as T` (a deliberate escape), and a cast of an `any` or `unknown` expression: there the cast is the only type the value has. Test files are skipped unless you pass `--include-tests`.
- **Nested casts** are handled in rounds: the outer cast first, then the inner one.
- **Imports** that a removal leaves unused are dropped. An import that was already unused is left alone.
- **The report** lists, per file, how many casts it removed and how many stayed, and why (`needed`, `as-const`, `double-cast`, `unknown-target`, `any-expression`, `unknown-expression`, `test-file`, `not-in-project`).

## Options

| Option | Meaning |
|---|---|
| `--write` | Write the changed files. Without it, nothing is written |
| `--check` | Dry run that exits 1 while a removable cast remains |
| `--project <tsconfig>` | The tsconfig to check against. Default: the nearest `tsconfig.json` of each file |
| `--include-tests` | Also try casts in test files |
| `--help` | Print the usage and exit 0 |

An unknown option, or `--write` with `--check`, exits 2 and writes nothing. Like `model-settings`, it reads the files git knows (tracked, or untracked and not ignored).

## Who is affected

Nobody has to do anything. Run it when the lint reports `consistent-type-assertions` warnings: on a slice of the connectors package it removed 20 of 59 casts and the package still typechecked. A removal can change a type without breaking anything (a cast that widened a value to a base type now leaves the narrower type); read the diff, then run your own typecheck. It uses the `typescript` package your project already has (5 or 6), so its answer can differ from a native `tsgo` check in rare cases: your own typecheck is the last word.
