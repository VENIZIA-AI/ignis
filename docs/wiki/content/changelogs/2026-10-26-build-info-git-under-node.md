---
title: The Build Stamp Reads Its Commit and Branch Under Node
description: "The build stamp read git through Bun.$, so a build run by Node always stamped commit and branch as unspecified. It now uses node:child_process and works under Bun and Node. Affects @venizia/ignis-boot 0.2.0 to 0.4.3."
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-10-26

## The build stamp reads its commit and branch under Node

<Badge type="info" text="Bug Fix" />

**In one line.** When Node ran the build, the stamp's `commit` and `branch` were always `unspecified`. They are now read from git under Node as well as Bun.

## What changed

- **Before.** `BuildInfoResolver` ran `git` through `Bun.$`. Under Node there is no `Bun`, the call threw, and the resolver treated it as "git is not available".
- **After.** It runs `git` with `execFile` from `node:child_process`: no shell, the same on Bun and Node. A nonzero exit (no commit yet, not a repository) and a missing `git` still leave the field `unspecified`.
- **Release.** Affects `@venizia/ignis-boot` `0.2.0` to `0.4.3`.

## Who is affected

- **Your build runs under Node and no CI variable sets the commit or branch.** The stamp now shows both. Nothing to change; rebuild after updating.
- **You build with Bun, or your CI sets `APP_BUILD_COMMIT` and `APP_BUILD_BRANCH`.** Not affected: the variables always won, and Bun always read git.
