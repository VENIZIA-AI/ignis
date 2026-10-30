---
title: ignis-docs-mcp Is Replaced by @venizia/ignis-atlas
description: The ignis-docs-mcp and ignis-knowledge MCP servers are retired; one package, @venizia/ignis-atlas, answers search and get over the wiki, the changelogs and the knowledge bundle.
packages: ['@venizia/ignis-atlas', '@venizia/ignis-docs']
---

# Changelog - 2026-09-06

## ignis-atlas replaces two MCP servers

<Badge type="warning" text="Behavior Change" />

**In one line.** `ignis-docs-mcp` and `ignis-knowledge` are both gone; `@venizia/ignis-atlas` answers the same questions from one MCP server.

## What changed

- **One server, not two.** `@venizia/ignis-atlas` replaces the `ignis-docs-mcp` bin (from `@venizia/ignis-docs`) and `ignis-knowledge`. It runs in one Bun-only process.
- **Two tools, not thirteen.** `search` and `get` replace `ignis-docs-mcp`'s ten tools and `okf_search`, `okf_list_concepts` and `okf_get_concept`. Use `corpus: "knowledge"` for what those three covered.
- **Better ranking.** Results use BM25 over the wiki, the changelogs and the knowledge bundle, by section. A hit names the exact heading, not just the file.
- **Budgeted reads.** A `search` reply stays under 2,000 characters. `get` pages a chunk at 8,000 characters per call, with a cursor for the rest.
- **Changelogs are searchable again.** `changelog` is its own corpus.

Switch an existing MCP config to the new bin:

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

## Who is affected

- **Anyone with `ignis-docs-mcp` in an MCP config.** Switch the command to the snippet above.
- **Everyone else.** No action needed.

## Details

- Extension page: [Atlas](/extensions/atlas/).
