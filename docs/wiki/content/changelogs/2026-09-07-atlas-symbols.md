---
title: Atlas Gains a symbol Tool and a Generated Symbol Table
description: The Atlas symbol tool answers where an export is declared, with its package, import specifier, kind, signature and source file:line, and search adds a symbol field for a single identifier.
packages: ['@venizia/ignis-atlas']
---

# Changelog - 2026-09-07

## symbol answers where an export is declared

<Badge type="tip" text="New Feature" />

**In one line.** `symbol` names the package, the import specifier and the exact source `file:line` of any exported symbol.

## What changed

- **A `symbol` tool.** It answers with one record, or with `matches` when a name exists in more than one package. Pass `package` to narrow it, in either spelling: `helpers` or `@venizia/ignis-helpers`.
- **`file` and `line` name the source** (`packages/<name>/src/...`), not `dist`. `docs` holds chunk ids for `get`.
- **A typo gets candidates, not silence.** An unknown name answers `unknown symbol 'LoggerFactroy'; did you mean LoggerFactory?`.
- **`search` carries a `symbol` field.** A query that is one identifier the table knows returns the record beside the hits. A prose query does not.
- **The symbol table ships with the npm snapshot,** so `symbol` works from an install.

Call it with a name, and a package when the name is not unique:

```json
{ "name": "getError", "package": "inversion" }
```

```json
{
  "name": "getError",
  "package": "@venizia/ignis-inversion",
  "subpath": ".",
  "specifier": "@venizia/ignis-inversion",
  "kind": "const",
  "file": "packages/inversion/src/modules/error/app-error.ts",
  "line": 89,
  "signature": "getError: (opts: TError) => ApplicationError",
  "docs": ["wiki:extensions/helpers/error/index.md#in-one-example"]
}
```

## Who is affected

- **Anyone running `@venizia/ignis-atlas`.** `tools/list` now returns three tools.
- **Everyone else.** No action needed.

## Details

- Extension page: [Atlas](/extensions/atlas/).
