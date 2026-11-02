---
title: The Vite plugin runs under Node again
description: "@venizia/ignis-boot 0.4.7-3 threw 'Bun is not defined' when Vite ran under Node; the scan cache no longer needs Bun, and a test now runs the built plugin under a real Node."
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-11-02

## The Vite plugin runs under Node again

<Badge type="info" text="Bug Fix" />

**In one line.** `vite build` under Node failed with `ReferenceError: Bun is not defined` at `ArtifactScanCache.location` in `@venizia/ignis-boot` 0.4.7-3; the scan cache now hashes with plain arithmetic and works under Node and Bun.

## What changed

- **The scan cache no longer calls `Bun.CryptoHasher`.** 0.4.7-3 hashed the cache file name and the tree fingerprint with it, and `@venizia/ignis-boot/vite` runs inside Vite, which runs under Node. The hash only names a cache file and tells a changed tree from an unchanged one, so it is now a small pure function (128 bits, 32 hex characters) that gives the same text under Node and Bun.
- **Old cache entries miss once.** The file names and the fingerprints are different, so the first build after the upgrade scans again and writes a new entry. Nothing else changes.
- **A test runs the built plugin under a real `node`.** It runs `configResolved` and `load` twice (one scan, one cache read), so a Bun-only call on that path fails the gate.

## Who is affected

- **Apps that run `vite build` or `vite dev` under Node with `@venizia/ignis-boot` 0.4.7-3.** Upgrade; the build works again.
- **Everyone else.** No action needed.

## Details

The error before the fix, from a Vite build under Node:

```text
ReferenceError: Bun is not defined
    at ArtifactScanCache.location
    at ArtifactSources.isCached
    at ArtifactSources.scan
    at IgnisArtifactsPlugin.pinnedClasses
    at configResolved
```
