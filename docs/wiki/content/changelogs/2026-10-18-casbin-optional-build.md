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

- **A build without casbin succeeds.** A build with casbin installed still embeds it. Using the casbin enforcer without casbin installed fails with `"casbin" is not installed`.

## Who is affected

- **Binaries of applications without casbin.** Drop `external: ['casbin']` from the build.
- **Applications using the casbin enforcer.** No change.
