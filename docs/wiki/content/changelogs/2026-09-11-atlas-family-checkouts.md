---
title: Atlas serves any VENIZIA family checkout
description: The MCP server recognises a sibling framework's repository (@venizia/<family>-workspace) and names itself after it, so ARDOR runs the same atlas over its own wiki, changelogs and knowledge bundle.
---

# Changelog - 2026-09-11

## Atlas serves any VENIZIA family checkout

<Badge type="tip" text="Enhancement" />

**In one line.** `ignis-atlas` in repo mode now accepts any `@venizia/<family>-workspace` checkout that keeps the three corpora under the IGNIS paths, and announces itself as `<family>-atlas`.

## What changed

- **Checkout detection follows the family pattern.** `isRepositoryCheckout` accepted only `@venizia/ignis-workspace`; it now accepts any root manifest matching `@venizia/<family>-workspace` with `docs/wiki`, `docs/wiki/content/changelogs` and `.agents/knowledge` present. A scope-mate that is not a workspace (`@venizia/ignis-atlas`) is still refused.
- **The server name follows the checkout.** In repo mode the MCP server reports `<family>-atlas` (`ardor-atlas` in the ARDOR repository); in snapshot mode it stays `ignis-atlas`, because the packaged corpus is always IGNIS's.
- **New helper.** `workspaceFamilyOf({ root })` returns the family name or `undefined`.

## Who is affected

- **IGNIS itself.** No action needed; behavior in this repository is unchanged.
- **ARDOR and future siblings.** Register `bun <path-to-ignis>/packages/atlas/src/cli.ts mcp` (or the published `bunx @venizia/ignis-atlas mcp --root .`) in `.mcp.json`; the server serves that repository's corpora.
