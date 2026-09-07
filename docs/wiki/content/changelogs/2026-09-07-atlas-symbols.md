---
title: Atlas Gains a symbol Tool and a Generated Symbol Table
description: A new generated table records every exported symbol of every package with its kind, one-line signature and source file:line. The Atlas symbol tool answers from it, and search adds a symbol field when the query is one identifier.
---

# Changelog - 2026-09-07

## symbol answers where an export is declared

<Badge type="tip" text="New Feature" />

**In one line.** `symbol` names the package, the import specifier and the exact source `file:line` of any exported symbol.

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

Read `file` and `line` as a source location in this repository. `docs` holds chunk ids for `get`.

## The problem it solves

`search` reads prose. Ask it where `getError` comes from and you get pages that mention the name. Ranking those pages is not the same as naming the declaration. A rename leaves the prose behind, and no page promises its import specifier is current.

The answer already lived in the built `.d.ts`. Nothing read it.

## What changed

- **A generated symbol table.** `make symbols-gen` writes `.agents/knowledge/reference/symbols.json` from every package's built `.d.ts`, the same surface `make surface-gen` snapshots.
- **`file` and `line` name the source.** The generator reads the declaration map beside each `.d.ts`, so a hit points at `packages/<name>/src/...`, not at `dist`.
- **A `symbol` tool.** It answers with one record, or with `matches` when a name exists in more than one package. Pass `package` to narrow it, in either spelling: `helpers` or `@venizia/ignis-helpers`.
- **A typo gets candidates, not silence.** An unknown name answers `unknown symbol 'LoggerFactroy'; did you mean LoggerFactory?`.
- **`search` carries a `symbol` field.** A query that is one identifier the table knows returns the record beside the hits. A prose query does not.
- **`make symbols-check` is a build gate.** It runs inside `make build-all`, next to `surface-check`, and fails when the table drifts from the built surface.

## Who is affected

- **Anyone running `@venizia/ignis-atlas`.** `tools/list` now returns three tools. The npm snapshot ships the table, so `symbol` works from an install.
- **Maintainers of this repository.** Run `make symbols-gen` after an intentional API change, the same habit `surface-gen` already needs. A stale table fails `make build-all`.
- **Everyone else.** No action needed.

## Details

| Symbol | Change | Package |
|---|---|---|
| `symbol` (MCP tool) | New | `@venizia/ignis-atlas` |
| `symbol` field on a `search` reply | New | `@venizia/ignis-atlas` |
| `symbols.json` (generated) | New | `.agents/knowledge/reference` |
| `make symbols-gen`, `make symbols-check` | New | Makefile |

- Extension page: [Atlas](/extensions/atlas/).
