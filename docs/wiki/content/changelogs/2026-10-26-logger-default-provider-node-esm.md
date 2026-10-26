---
title: Logging Works Under Node ESM Without Registering a Provider
description: "Under Node ESM the first log with no registered provider threw '__filename is not defined', because the default winston provider was loaded with __filename. The ESM build now defines it. Affects @venizia/ignis-helpers 0.1.1 to 0.4.3."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-10-26

## Logging works under Node ESM without registering a provider

<Badge type="info" text="Bug Fix" />

**In one line.** Under Node, loading `@venizia/ignis-helpers` as ESM and logging before you register a provider used to throw. It now loads the default winston provider.

## What changed

- **Before.** `LoggerFactory` loads winston as the default provider with `createRequire(__filename)`. Node ESM has no `__filename`, so the first log call threw `[LoggerFactory] No logger provider is registered and the default (winston) could not be loaded ... Cause: __filename is not defined`. Bun and the CommonJS build define it, so only Node ESM crashed.
- **After.** The ESM build declares `__filename` and `__dirname` from `import.meta.url` in every emitted file that reads one. No source change in your code.
- **Release.** Affects `@venizia/ignis-helpers` `0.1.1` to `0.4.3`.
- **Requirement.** The ESM default loads winston's module with `require`, which needs Node 22.12 or later (`require` of an ES module). Registering a provider yourself with `LoggerFactory.use({ provider })` never needed it.

## Who is affected

- **You run on Node, import the ESM build, and log without calling `LoggerFactory.use`.** Update. Until then, register a provider at your entrypoint.
- **You run on Bun, or on Node with `require` (CommonJS), or you already register a provider.** Not affected.
