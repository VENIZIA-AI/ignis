---
title: Atlas serves any VENIZIA family checkout
description: The Atlas MCP server recognises any @venizia/<family>-workspace repository, so a sibling framework can run the same Atlas over its own docs.
packages: ['@venizia/ignis-atlas']
---

# Changelog - 2026-09-11

## Atlas serves any VENIZIA family checkout

<Badge type="tip" text="Enhancement" />

**In one line.** `ignis-atlas` in repo mode now accepts any `@venizia/<family>-workspace` checkout that keeps the three corpora under the IGNIS paths, and announces itself as `<family>-atlas`.

## What changed

- **Any family checkout.** The root manifest may be any `@venizia/<family>-workspace`, with `docs/wiki`, `docs/wiki/content/changelogs` and `.agents/knowledge` present. A scope-mate that is not a workspace (`@venizia/ignis-atlas`) is still refused.
- **The server name follows the checkout.** In repo mode the server reports `<family>-atlas`. In snapshot mode it stays `ignis-atlas`.
- **New helper.** `workspaceFamilyOf({ root })` returns the family name or `undefined`.

## Who is affected

- **IGNIS itself.** No action needed.
- **Sibling frameworks.** Register `bun <path-to-ignis>/packages/atlas/src/cli.ts mcp` (or the published `bunx @venizia/ignis-atlas mcp --root .`) in `.mcp.json`.
