---
title: The release plan re-releases @venizia/ignis when a tool of its preset changes
description: "@venizia/ignis is now released whenever @venizia/ignis-boot or @venizia/dev-configs is, so a project made from the IGNIS preset gets the fixed tool."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-02

## The release plan re-releases @venizia/ignis when a tool of its preset changes

<Badge type="info" text="Bug Fix" />

**In one line.** A project made from the IGNIS preset got the old `@venizia/ignis-boot` or `@venizia/dev-configs` whenever only a tool was released, because `@venizia/ignis` was left out of the release; it is now released with them.

## What changed

- **The preset reads the packed `devDependencies` of `@venizia/ignis`.** When IGNIS packs, the workspace version of each tool is written into them, so the version a new project gets is the one `@venizia/ignis` was packed with.
- **0.4.7-3 showed the gap.** `@venizia/ignis` 0.4.7-3 pinned a `@venizia/ignis-boot` that threw `Bun is not defined` under Node. The next release plan counted only `dependencies`, so it released boot and dev-configs and left `@venizia/ignis` behind: a new project still got the broken boot.
- **The plan now counts those `devDependencies`.** A package that ships presets is released after every tool its packed `devDependencies` list. No other package changes: for them a `devDependency` is never published.

## Who is affected

- **Projects created with `vulcan init --preset ignis` or `vulcan add --preset ignis`.** After the next release of `@venizia/ignis` they get the current tool versions. For a project made before, bump `@venizia/ignis-boot` and `@venizia/dev-configs` to the latest.
- **Everyone else.** No action needed.
