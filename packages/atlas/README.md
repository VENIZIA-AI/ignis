<div align="center">

<br />

# :fire: IGNIS - `@venizia/ignis-atlas`

**MCP server for IGNIS: search the wiki, changelogs and knowledge bundle, look up an exported symbol, and read what changed between two versions.**

[![Docs](https://img.shields.io/badge/Docs-ignis.venizia.ai-2563EB.svg?style=flat-square)](https://ignis.venizia.ai/extensions/atlas)
[![npm](https://img.shields.io/npm/v/@venizia/ignis-atlas.svg?style=flat-square&color=cb3837&label=@venizia/ignis-atlas)](https://www.npmjs.com/package/@venizia/ignis-atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](LICENSE.md)

[Atlas on the wiki](https://ignis.venizia.ai/extensions/atlas) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/2026-09-06-ignis-atlas)

</div>

---

`@venizia/ignis-atlas` answers "what does the manual say" over three corpora - the wiki, the
changelogs and the agent-facing knowledge bundle - with a citation on every hit, over stdio
JSON-RPC.

**Bun-only.** The index runs on `bun:sqlite` FTS5, so a Node host cannot start this server.

## Add it to an MCP client

For a published release, run it with `bunx`:

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

This reads the wiki and the changelogs packaged with the release you installed, not your working
tree.

Working inside the IGNIS monorepo, point `command` at the checkout instead:

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

A checkout also indexes the knowledge bundle, and re-checks the corpus for changes before every
call.

## Tools

### `search`

Search for chunks matching a keyword query, ranked by relevance.

```
search({ query: "hidden fields on write" })
```

```json
{
  "total": 395,
  "returned": 3,
  "hits": [
    {
      "id": "okf:architecture/search-typesense.md#hidden-fields-on-the-write-path",
      "corpus": "knowledge",
      "title": "Hidden fields on the write path",
      "headingPath": "Typesense search connector > Hidden fields on the write path",
      "anchor": "hidden-fields-on-the-write-path",
      "snippet": "... Search write responses therefore used to leak hidden properties ...",
      "score": -16.03
    }
  ]
}
```

| Input | Type | Default |
| :--- | :--- | :--- |
| `query` | string, 2+ characters | required |
| `corpus` | `all`, `wiki`, `changelog`, `knowledge` | `all` |
| `limit` | integer, 1-50 | `10` |
| `offset` | integer, 0+ | `0` |

The reply-size budget can return fewer hits than `limit`. Page with `offset: nextOffset`, not
`offset + limit` - a page the budget trimmed would otherwise be skipped.

### `get`

Read one chunk's body by an id a search hit returned, or a whole document with its `#anchor`
dropped.

```
get({ id: "okf:architecture/search-typesense.md#hidden-fields-on-the-write-path" })
```

```json
{
  "id": "okf:architecture/search-typesense.md#hidden-fields-on-the-write-path",
  "title": "Hidden fields on the write path",
  "headingPath": "Typesense search connector > Hidden fields on the write path",
  "body": "This is the non-derivable one. Reads exclude `@model({ settings: { hiddenProperties } })` at query time via the engine's exclude-fields parameter - but a write response comes back from the write itself and never passes through that filter. ..."
}
```

| Input | Type | Default |
| :--- | :--- | :--- |
| `id` | string, from a search hit | required |
| `maxChars` | integer, 500-50000 | `8000` |
| `cursor` | string, from a previous reply's `next` | start of the body |

A body longer than `maxChars` returns `next`; pass it back as `cursor` for the following page.

### `symbol`

Look up an exported symbol: what it is, where it is declared, and which pages document it.

```
symbol({ name: "getError", package: "inversion" })
```

```json
{
  "name": "getError",
  "package": "@venizia/ignis-inversion",
  "specifier": "@venizia/ignis-inversion",
  "kind": "const",
  "file": "packages/inversion/src/modules/error/app-error.ts",
  "line": 89,
  "signature": "getError: (opts: TError) => ApplicationError",
  "docs": ["okf:conventions/error-handling.md#", "wiki:extensions/helpers/error/index.md#in-one-example"]
}
```

| Input | Type | Default |
| :--- | :--- | :--- |
| `name` | string, the exported name | required |
| `package` | `helpers` or `@venizia/ignis-helpers` | every package |

The table is generated from each package's built declarations, so `file` and `line` name the
source. A name exported from several packages returns `matches`. An unknown name is an error
naming the closest candidates. `docs` ids go straight into `get`.

### `version`

Compare what a project has installed with what this build knows.

```
version({ cwd: "/path/to/your/project" })
```

```json
{
  "installed": { "@venizia/ignis-kernel": "0.2.0-19" },
  "snapshot": { "kernel": "0.2.0-21", "helpers": "0.2.0-15" },
  "behind": [{ "package": "kernel", "installed": "0.2.0-19", "newest": "0.2.0-21" }]
}
```

| Input | Type | Default |
| :--- | :--- | :--- |
| `cwd` | string, a project directory | the process working directory |

`installed` reads the real version out of `node_modules`, never a dependency range; a package it
cannot resolve is `null`. These are the versions this build knows about, not the registry.

### `changes`

List the changelog entries between two versions of a package.

```
changes({ package: "kernel", from: "0.2.0-13", to: "0.2.0-16" })
```

```json
{
  "package": "kernel",
  "from": "0.2.0-13",
  "to": "0.2.0-16",
  "entries": [
    {
      "id": "changelog:2026-09-05-boot-checks",
      "date": "2026-09-05",
      "title": "Boot Checks - Every Binding Resolves ...",
      "kind": "New Feature",
      "packages": ["kernel"]
    }
  ]
}
```

| Input | Type | Default |
| :--- | :--- | :--- |
| `package` | a package directory name | every package |
| `from` | a version of `package`, or a date without one | the newest version released on an earlier day |
| `to` | a version of `package`, or a date without one | the newest known version |

Each `id` reads in full through `get`. A window wider than the reply budget is trimmed to the
newest entries and marked `truncated`.

## `--root`

`--root <dir>` points the server at an IGNIS checkout. Given explicitly, it must be one: the server
exits 2 rather than falling back to the packaged snapshot, which would answer from the wrong corpus.
Without the flag the working directory decides, and a directory that is not a checkout uses the
snapshot packaged with the release.

## Exit codes

| Code | Meaning |
| :--- | :--- |
| `0` | The client closed the connection. |
| `1` | An error during startup, or while running a tool call. |
| `2` | Bad arguments, or neither a checkout nor a packaged snapshot was found. |

## Links

[Documentation](https://ignis.venizia.ai) &#8226;
[Atlas on the wiki](https://ignis.venizia.ai/extensions/atlas) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/2026-09-06-ignis-atlas)

MIT licensed - see [LICENSE.md](LICENSE.md).
Questions: [GitHub Issues](https://github.com/VENIZIA-AI/ignis/issues) &#8226; developer@venizia.ai
