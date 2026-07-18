---
title: Secrets Peers Invisible to Bundlers - No More external node-vault
description: Applications compiling a binary no longer need node-vault or @dotenvx/dotenvx installed, nor an external entry in their Bun.build call. Apps that do use a vault provider in a compiled binary must ship the peer next to the binary or inject the client.
---

# Changelog - 2026-07-17

## Secrets Peers Invisible to Bundlers

<Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Compiling an application with `Bun.build` no longer fails on the optional secrets peers - `external: ['node-vault']` workarounds can be removed.

## What changed

- **`Bun.build` no longer resolves the secrets peers at bundle time.** The literal dynamic imports of `node-vault` and `@dotenvx/dotenvx` were visible to the bundler, so every application compiling a binary failed to resolve them unless the peer was installed or listed in `external`. Both imports now cross the `importOptionalModule` function boundary, which the bundler cannot fold into a resolvable literal - not even under `minify: { syntax: true }`.
- **A missing peer now fails with the standard install hint.** Constructing `HashiCorpVaultHelper` or `DotenvVaultHelper` directly (via the `/hashicorp-vault` and `/dotenv-vault` sub-paths) without the peer installed used to reject with a raw module-not-found error; it now throws the same actionable `ApplicationError` (`Please install 'node-vault'`) as the factory path.
- **The peer is no longer embedded into compiled binaries.** Previously, referencing a vault provider with the peer installed caused `Bun.build` to bundle it. A compiled application that uses a provider must now ship the peer in `node_modules` next to the binary, or inject a ready-made `client` (HashiCorp) / `decode` (dotenv) through the helper options.

## Who is affected

- **Applications that compile binaries and do not use a vault provider.** Fixed for free - remove any `external: ['node-vault']` entry from your `Bun.build` calls after upgrading.
- **Applications that compile binaries and do use a vault provider.** Action needed: ship the peer in `node_modules` next to the binary, or inject the client through the helper options.
- **Applications that do not compile binaries.** No action needed - runtime behavior is unchanged.
