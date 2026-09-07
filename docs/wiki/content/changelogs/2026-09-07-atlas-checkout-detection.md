---
title: Atlas Recognises the IGNIS Checkout by Its Workspace Manifest
description: A repository that copies the docs/wiki and .agents/knowledge layout was read as an IGNIS checkout, and the server died at startup on the first corpus directory it did not have. Repository mode now also requires the changelog directory and a root package.json named @venizia/ignis-workspace.
---

# Changelog - 2026-09-07

## Atlas starts in any repository again

<Badge type="warning" text="Bug Fix" />

**In one line.** A consumer whose repository carries `docs/wiki/content` and `.agents/knowledge` no longer looks like the IGNIS checkout, so the server serves its packaged snapshot instead of exiting.

```text
$ cd ~/work/my-monorepo && bunx @venizia/ignis-atlas mcp
ignis-atlas: ENOENT: no such file or directory, open '.../docs/wiki/content/changelogs'   # before
```

## The problem it solves

Repository mode was chosen when two directories existed: the wiki content and the knowledge bundle. That is a layout IGNIS invented and its consumers copy. One consumer had both, but no `docs/wiki/content/changelogs`, so the corpus loader threw `ENOENT` before the first JSON-RPC line and the MCP client reported `CONNECTION_CLOSED`. The packaged snapshot beside the binary was never reached.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `isRepositoryCheckout()` | Requires all three corpus directories AND a root `package.json` named `@venizia/ignis-workspace` | atlas |
| `WORKSPACE_PACKAGE_NAME` | New exported constant | atlas |
| `resolveMode()` | The explicit `--root` error names every marker a checkout needs | atlas |

- Inside the IGNIS checkout nothing changes: the manifest matches and every directory is there.
- Anywhere else the server falls through to the corpus packaged with the release, which is what a consumer wants.
- An explicit `--root` that is not a checkout still exits 2 rather than serving the wrong corpus.

## Who is affected

- **Anyone running `bunx @venizia/ignis-atlas mcp` outside the IGNIS checkout.** Upgrade and the server starts. No configuration changes.
- **The IGNIS checkout.** No action needed.
