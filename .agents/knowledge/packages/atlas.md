---
type: Package
title: atlas
description: MCP server for IGNIS - search and read the wiki, changelogs and knowledge bundle by section, with citations, over stdio JSON-RPC.
resource: packages/atlas
tags: [packages, atlas, mcp, search, retrieval]
---

`@venizia/ignis-atlas` is the MCP server for IGNIS: one process answers "what does the manual
say" over three corpora - the wiki, the changelogs, and the agent-facing knowledge bundle - with a
citation on every answer. It replaces two retired servers, `ignis-docs-mcp`
(`docs/wiki/mcp-server`) and `ignis-knowledge` (`.agents/knowledge-tools`'s `mcp.ts`, now deleted);
see the [changelog](/changelogs/2026-09-06-ignis-atlas).

Position in the chain: `helpers -> atlas`, a leaf like `boot` - nothing in the framework depends on
it. Runtime dependencies: `@venizia/ignis-helpers`, `zod` and `@hono/zod-openapi` - the last one because the helpers root barrel (the only entry that exports `LoggerFactory`) requires it while helpers declares it only as a devDependency; `scripts/atlas-pack-smoke.ts` proves the packed tarball starts in an empty directory, and the release workflow runs it for `atlas`. Single CJS build, no ESM pass -
the package ships one CLI, not an importable runtime surface. Its own `index.ts` re-exports
`common` only (constants and types); `buildServer` and the tools are reached through the CLI, not
imported. Bin `ignis-atlas -> dist/cjs/cli.js` with a `bun` shebang. Bun-only: the index is
`bun:sqlite` FTS5, so a Node consumer cannot run the server.

## Modes

Two modes share one engine, chosen by what `--root` (default `process.cwd()`) looks like.

| Mode | Trigger | Roots | Corpora shipped |
|---|---|---|---|
| repo | `--root` has `docs/wiki/content` and `.agents/knowledge` | the live tree | wiki, changelog, knowledge |
| snapshot | otherwise, when the package directory has `dist/corpus` | the packaged snapshot | wiki, changelog (no knowledge) |

`src/cli/modes.ts`'s `findPackageDirectory` walks up from `__dirname` to the directory whose
`package.json` names `@venizia/ignis-atlas` - never a fixed number of `..` segments, since a
source run starts at `src/` and the built CLI starts at `dist/cjs/`. A root that satisfies neither
mode throws `ModeUsageError`, caught by `cli.ts` and printed as usage (exit 2).

## The index

One FTS5 row per H2/H3 section, chunked from every `.md` file in each corpus root (a fenced code
block is never split). Ranking is `bm25(...) * authority`: title, heading path, body and symbols
carry weights (title highest), frontmatter `description`/`type`/`tags` are indexed too under
`metadata` - deliberately excluding `title`, which already leads every chunk's `headingPath` and
would otherwise double-count. Authority discounts `log.md` (history) and changelog entries below a
canonical page, so a page that only mentions a term does not outrank the page that is about it.
Query planning is AND-first: every term must match, and only when that yields too few rows does a
second, OR pass run and append. A result page keeps at most 2 chunks per document, backfilled from
the next distinct document in rank order - `limit` hits at that stage, before the reply-size
budget below can still trim the page further.

Every chunk id is a citation: `wiki:<path>#<anchor>`, `changelog:<date>-<slug>#<anchor>`,
`okf:<path>#<anchor>`. `get` reads a chunk's full body by that id.

## Budgets

`search` replies stay under 2,000 characters, trimming trailing hits - never `total` - until it
fits. The response carries `returned` (hits actually in this reply) and `nextOffset` (absent when
nothing follows); page with `offset: nextOffset`, not `offset + limit`, so a page the budget
trimmed is never skipped. `get` pages a body at 8,000 characters by default (`maxChars` widens
this to 50,000), returning a base64 offset `cursor` for the next page. Neither tool returns a
whole file uncapped - the two servers this replaces both did; `ignis-knowledge` served one
87,709-character response for a single reference page.

## Freshness

Repo mode fingerprints its roots - file count, newest mtime, total bytes, one `Bun.Glob` walk per
root - before every tool call, and rebuilds the store when it moved. Snapshot mode never rebuilds:
the packaged corpus is immutable for the life of the process.

## Golden test

`src/__tests__/golden/queries.json` fixes a query set against the real repository corpus (364
documents, 4165 chunks, an index build around 265 ms) with the expected chunk in the top 3 and,
where a past regression named a document that must not reappear, a `rejectAnyOf` prefix. 7 of 7
pass; a ranking change that drops one below the top 3 fails the build, not a human eyeballing a
table.

## Constraints the code cannot show

- **Tool wrapping, not tool modification.** `buildServer` wraps `search`/`get` so every `call`
  re-resolves the store through `FreshnessGuard.getStore()`; the tool builders in `src/tools/`
  never know a guard exists.
- **The fingerprint cannot see a pure rename.** Identical bytes, identical mtime, only the path
  changed - nothing in the fingerprint reads the path itself, so the guard skips the rebuild.
  Measured under 1 ms over the real repository roots.
- **`knowledge` is never shipped.** The npm snapshot packages `wiki` and `changelog` only - the
  bundle documents internal process, not something a consumer's agent should search.
- **Diagnostics are stderr-only.** A stdout discipline test asserts the process writes nothing but
  JSON-RPC frames to stdout during `initialize`, `tools/list` and one `search` - a stray
  `console.log` anywhere in the import graph breaks every client's framing, not just the visible
  one.

## Related

- [boot](/packages/boot.md)
- [helpers](/packages/helpers.md)
- [Monorepo layout](/overview/monorepo-layout.md)
