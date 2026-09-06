---
title: ignis-docs-mcp Is Replaced by @venizia/ignis-atlas
description: The local docs MCP server and the internal knowledge MCP are both retired. One new package, @venizia/ignis-atlas, indexes the wiki, the changelogs and the knowledge bundle with SQLite FTS5 and answers search and get over stdio JSON-RPC, with a citation on every hit.
---

# Changelog - 2026-09-06

## ignis-atlas replaces two MCP servers

<Badge type="warning" text="Behavior Change" />

**In one line.** `ignis-docs-mcp` and `ignis-knowledge` are both gone; `@venizia/ignis-atlas` answers the same questions from one MCP server.

Switch an existing MCP config from the old bin to the new one:

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

## The problem it solves

Two servers answered the same kind of question: `ignis-docs-mcp` for the wiki, `ignis-knowledge` for the agent-facing knowledge bundle. Neither shared code with the other, and neither ranked results well. `ignis-docs-mcp`'s fuzzy search returned off-topic pages for most engineering queries. A malformed YAML file in `ignis-knowledge` loaded silently as an empty concept. Cold start took up to 881 ms in `ignis-docs-mcp`, most of it building a fresh search index every run.

## What changed

- **One server, not two.** `@venizia/ignis-atlas` (`packages/atlas`) answers what `ignis-docs-mcp` and `ignis-knowledge` used to answer, from one Bun-only process.
- **Two tools, not thirteen.** `search` and `get` replace `ignis-docs-mcp`'s ten tools and `ignis-knowledge`'s `okf_search`, `okf_list_concepts` and `okf_get_concept`.
- **Ranking uses BM25.** SQLite FTS5 indexes the wiki, the changelogs and the knowledge bundle by section, not by whole file. A hit names the exact heading, not just the file.
- **Every read is budgeted.** A `search` reply stays under 2,000 characters. `get` pages a chunk at 8,000 characters per call, with a cursor for the rest. Neither tool returns a whole file uncapped.
- **Changelogs are searchable again.** `ignis-docs-mcp` excluded them from its index; `atlas` treats `changelog` as its own corpus.

## Who is affected

- **Anyone with `ignis-docs-mcp` in an MCP config.** Switch the command to the snippet above.
- **Maintainers of this repository.** `.mcp.json` now starts `ignis-atlas`. `okf_search`, `okf_list_concepts` and `okf_get_concept` are gone; `search` and `get` replace them, with `corpus: "knowledge"` for what those three used to cover.
- **Everyone else.** No action needed.

## Details

| Symbol | Change | Package |
|---|---|---|
| `ignis-docs-mcp` (bin) | Removed | `@venizia/ignis-docs` |
| `okf_search`, `okf_list_concepts`, `okf_get_concept` | Removed | `.agents/knowledge-tools` |
| `search`, `get` (MCP tools) | New | `@venizia/ignis-atlas` |
| `ignis-atlas` (bin) | New | `@venizia/ignis-atlas` |

- Extension page: [Atlas](/extensions/atlas/).
