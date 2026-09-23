# @venizia/ignis-atlas

An MCP server that lets an AI agent search and read the IGNIS documentation - the wiki, the
changelogs and the knowledge bundle - and look up exported symbols and versions. Every hit carries
an id the agent can read in full and cite.

You do not import it. You register it with an MCP client (Claude Code, an IDE agent, ...), which
starts it over stdio.

## Register it

Add it to the client's MCP config. `bunx` runs the published release:

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

Inside an IGNIS checkout, run it from source instead. The repository's own `.mcp.json` does this:

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

The server needs Bun: its search index is an in-memory `bun:sqlite` FTS5 table. It has no
dependency on an MCP SDK - it speaks JSON-RPC over stdio itself.

## What it serves

The directory the server starts in decides what it reads.

| Started in | Corpora | Freshness |
|---|---|---|
| An IGNIS checkout | `wiki`, `changelog`, `knowledge` - read from `docs/wiki/content` and `.agents/knowledge` | Re-indexes before a tool call when a file changed |
| Anywhere else | `wiki` and `changelog`, as packaged with the installed release | Fixed at the release |

The knowledge bundle is not shipped in the npm package, so `corpus: "knowledge"` returns nothing
outside a checkout. A checkout of a sibling framework built the same way (its root `package.json`
named `@venizia/<family>-workspace`) is served too, under the name `<family>-atlas`.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search` | `query` (2+ characters), `corpus?` (`all`, `wiki`, `changelog`, `knowledge`), `limit?` (1-50, default 10), `offset?` | A ranked page of hits: `id`, `corpus`, `title`, `headingPath`, `anchor`, `snippet`, `score`; plus `total`, `returned`, and `nextOffset` when more remain |
| `get` | `id` (from a hit), `maxChars?` (500-50000, default 8000), `cursor?` | The section's `body`, with `next` when it continues |
| `symbol` | `name`, `package?` (`helpers` or `@venizia/ignis-helpers`) | Where an exported symbol is declared (`file`, `line`, `signature`, the import `specifier`) and the pages that document it; `matches` when several packages export it |
| `version` | `cwd?` (a project directory) | The IGNIS versions installed there, the newest this release knows, and which are `behind` |
| `changes` | `package?`, `from?`, `to?` (versions, or dates) | The changelog entries between two versions |

Page `search` with `offset: nextOffset`, not `offset + limit`: the reply-size budget can return fewer
hits than `limit`. Pass a hit's `id` to `get` to read the whole section.

## Command line

```bash
ignis-atlas [mcp] [--root <dir>]
```

`--root` names the checkout to serve. When you pass it, the directory must be a checkout - the
server exits rather than falling back to the packaged corpus.

| Exit code | Meaning |
|---|---|
| `0` | The client closed the connection |
| `1` | A failure at startup or while running |
| `2` | Bad arguments, `--root` is not a checkout, or no corpus was found |

## Where it sits

Of the IGNIS packages, it depends on `@venizia/ignis-helpers` only. It is a tool for working on
IGNIS applications, not part of an application's runtime.

## Links

- [Atlas on the wiki](https://ignis.venizia.ai/extensions/atlas)
- [Changelog: IGNIS Atlas](https://ignis.venizia.ai/changelogs/2026-09-06-ignis-atlas)
- [All changelogs](https://ignis.venizia.ai/changelogs/)

MIT licensed - see [LICENSE.md](https://github.com/VENIZIA-AI/ignis/blob/main/packages/atlas/LICENSE.md).
