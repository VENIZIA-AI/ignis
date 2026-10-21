---
title: Atlas
description: The IGNIS MCP server now ships from VULCAN as @venizia/vulcan-atlas - search the wiki, changelogs and knowledge bundle, look up a symbol, diff two versions.
---

# Atlas

The IGNIS MCP server ships from VULCAN, the shared tooling repository. It answers "what does the manual say" over the wiki, the changelogs and the agent-facing knowledge bundle.

`@venizia/ignis-atlas` is **deprecated** and IGNIS no longer releases it. Use `@venizia/vulcan-atlas` instead.

## In one example

Add it to an MCP client's config:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "bun",
      "args": ["x", "@venizia/vulcan-atlas", "mcp"]
    }
  }
}
```

This runs the npm snapshot: the wiki and the changelogs packaged with the release you installed, not your working tree.

Inside the IGNIS repository, `.mcp.json` registers the same server under the name `atlas` and runs it against the checkout with `bun x --no-install vulcan x atlas mcp --root .`. That mode also indexes the knowledge bundle and re-checks the corpus before every call.

## Tools

The five tools are unchanged.

| Tool | Use it for |
|---|---|
| `search` | Find a section by keyword; `corpus` is `all`, `wiki`, `changelog` or `knowledge` |
| `get` | Read one section in full, by the `id` a search hit returned |
| `symbol` | Locate an exported symbol: its package, import specifier, kind, signature and source line |
| `version` | Compare the `@venizia/*` packages installed in a directory with the newest known versions |
| `changes` | List the changelog entries between two versions of a package, or between two dates |

Every hit carries a citation id (`wiki:<path>#<anchor>`, `changelog:<date>-<slug>#<anchor>`, `okf:<path>#<anchor>`) that `get` reads in full.

## See also

- [Changelog: ignis-docs-mcp is replaced by @venizia/ignis-atlas](/changelogs/2026-09-06-ignis-atlas)
- [Changelog: Atlas gains a symbol tool and a generated symbol table](/changelogs/2026-09-07-atlas-symbols)
- [Changelog: Atlas gains version and changes tools and a generated release table](/changelogs/2026-09-07-atlas-versions)
