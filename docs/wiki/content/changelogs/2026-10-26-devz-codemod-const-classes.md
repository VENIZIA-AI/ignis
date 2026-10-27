---
title: devz codemod const-classes Turns a String-Literal Union Into a Const Class
description: "A new devz codemod rewrites a string-literal union in an exported type or interface property as a const class with SCHEME_SET and isValid plus TConstValue. It proposes the names, a mapping file overrides them, and the values stay the same."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-26

## devz codemod const-classes

<Badge type="tip" text="Feature" />

**In one line.** The `venizia/const-class-values` lint rule asks for a const class instead of a union of string literals in an exported declaration. `devz codemod const-classes` writes that class for you. Ships in 0.4.4.

```bash
bunx devz codemod const-classes src                     # dry run: prints each proposed class and member names
bunx devz codemod const-classes src --emit-map names.json   # write the proposals to a file you can edit
bunx devz codemod const-classes src --write --map names.json  # apply, with your names
bunx devz codemod const-classes src --check             # dry run that exits 1 while a union remains (CI)
```

## What it converts

```typescript
// before
export type TMode = 'read-only' | 'write';

// after
/** The values of `TMode`. */
export class Modes {
  static readonly READ_ONLY = 'read-only';
  static readonly WRITE = 'write';

  static readonly SCHEME_SET = new Set<string>([this.READ_ONLY, this.WRITE]);

  static isValid(value: string): value is TMode {
    return this.SCHEME_SET.has(value);
  }
}

export type TMode = TConstValue<typeof Modes>;
```

- **An exported type alias** of two or more string literals (a `null` or `undefined` member stays: `TConstValue<typeof Modes> | null`).
- **A property of an exported interface or object type alias**: `interface IOptions { storage: 'memory' | 'disk' }` gets a class `OptionsStorages` and a type `TOptionsStorage` above the interface, and the property uses the type.
- **The values do not change**, so every existing literal still type-checks and no call site is edited. `TConstValue` is imported from `@venizia/ignis-helpers/common` (change it with `--import-from`), or reused when the file already imports it.

## How it names things

The class is the type name without its leading `T`, in the plural (`TQueueReason` gives `QueueReasons`, `TStatus` gives `Statuses`). A member is the value in upper snake case (`read-only` and `readOnly` give `READ_ONLY`, `string[]` gives `STRING_ARRAY`). The dry run prints every proposal with an id such as `src/a.ts#TMode` (or `src/a.ts#IOptions.storage`). Override a name in a JSON file and pass it with `--map`:

```json
{
  "src/a.ts#TMode": { "class": "FileModes", "members": { "read-only": "READONLY" } },
  "src/a.ts#IOptions.storage": { "type": "TStorageKind", "class": "StorageKinds" },
  "src/b.ts#TOther": { "skip": true }
}
```

## What it leaves alone

- **A union it cannot name.** In a parameter, a return type, a generic constraint or a nested type there is no declaration to rename. It is reported with its line and left untouched; `--check` exits 1 while one remains. Write that class by hand.
- **Key sets**: arguments of `Pick`, `Omit`, `Extract`, `Exclude` and `Record`, and the keys of a mapped type. They are not enumerable values, and the lint rule skips them too.
- **A name already used in the file**, two values that give the same member, a value that would become `SCHEME_SET`: reported, with the id to put in the mapping file.
- **A declaration that is not exported**, a union with a non-literal member, and test files (unless `--include-tests`).

## Options

| Option | Meaning |
|---|---|
| `--write` | Write the changed files. Without it, nothing is written |
| `--check` | Dry run that exits 1 while a union can be converted or is left untouched |
| `--map <file>` | JSON overrides keyed by the id the dry run prints |
| `--emit-map <file>` | Write the proposals as a mapping file to edit |
| `--import-from <module>` | Where `TConstValue` comes from (default `@venizia/ignis-helpers/common`) |
| `--include-tests` | Also convert test files |
| `--help` | Print the usage and exit 0 |

An unknown option, `--write` with `--check`, a missing value or a mapping file that cannot be read exits 2 and writes nothing.

## Who is affected

Nobody has to do anything. Run it when the lint reports `venizia/const-class-values` warnings. Run your typecheck and `bun fmt` after `--write`: the codemod writes the class in the repository's shape, and the formatter settles line width. On the sources of three IGNIS packages as they were before the const-class sweep (kernel, connectors, helpers), it proposed 14 conversions and reported 23 unions it cannot name.
