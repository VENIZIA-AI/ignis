---
title: Secrets Peers Invisible to Bundlers - No More external node-vault
description: Compiling an app with Bun.build no longer needs node-vault or @dotenvx/dotenvx installed or listed as external; apps that use a vault provider in a compiled binary must ship the peer next to it or inject the client.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-07-17

## Secrets Peers Invisible to Bundlers

<Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Compiling an application with `Bun.build` no longer fails on the optional secrets peers, so `external: ['node-vault']` workarounds can be removed.

## What changed

- **No bundle-time resolution.** `Bun.build` no longer tries to resolve `node-vault` and `@dotenvx/dotenvx`. Before, every app compiling a binary failed unless the peer was installed or listed in `external`.
- **Clear error for a missing peer.** Constructing `HashiCorpVaultHelper` or `DotenvVaultHelper` directly (via `/hashicorp-vault` or `/dotenv-vault`) without the peer now throws the same `ApplicationError` as the factory path (`Please install 'node-vault'`), not a raw module-not-found error.
- **The peer is no longer embedded in compiled binaries.** Before, referencing a vault provider with the peer installed made `Bun.build` bundle it.

## Who is affected

- **Apps that compile binaries without a vault provider.** Fixed for free. Remove any `external: ['node-vault']` entry from your `Bun.build` calls.
- **Apps that compile binaries and use a vault provider.** Ship the peer in `node_modules` next to the binary, or inject a ready-made `client` (HashiCorp) or `decode` (dotenv) through the helper options.
- **Apps that do not compile binaries.** No action needed.
