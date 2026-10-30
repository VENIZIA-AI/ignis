---
title: devz codemod - Dry Run by Default, a Stricter --check, and Two New Codemods
description: "devz codemod is a dry run unless you pass --write, --check fails while a model is left untouched, and the new drop-redundant-casts and const-classes codemods clean up casts and string unions."
packages: ['@venizia/dev-configs', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-26

## devz codemod: dry run by default, a stricter --check, and two new codemods

<Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Feature" />

**In one line.** `devz codemod` only lists what it would change until you add `--write`, `model-settings --check` also fails on models it cannot rewrite, and two new codemods remove needless `as X` casts and turn string-literal unions into const classes. The `--check` change and the two new codemods ship in 0.4.4.

```bash
bunx devz codemod model-settings           # dry run: lists the files, writes nothing
bunx devz codemod model-settings --write   # rewrites them
bunx devz codemod model-settings --check   # dry run that exits 1 if a file would change OR a model is left untouched (CI)
```

## What changed

- **Dry run by default.** Without `--write` nothing is written, and the output ends with a line that says how to apply. `--check` is the same dry run and exits 1 when anything would change. `--write` together with `--check` is refused.
- **Only files git knows are read.** Inside a git repository the codemod reads tracked files plus untracked files git does not ignore, so ignored folders and worktrees are never rewritten. A nested repository is skipped too. Outside git it skips every dot-directory as well as `node_modules`, `dist` and `build`. Pass a path explicitly (`devz codemod model-settings src/models`) to run on a folder; a path that git ignores, or that holds no source files, is reported as such and nothing is read.
- **`--check` exits 1 for a left-untouched model.** A variable `settings`, a spread or a shorthand key used to exit 0 while the model throws a "removed settings key" error at boot. `--check` now fails on those too. Without a flag, and with `--write`, the exit code is unchanged (0).
- **`@model(options)` is reported, and aliases are read.** A `@model` call whose argument is a variable or a call is listed with its file and line as left untouched. `import { model as m } from '@venizia/ignis'` with `@m({ ... })`, and `import * as ignis from '@venizia/ignis-kernel'` with `@ignis.model({ ... })`, are migrated like `@model`. An alias imported from any other package is ignored.
- **`--help` and unknown flags.** `--help` and `-h` print the usage and exit 0 without reading or writing. An unknown flag (`--halp` used to be read as a path, and the command wrote files) prints the usage, exits 2 and writes nothing. An unknown codemod name also exits 2 (it was 1).
- **`devz clean --help` no longer deletes.** It used to remove `dist` and the `*.tsbuildinfo` files. `--help` and `-h` print the usage and exit 0; any other argument exits 2 and deletes nothing. `devz` and `devz --help` print the command list and exit 0.
- **The decorator error says `--write`.** The message a model throws for a removed settings key reads `run 'devz codemod model-settings --write' to rewrite them`.

## `devz codemod drop-redundant-casts`

Removes the `as X` casts the compiler no longer needs, and keeps the rest.

```bash
bunx devz codemod drop-redundant-casts src            # dry run: lists what it would remove, writes nothing
bunx devz codemod drop-redundant-casts src --write    # removes them
bunx devz codemod drop-redundant-casts src --check    # dry run that exits 1 while a removable cast remains (CI)
```

- **A removal is kept only if the package still typechecks.** The codemod loads the package's `tsconfig.json` and compares the compiler's errors with the errors the package had before. Errors that were already there are ignored.
- **It never touches** `as const`, `as unknown`, `x as unknown as T`, or a cast of an `any` or `unknown` expression. Test files are skipped unless you pass `--include-tests`.
- **Imports** that a removal leaves unused are dropped. An import that was already unused is left alone.
- **The report** lists, per file, how many casts it removed and how many stayed, and why.
- **Options:** `--write`, `--check`, `--project <tsconfig>` (default: the nearest `tsconfig.json` of each file), `--include-tests`, `--help`. An unknown option, or `--write` with `--check`, exits 2 and writes nothing.
- **Read the diff, then run your own typecheck.** A removal can change a type without breaking anything (a cast that widened a value to a base type now leaves the narrower type). The codemod uses the `typescript` package your project already has (5 or 6), so its answer can differ from a native `tsgo` check in rare cases.

## `devz codemod const-classes`

Writes the const class that the `venizia/const-class-values` lint rule asks for, in place of a string-literal union in an exported type or in a property of an exported interface or object type alias. The values do not change, so every existing literal still type-checks and no call site is edited.

```bash
bunx devz codemod const-classes src                     # dry run: prints each proposed class and member names
bunx devz codemod const-classes src --emit-map names.json   # write the proposals to a file you can edit
bunx devz codemod const-classes src --write --map names.json  # apply, with your names
bunx devz codemod const-classes src --check             # dry run that exits 1 while a union remains (CI)
```

```typescript
// before
export type TMode = 'read-only' | 'write';

// after: a class Modes with READ_ONLY and WRITE, SCHEME_SET and isValid
export type TMode = TConstValue<typeof Modes>;
```

- **Naming.** The class is the type name without its leading `T`, in the plural (`TQueueReason` gives `QueueReasons`). A member is the value in upper snake case (`read-only` gives `READ_ONLY`). Override a name in a JSON file keyed by the id the dry run prints (`src/a.ts#TMode`, `src/a.ts#IOptions.storage`) and pass it with `--map`; `{ "skip": true }` skips an entry.
- **`TConstValue`** is imported from `@venizia/ignis-helpers/common` (change it with `--import-from`), or reused when the file already imports it.
- **Left alone and reported:** a union in a parameter, a return type, a generic constraint or a nested type (write that class by hand; `--check` exits 1 while one remains); key sets (`Pick`, `Omit`, `Extract`, `Exclude`, `Record` arguments, mapped-type keys); a name already used in the file, two values that give the same member, or a value that would become `SCHEME_SET`. Declarations that are not exported, unions with a non-literal member, and test files (unless `--include-tests`) are skipped.
- **Options:** `--write`, `--check`, `--map <file>`, `--emit-map <file>`, `--import-from <module>`, `--include-tests`, `--help`. An unknown option, `--write` with `--check`, a missing value or a mapping file that cannot be read exits 2 and writes nothing.
- **Run your typecheck and `bun fmt` after `--write`.**

## Who is affected

- **Anyone who ran `devz codemod model-settings` expecting it to write.** Add `--write`.
- **A CI job that runs `--check` and has models the codemod cannot rewrite.** It fails now, and the report names each file and line. Fix those models by hand with the [mapping table](/changelogs/2026-10-26-remove-deprecated-model-settings#migrate), then run `--check` again.
- **Everyone else.** Run the two new codemods when the lint reports `consistent-type-assertions` or `venizia/const-class-values` warnings.
