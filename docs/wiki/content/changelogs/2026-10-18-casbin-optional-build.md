---
title: An Application Without casbin Compiles Again
description: "Bun.build of an application that imports @venizia/ignis but does not install the optional peer casbin no longer fails with Could not resolve: casbin."
packages: ['@venizia/ignis']
---

# Changelog - 2026-10-18

## An application without casbin compiles again

<Badge type="danger" text="Bug Fix" />

**In one line.** `Bun.build` (and `bun build --compile`) of an application that never uses the casbin enforcer no longer needs `external: ['casbin']`.

## What changed

- **casbin is loaded in one place.** Two of the three places that load the optional peer imported it outside a `try`, and Bun's bundler fails on an unresolvable import there. All three now go through one loader that keeps the import inside a `try`, so a build without casbin succeeds, and a build with casbin installed still embeds it. Using the casbin enforcer without casbin installed fails with `"casbin" is not installed`.

## Who is affected

- **Binaries of applications without casbin.** Drop `external: ['casbin']` from the build.
- **Applications using the casbin enforcer.** No change.

**Files:** [`packages/core-server/src/components/auth/authorize/enforcers/casbin-module.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/core-server/src/components/auth/authorize/enforcers/casbin-module.ts)
