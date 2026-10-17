---
title: Auto Artifacts Build for the Browser
description: "A browser Bun.build of an application using @venizia/ignis-boot/auto no longer fails on node:net - the module a browser bundle reaches no longer loads the helpers barrel."
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-10-17

## Auto artifacts build for the browser

<Badge type="info" text="Bug Fix" />

**In one line.** A frontend that uses `@venizia/ignis-boot/auto` with `IgnisArtifactsPlugin` now builds for the browser.

## What changed

- **No node builtins in the browser path.** The plugin replaces the auto module with one that imports the auto group, and that module took `getError` from the `@venizia/ignis-helpers` root, which loads `node:net` and other builtins. It now takes it from `@venizia/ignis-inversion`, which is browser-clean. `@venizia/ignis-boot` declares `@venizia/ignis-inversion` as a dependency.

## Who is affected

- **Browser applications on `@venizia/ignis-boot/auto`.** Upgrade; the build error `Browser polyfill for module "node:net" doesn't have a matching export named "connect"` is gone.
- **Server applications.** No change.
