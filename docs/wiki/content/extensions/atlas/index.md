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

Pass a `hits[].id` straight to `get` to read the full section it points at.

The reply-size budget can return fewer hits than `limit`. Page with `offset: nextOffset`, not
`offset + limit` - `nextOffset` is absent once nothing more matches.

## Citations

Every id names its source, so an answer is checkable.

| Corpus | Id shape | Example |
|---|---|---|
| `wiki` | `wiki:<path>#<anchor>` | `wiki:references/base/bootstrapping.md#bootchecks` |
| `changelog` | `changelog:<date>-<slug>#<anchor>` | `changelog:2026-09-05-list-response-contract#details` |
| `knowledge` | `okf:<path>#<anchor>` | `okf:packages/boot.md#layout` |
| any | drop `#<anchor>` | `wiki:guides/core-concepts/application/bootstrapping.md` reads the whole document |

## See also

- [Changelog: ignis-docs-mcp is replaced by @venizia/ignis-atlas](/changelogs/2026-09-06-ignis-atlas)
