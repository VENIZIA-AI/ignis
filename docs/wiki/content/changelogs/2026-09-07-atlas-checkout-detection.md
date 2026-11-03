---
title: Atlas Recognises the IGNIS Checkout by Its Workspace Manifest
description: Atlas no longer mistakes a repository that copies the docs/wiki and .agents/knowledge layout for the IGNIS checkout, so it starts there instead of exiting.
packages: ['@venizia/ignis-atlas']
---

# Changelog - 2026-09-07

## Atlas starts in any repository again

<Badge type="warning" text="Bug Fix" />

**In one line.** A consumer whose repository carries `docs/wiki/content` and `.agents/knowledge` no longer looks like the IGNIS checkout, so the server serves its packaged snapshot instead of exiting.

## What changed

- **Repository mode needs more evidence.** It now requires all three corpus directories (including the changelog directory) and a root `package.json` named `@venizia/ignis-workspace`. Before, a repository with only the wiki and knowledge directories made the server exit with `ENOENT` on `docs/wiki/content/changelogs`, and the MCP client reported `CONNECTION_CLOSED`.
- **Anywhere else** the server falls through to the corpus packaged with the release.
- **An explicit `--root` that is not a checkout still exits 2** rather than serving the wrong corpus. The error names every marker a checkout needs.
- **Inside the IGNIS checkout** nothing changes.

## Who is affected

- **Anyone running `bunx @venizia/ignis-atlas mcp` outside the IGNIS checkout.** Upgrade and the server starts. No configuration changes.
- **The IGNIS checkout.** No action needed.
