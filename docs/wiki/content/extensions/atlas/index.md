---
title: Atlas
description: The @venizia/ignis-atlas MCP server - search and read the wiki, changelogs and knowledge bundle by section, with a citation on every hit.
---

# Atlas

`@venizia/ignis-atlas` is the MCP server for IGNIS. It answers "what does the manual say" over the wiki, the changelogs and the agent-facing knowledge bundle, from one Bun-only process.

## In one example

Add it to an MCP client's config:

```json
{
  "mcpServers": {
    "ignis-atlas": {
      "command": "bunx",
      "args": ["@venizia/ignis-atlas", "mcp"]
    }
  }
}
```

This runs in snapshot mode: it reads the wiki and the changelogs packaged with the release you installed, not your working tree. Working inside the IGNIS repository itself, point `command` at the checkout instead - see `.mcp.json` at the repository root:

```json
{
  "mcpServers": {
    "ignis-atlas": {
      "command": "bun",
      "args": ["packages/atlas/src/cli.ts", "mcp"]
    }
  }
}
```

A repository checkout also indexes the knowledge bundle, and re-checks the corpus for changes before every call - a long agent session never answers from a page it has already outlived.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search` | `query` (2+ characters), `corpus?` (`all`, `wiki`, `changelog`, `knowledge`), `limit?` (1-50, default 10), `offset?` | `total`, `returned`, `nextOffset?`, and a page of `hits`: `id`, `corpus`, `title`, `headingPath`, `anchor`, `snippet`, `score` |
| `get` | `id` (from a search hit), `maxChars?` (500-50000, default 8000), `cursor?` | `id`, `title`, `headingPath`, `body`, and `next` when the body continues |
| `symbol` | `name` (an exported symbol), `package?` (`helpers` or `@venizia/ignis-helpers`) | `name`, `package`, `subpath`, `specifier`, `kind`, `file`, `line`, `signature`, `docs`; or `matches` when the name exists in several packages |

Pass a `hits[].id` straight to `get` to read the full section it points at.

The reply-size budget can return fewer hits than `limit`. Page with `offset: nextOffset`, not
`offset + limit` - `nextOffset` is absent once nothing more matches.

## Finding a symbol

`symbol` reads a table generated from every package's built `.d.ts`, so `file` and `line` point at
the declaration in `packages/<name>/src/`:

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

Import it from `specifier`, and pass a `docs` id to `get` to read what the manual says about it.

A misspelt name answers with an error naming the closest candidates, so a second call can be
right: `unknown symbol 'LoggerFactroy'; did you mean LoggerFactory?`.

A `search` whose query is one identifier the table knows carries the same record beside its hits,
without the signature or the docs.

## Citations

Every id names its source, so an answer is checkable.

| Corpus | Id shape | Example |
|---|---|---|
| `wiki` | `wiki:<path>#<anchor>` | `wiki:references/base/bootstrapping.md#bootchecks` |
| `changelog` | `changelog:<date>-<slug>#<anchor>` | `changelog:2026-09-05-list-response-contract#details` |
| `knowledge` | `okf:<path>#<anchor>` | `okf:packages/boot.md#layout` |
| any | drop `#<anchor>` | `wiki:guides/core-concepts/application/bootstrapping.md` reads the whole document |

## See also

- [Changelog: Atlas gains a symbol tool and a generated symbol table](/changelogs/2026-09-07-atlas-symbols)
- [Changelog: ignis-docs-mcp is replaced by @venizia/ignis-atlas](/changelogs/2026-09-06-ignis-atlas)
